// Monta o ambiente de ensaio: o .env.ensaio, o banco e o clone dos dados.
//
//   node scripts/ensaio-preparar.mjs             # ensaio geral (Dockerfiles reais)
//   node scripts/ensaio-preparar.mjs --stub      # matriz de cenários
//   node scripts/ensaio-preparar.mjs --do-zero   # tira um dump novo da produção
//
// O .env.ensaio é derivado do .env.SANDBOX, nunca do .env de produção. Não é
// detalhe: o ensaio sobe um worker de verdade, e um worker com as credenciais
// reais mandaria e-mail pelo Resend, gastaria Document AI e debitaria crédito
// de cliente. O sandbox já tem esse conjunto neutralizado e com os espelhos
// NUXT_* em dia — herdar dele é herdar essas duas garantias.
//
// Os DADOS, esses sim, vêm da produção (backups/pre-deploy-*.sql). É o que faz
// o ensaio pegar drift de schema real em vez de só exercitar um banco vazio.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { executar, raizRepo, raizSaas } from './lidimus-update-comum.mjs'
import { verificarEspelhoNuxt } from './sandbox-env.mjs'

const CAMINHO_ENV_SANDBOX = resolve(raizSaas, '.env.sandbox')
const CAMINHO_ENV_ENSAIO = resolve(raizSaas, '.env.ensaio')

export const COMPOSE_GERAL = 'docker-compose.ensaio.yml'
export const COMPOSE_STUB = 'docker-compose.ensaio-stub.yml'
export const PORTA_GERAL = '3200'
export const PORTA_STUB = '3201'

// Botões que a matriz de cenários gira entre uma rodada e outra. Ficam no
// .env.ensaio porque é o único canal de configuração dos containers de stub —
// interpolação ${} no compose faria o Compose ler o .env de PRODUÇÃO.
const PADROES_DO_STUB = {
  ENSAIO_MODO_WEB: 'saudavel',
  ENSAIO_MODO_WORKER: 'saudavel',
  ENSAIO_MIGRACAO: 'aplica',
  ENSAIO_SELECT_PROFUNDO: 'select 1 from plans limit 1',
}

export function gerarEnvEnsaio(porta, botoes = {}) {
  if (!existsSync(CAMINHO_ENV_SANDBOX)) {
    throw new Error('lidimus-saas/.env.sandbox não existe — o .env.ensaio é derivado dele (ver docs/15-sandbox.md)')
  }

  let bruto = readFileSync(CAMINHO_ENV_SANDBOX, 'utf8')

  // Dentro da rede do Compose os hostnames e portas são os mesmos do sandbox
  // (`postgres:5432`, `redis:6379`) — o que muda é só a porta publicada no
  // host, que aparece nas URLs públicas.
  bruto = bruto.replace(/:3100\b/g, `:${porta}`)

  const divergentes = verificarEspelhoNuxt(bruto)
  if (divergentes.length) {
    throw new Error(
      '.env.sandbox está fora de sincronia entre as formas com e sem prefixo NUXT_:\n  '
      + divergentes.join('\n  ') + '\nAcerte os dois lados antes de ensaiar.',
    )
  }

  const config = { ...PADROES_DO_STUB, ...botoes }
  const linhas = Object.entries(config).map(([k, v]) => `${k}=${v}`)

  writeFileSync(CAMINHO_ENV_ENSAIO,
    '# GERADO por scripts/ensaio-preparar.mjs a partir de .env.sandbox.\n'
    + '# Não edite à mão: é reescrito a cada cenário. Não versionado.\n\n'
    + bruto.trimEnd() + '\n\n'
    + '# ---- botões do stub de ensaio ----\n'
    + linhas.join('\n') + '\n',
    'utf8')

  return CAMINHO_ENV_ENSAIO
}

const compose = (arquivo, args, opcoes = {}) => executar(
  'docker', ['compose', '-f', arquivo, '--env-file', '.env.ensaio', ...args],
  { cwd: raizSaas, ...opcoes },
)

export async function subirBanco(arquivo) {
  const r = await compose(arquivo, ['up', '-d', 'postgres', 'redis'], { timeoutMs: 5 * 60 * 1000 })
  if (!r.ok) throw new Error(`não consegui subir o banco do ensaio: ${r.erro || r.saida}`)

  for (let i = 0; i < 40; i++) {
    const pronto = await compose(arquivo, ['exec', '-T', 'postgres', 'pg_isready', '-U', 'lidimus'])
    if (pronto.ok) return
    await new Promise((res) => setTimeout(res, 1500))
  }
  throw new Error('o Postgres do ensaio não ficou pronto')
}

// O dump mais recente já tirado antes de um deploy de produção. Serve melhor
// que um dump de agora para o ensaio noturno: representa o schema no estado
// "antes de aplicar o que está pendente", que é justamente o que vai ser
// exercitado.
export function dumpMaisRecente() {
  const dir = resolve(raizRepo, 'backups')
  if (!existsSync(dir)) return null
  const dumps = readdirSync(dir).filter((n) => /^pre-deploy-.*\.sql$/.test(n)).sort()
  return dumps.length ? resolve(dir, dumps[dumps.length - 1]) : null
}

export async function dumpDaProducao() {
  const r = await executar('docker',
    ['compose', '-f', 'docker-compose.yml', 'exec', '-T', 'postgres', 'pg_dump', '-U', 'lidimus', 'lidimus'],
    { cwd: raizSaas, timeoutMs: 10 * 60 * 1000 })
  if (!r.ok) throw new Error(`pg_dump da produção falhou: ${r.erro}`)

  const destino = resolve(raizRepo, 'tmp', `ensaio-origem-${Date.now()}.sql`)
  writeFileSync(destino, r.saida, 'utf8')
  return destino
}

export async function restaurarBanco(arquivo, caminhoDump) {
  const sql = readFileSync(caminhoDump, 'utf8')

  // FORCE derruba as conexões abertas: sem ele o DROP falha porque o próprio
  // healthcheck do compose mantém sessão no banco.
  const recriar = await compose(arquivo, ['exec', '-T', 'postgres', 'psql', '-U', 'lidimus', '-d', 'postgres', '-f', '-'],
    { entrada: 'drop database if exists lidimus with (force);\ncreate database lidimus owner lidimus;\n' })
  if (!recriar.ok) throw new Error(`não consegui recriar o banco do ensaio: ${recriar.erro || recriar.saida}`)

  const restaurar = await compose(arquivo,
    ['exec', '-T', 'postgres', 'psql', '-U', 'lidimus', '-d', 'lidimus', '-f', '-'],
    { entrada: sql, timeoutMs: 10 * 60 * 1000 })
  // `psql` sem ON_ERROR_STOP devolve 0 mesmo com avisos; o que interessa é o
  // schema ter chegado, e isso é conferido logo abaixo.
  if (!restaurar.ok) throw new Error(`restauração falhou: ${(restaurar.erro || '').slice(-800)}`)

  // SQL por stdin, nunca em `-c`: `executar` roda com `shell: true`, e no
  // cmd.exe os parênteses de `count(*)` são metacaracteres — a linha chegava
  // mutilada ao psql e a conferência devolvia 0 num banco com 26 migrations.
  const conferir = await compose(arquivo,
    ['exec', '-T', 'postgres', 'psql', '-U', 'lidimus', '-d', 'lidimus', '-t', '-A', '-f', '-'],
    { entrada: 'select count(*) from drizzle.__drizzle_migrations;' })
  if (!conferir.ok) throw new Error('o banco restaurado não tem drizzle.__drizzle_migrations')

  return Number(conferir.saida.trim())
}

// ------------------------------------------------------------------- CLI
//
// pathToFileURL, e não um template com `file://`: no Windows o import.meta.url
// tem três barras (`file:///C:/...`) e a comparação ingênua nunca casa — o
// script rodava e não fazia absolutamente nada, em silêncio.
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const ehStub = process.argv.includes('--stub')
  const arquivo = ehStub ? COMPOSE_STUB : COMPOSE_GERAL
  const porta = ehStub ? PORTA_STUB : PORTA_GERAL

  try {
    console.log(`preparando o ensaio (${ehStub ? 'stub' : 'geral'})`)
    gerarEnvEnsaio(porta)
    console.log(`  .env.ensaio gerado a partir de .env.sandbox (porta ${porta})`)

    await subirBanco(arquivo)
    console.log('  postgres e redis de pé')

    const dump = process.argv.includes('--do-zero') ? await dumpDaProducao() : dumpMaisRecente()
    if (!dump) throw new Error('não há dump em backups/ — rode com --do-zero para tirar um da produção')

    const migrations = await restaurarBanco(arquivo, dump)
    console.log(`  banco restaurado de ${dump} (${migrations} migrations no ledger)`)
    console.log('\npronto.')
  } catch (e) {
    console.error(`\n✗ ${e.message}`)
    process.exit(1)
  }
}
