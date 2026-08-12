// Lidimus Update — promove para produção o que foi validado no sandbox.
//
// Chamado pelo update-agent.mjs (que o n8n dispara às 5h) ou à mão:
//   node scripts/lidimus-update.mjs --dry-run
//
// Devolve um relatório JSON na última linha do stdout. Tudo o mais que ele
// imprime é log legível — o agente separa os dois pela marca FIM-DO-RELATORIO.
//
// Duas decisões de ordem que não são óbvias:
//
// 1. O `docker compose build` vem ANTES do push para o GitHub. Este repositório
//    tem 6 arquivos de teste ao todo (croqui e docx), nenhum cobrindo API, auth
//    ou billing — o build do Nuxt é o único gate de qualidade real. Empurrar
//    antes de buildar publicaria um build quebrado.
//
// 2. O build é separado do `up -d`. Era tudo um passo só (`up -d --build`), e
//    por isso um build quebrado só aparecia depois que a produção já tinha
//    parado. Separando, o site velho continua servindo durante os minutos de
//    build e a interrupção real cai para os segundos da recriação.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buscarComRepeticao, carimbo, compararArvores, executar, git, hashArvore,
  lerMarcador, raizRepo, raizSaas, CAMINHO_MARCADOR,
} from './lidimus-update-comum.mjs'

const ehDryRun = process.argv.includes('--dry-run')

// Configurável porque o piso certo depende de onde o disco virtual do Docker
// mora. Com ele no C: (que tem 238 GB e vive cheio) 20 GB é apertado; movido
// para um disco folgado, pode subir.
const ESPACO_MINIMO_GB = Number(process.env.LIDIMUS_ESPACO_MINIMO_GB || 20)
const URL_PROD = 'http://127.0.0.1:3000'
const URL_SANDBOX = 'http://127.0.0.1:3100'
const URL_PUBLICA = 'https://lidimus.gvlar.com'
const COMPOSE = ['compose', '-f', 'docker-compose.yml']

// SQL que não pode rodar sozinho às 5h. O histórico tem casos reais: a
// migration 0015_papeis_equipe faz DELETE FROM organizations e dropa
// users.active_org_id. Encontrando qualquer um destes, o deploy para antes de
// tocar em produção e chama gente.
const SQL_DESTRUTIVO = /\b(drop\s+(table|column|constraint|index|schema|type)|delete\s+from|truncate|set\s+data\s+type|set\s+not\s+null)\b/i

// Nunca commitar, mesmo com a árvore aprovada.
const NUNCA_COMMITAR = /(^|[\\/])(backups[\\/]|\.lidimus[\\/])|\.(sql|pem|key|p12|pfx)$|\.env($|\.)/i

const relatorio = {
  iniciadoEm: new Date().toISOString(),
  concluidoEm: null,
  dryRun: ehDryRun,
  resultado: 'em-andamento',
  fase: null,
  motivo: null,
  aprovacao: null,
  codigo: { commitsAFrente: 0, commits: [] },
  // `verificado` separa "conferi e não achei nada" de "nem cheguei a conferir".
  // Sem essa distinção, um abort no preflight produzia um relatório dizendo
  // "n8n em sincronia" e "nenhuma migration pendente" — duas afirmações que
  // ninguém tinha checado.
  n8n: { verificado: false, divergentes: [], erros: [] },
  migrations: { verificado: false, pendentes: [], aplicadas: false, bloqueadas: false },
  deploy: { imagensBackup: [], dump: null, downtimeSegundos: null },
  smoke: [],
  disco: { livreGbAntes: null, livreGbDepois: null },
  github: { commit: null, empurrado: false },
  erros: [],
}

const log = (msg) => console.log(msg)

function encerrar(resultado, motivo) {
  relatorio.resultado = resultado
  relatorio.motivo = motivo
  relatorio.concluidoEm = new Date().toISOString()
  console.log('FIM-DO-RELATORIO')
  console.log(JSON.stringify(relatorio))
  process.exit(resultado === 'sucesso' || resultado === 'nada-a-fazer' ? 0 : 1)
}

function abortar(fase, motivo) {
  relatorio.fase = fase
  relatorio.erros.push(motivo)
  log(`\n✗ abortado na ${fase}: ${motivo}`)
  encerrar('abortado', motivo)
}

async function docker(args, opcoes = {}) {
  return executar('docker', args, { cwd: raizSaas, ...opcoes })
}

async function consultarBanco(sql) {
  const r = await docker([...COMPOSE, 'exec', '-T', 'postgres',
    'psql', '-U', 'lidimus', '-d', 'lidimus', '-t', '-A', '-c', `"${sql}"`])
  return r.ok ? r.saida.trim() : null
}

async function espacoLivreGb() {
  const r = await executar('powershell', ['-NoProfile', '-Command', '"(Get-PSDrive C).Free"'])
  const bytes = Number(r.saida)
  return Number.isFinite(bytes) ? bytes / 1024 ** 3 : null
}

// ---------------------------------------------------------------- fase 0
async function preflight() {
  relatorio.fase = 'preflight'
  log('— preflight')

  const livre = await espacoLivreGb()
  relatorio.disco.livreGbAntes = livre === null ? null : Number(livre.toFixed(1))
  if (livre !== null && livre < ESPACO_MINIMO_GB) {
    abortar('preflight', `disco com ${livre.toFixed(1)} GB livres (mínimo ${ESPACO_MINIMO_GB} GB) — o build cresceria o disco virtual do Docker até derrubar o Postgres de produção`)
  }
  log(`  disco: ${livre?.toFixed(1)} GB livres`)

  const marcador = lerMarcador()
  if (!marcador) {
    log('  nenhuma aprovação pendente')
    relatorio.concluidoEm = new Date().toISOString()
    encerrar('nada-a-fazer', 'nenhum sandbox aprovado desde o último deploy')
  }
  relatorio.aprovacao = marcador

  const atual = await hashArvore()
  if (atual.hash !== marcador.hashArvore) {
    // Nomear os arquivos importa: quem lê isto às 8h precisa distinguir entre
    // "o editor reformatou um arquivo" e "alguém mexeu no código depois de
    // aprovar" sem ter que ir garimpar no git.
    const mudancas = compararArvores(marcador.arquivos, atual.arquivos)
    abortar('preflight',
      `a árvore mudou depois da aprovação de ${marcador.aprovadoEm}: `
      + `${mudancas.slice(0, 10).join(', ')}${mudancas.length > 10 ? ` e mais ${mudancas.length - 10}` : ''}`
      + ' — valide de novo e rode pnpm sandbox:ok')
  }
  log(`  aprovação: "${marcador.descricao}" (${marcador.commit.slice(0, 7)})`)

  const sandbox = await buscarComRepeticao(`${URL_SANDBOX}/api/health`, { tentativas: 2 })
  if (!sandbox.ok) abortar('preflight', `sandbox não respondeu em ${URL_SANDBOX}/api/health`)
  log('  sandbox saudável')

  const env = await executar('node', ['scripts/verificar-env-producao.mjs', '--json'])
  const envJson = JSON.parse(env.saida || '{}')
  if (!envJson.ok) {
    abortar('preflight', `.env de produção não sustenta este código: ${(envJson.problemas || []).join('; ')}`)
  }
  log('  .env de produção consistente')

  for (const pacote of ['croqui', 'docx']) {
    const t = await executar('pnpm', ['--filter', pacote, 'test'], { timeoutMs: 5 * 60 * 1000 })
    if (!t.ok) abortar('preflight', `testes de ${pacote} falharam:\n${t.saida || t.erro}`)
  }
  log('  testes de croqui e docx passaram')

  // --dry-run e não ls-remote: credencial só de leitura passa no ls-remote e
  // falha no push, já com a produção buildada.
  const push = await git(['push', '--dry-run', 'origin', 'main'], { timeoutMs: 60000 })
  if (!push.ok) {
    abortar('preflight', `git push não está autorizado (o token do gh expira periodicamente): ${push.erro || push.saida}`)
  }
  log('  credencial do GitHub válida para push')

  const emVoo = await consultarBanco("select count(*) from jobs where status in ('pending','queued','processing')")
  if (emVoo === null) abortar('preflight', 'não consegui consultar o banco de produção')
  if (Number(emVoo) > 0) {
    // Durante a recriação do web o callback do n8n leva conexão recusada; o job
    // fica preso e o watchdog estorna o crédito depois do timeout. O cliente
    // perde a análise e o custo de Document AI/Claude já foi gasto.
    abortar('preflight', `${emVoo} job(s) em processamento — adiado para não derrubar callback do n8n em voo`)
  }
  log('  fila vazia')
}

// ---------------------------------------------------------------- fase 1
async function levantarMudancas() {
  relatorio.fase = 'mudancas'
  log('— o que mudou')

  await git(['fetch', 'origin', 'main'], { timeoutMs: 60000 })
  const commits = await git(['log', '--oneline', 'origin/main..HEAD'])
  const linhas = commits.saida.split(/\r?\n/).filter(Boolean)
  relatorio.codigo.commits = linhas
  relatorio.codigo.commitsAFrente = linhas.length

  const sujos = await git(['status', '--porcelain'])
  relatorio.codigo.arquivosNaoCommitados = sujos.saida.split(/\r?\n/).filter(Boolean).length

  log(`  ${linhas.length} commit(s) à frente de origin/main, ${relatorio.codigo.arquivosNaoCommitados} arquivo(s) a commitar`)
}

// ---------------------------------------------------------------- fase 2
async function conferirN8n() {
  relatorio.fase = 'n8n'
  log('— divergência do n8n')

  const r = await executar('node', ['scripts/n8n-diff.mjs', '--json'], { timeoutMs: 120000 })
  try {
    const json = JSON.parse(r.saida)
    relatorio.n8n.divergentes = json.workflows.filter((w) => w.estado === 'divergente')
      .map((w) => ({ arquivo: w.arquivo, nos: w.nos }))
    relatorio.n8n.erros = json.workflows.filter((w) => w.estado === 'erro')
      .map((w) => `${w.arquivo}: ${w.detalhe}`)
  } catch {
    relatorio.n8n.erros = ['não consegui ler o diff do n8n']
  }

  // Divergência é informação, nunca bloqueio: a reconciliação é decisão humana
  // e este passo não escreve em ponta nenhuma.
  relatorio.n8n.verificado = true
  log(`  ${relatorio.n8n.divergentes.length} divergente(s), ${relatorio.n8n.erros.length} erro(s)`)
}

// ---------------------------------------------------------------- fase 3
async function conferirMigrations() {
  relatorio.fase = 'migrations'
  log('— migrations pendentes')

  const journal = JSON.parse(readFileSync(resolve(raizSaas, 'packages/db/drizzle/meta/_journal.json'), 'utf8'))
  const aplicadasEm = await consultarBanco('select coalesce(max(created_at), 0) from drizzle.__drizzle_migrations')
  if (aplicadasEm === null) abortar('migrations', 'não consegui ler drizzle.__drizzle_migrations')

  const marco = Number(aplicadasEm)
  const pendentes = journal.entries.filter((e) => e.when > marco)

  // O migrator ordena por `when`, não por nome, e este journal tem `when`
  // escritos à mão. Uma migration nova com `when` menor que o marco seria
  // pulada em silêncio e o deploy reportaria sucesso.
  const contagem = await consultarBanco('select count(*) from drizzle.__drizzle_migrations')
  const esperadas = journal.entries.filter((e) => e.when <= marco).length
  if (Number(contagem) !== esperadas) {
    abortar('migrations', `o journal tem ${esperadas} migrations até o marco mas o banco registra ${contagem} — alguma foi pulada, confira à mão`)
  }

  relatorio.migrations.pendentes = pendentes.map((e) => e.tag)
  relatorio.migrations.verificado = true
  if (!pendentes.length) {
    log('  nenhuma pendente')
    return
  }

  for (const entrada of pendentes) {
    const caminho = resolve(raizSaas, 'packages/db/drizzle', `${entrada.tag}.sql`)
    if (!existsSync(caminho)) abortar('migrations', `${entrada.tag}.sql está no journal mas não no disco`)
    const sql = readFileSync(caminho, 'utf8')
    if (SQL_DESTRUTIVO.test(sql)) {
      relatorio.migrations.bloqueadas = true
      abortar('migrations', `${entrada.tag} contém SQL destrutivo — aplique à mão, com backup, e rode o deploy depois`)
    }
  }

  log(`  ${pendentes.length} pendente(s), todas aditivas: ${relatorio.migrations.pendentes.join(', ')}`)
}

// ---------------------------------------------------------------- fase 4
async function implantar() {
  relatorio.fase = 'deploy'
  log('— deploy')

  if (ehDryRun) {
    log('  (dry-run: build, migrations e recriação pulados)')
    return
  }

  const marca = carimbo()

  const dirBackups = resolve(raizRepo, 'backups')
  mkdirSync(dirBackups, { recursive: true })
  const caminhoDump = resolve(dirBackups, `pre-deploy-${marca}.sql`)
  const dump = await docker([...COMPOSE, 'exec', '-T', 'postgres', 'pg_dump', '-U', 'lidimus', 'lidimus'],
    { timeoutMs: 10 * 60 * 1000 })
  if (!dump.ok) abortar('deploy', `pg_dump falhou: ${dump.erro}`)
  writeFileSync(caminhoDump, dump.saida, 'utf8')
  relatorio.deploy.dump = caminhoDump
  log(`  dump em backups/pre-deploy-${marca}.sql`)

  // Tag com hora, não só data: as tags `antes-2026-08-11` que existiam foram
  // sobrescritas por um segundo deploy no mesmo dia e o ponto de rollback se
  // perdeu.
  for (const servico of ['web', 'worker']) {
    const origem = `lidimus-saas-${servico}:latest`
    const destino = `lidimus-saas-${servico}:antes-${marca}`
    const t = await docker(['tag', origem, destino])
    if (!t.ok) abortar('deploy', `não consegui marcar ${destino}: ${t.erro}`)
    relatorio.deploy.imagensBackup.push(destino)
  }
  log(`  imagens marcadas para rollback: antes-${marca}`)

  // O passo demorado, com o site velho no ar. Build quebrado morre aqui.
  const build = await docker([...COMPOSE, 'build', 'web', 'worker'], { timeoutMs: 30 * 60 * 1000 })
  if (!build.ok) {
    abortar('deploy', `build falhou — produção intacta:\n${(build.erro || build.saida).slice(-2000)}`)
  }
  log('  build concluído (produção ainda no ar)')

  if (relatorio.migrations.pendentes.length) {
    // Do host o `pnpm db:migrate` não funciona: o .env aponta @postgres:5432,
    // que não resolve no Windows. Dentro do container o hostname resolve e o
    // dotenv vira no-op (o .env não é COPYado na imagem).
    const m = await docker([...COMPOSE, 'exec', '-T', 'web', 'pnpm', '--filter', 'db', 'migrate'],
      { timeoutMs: 10 * 60 * 1000 })
    if (!m.ok) abortar('deploy', `migrations falharam: ${m.erro || m.saida}`)
    relatorio.migrations.aplicadas = true
    log(`  migrations aplicadas: ${relatorio.migrations.pendentes.join(', ')}`)
  }

  // --no-deps é obrigatório: sem ele o Compose reavalia postgres e redis e
  // pode recriar o banco de produção junto.
  const w = await docker([...COMPOSE, 'up', '-d', '--no-deps', 'worker'], { timeoutMs: 5 * 60 * 1000 })
  if (!w.ok) abortar('deploy', `worker não subiu: ${w.erro}`)
  log('  worker recriado')

  const inicio = Date.now()
  const web = await docker([...COMPOSE, 'up', '-d', '--no-deps', 'web'], { timeoutMs: 5 * 60 * 1000 })
  if (!web.ok) abortar('deploy', `web não subiu: ${web.erro}`)

  // Polling direto, não `docker inspect`: o healthcheck do compose tem
  // interval de 30s sem start_interval, então a primeira sonda só roda 30s
  // depois do start — 90s+ para declarar falha.
  const saudavel = await buscarComRepeticao(`${URL_PROD}/api/health`, { tentativas: 60, esperaMs: 1000, timeoutMs: 3000 })
  if (!saudavel.ok) {
    relatorio.deploy.downtimeSegundos = Math.round((Date.now() - inicio) / 1000)
    return { falhou: 'o web não ficou saudável em 60s' }
  }
  relatorio.deploy.downtimeSegundos = Math.round((Date.now() - inicio) / 1000)
  log(`  web recriado e saudável (${relatorio.deploy.downtimeSegundos}s)`)

  return {}
}

// ---------------------------------------------------------------- fase 5
async function smoke() {
  relatorio.fase = 'smoke'
  log('— smoke tests')

  const testes = []

  const raso = await buscarComRepeticao(`${URL_PROD}/api/health`, { tentativas: 3 })
  testes.push({ nome: 'health raso', ok: raso.ok && raso.corpo.includes('"ok"') })

  // O que realmente importa: monta SQL a partir do schema do Drizzle, então
  // pega o caso "código novo contra schema velho" — que o health raso aprova.
  const profundo = await buscarComRepeticao(`${URL_PROD}/api/health?profundo=1`, { tentativas: 3 })
  testes.push({ nome: 'health profundo (lê tabelas reais)', ok: profundo.ok && profundo.corpo.includes('"ok"') })

  // Pelo túnel: valida também o cloudflared. Com repetição longa porque
  // durante a recriação ele registra `no such host` e `connection refused`
  // transitórios, que não são motivo de rollback.
  const publico = await buscarComRepeticao(URL_PUBLICA, { tentativas: 15, esperaMs: 3000, timeoutMs: 15000 })
  testes.push({ nome: 'site público pelo túnel', ok: publico.ok && /Lidimus/i.test(publico.corpo) })

  const estadoWeb = await docker(['inspect', '-f', '{{.State.Running}}', 'lidimus-saas-web-1'])
  testes.push({ nome: 'container web rodando', ok: estadoWeb.saida.trim() === 'true' })

  const estadoWorker = await docker(['inspect', '-f', '{{.State.Running}}', 'lidimus-saas-worker-1'])
  testes.push({ nome: 'container worker rodando', ok: estadoWorker.saida.trim() === 'true' })

  relatorio.smoke = testes
  for (const t of testes) log(`  ${t.ok ? '✓' : '✗'} ${t.nome}`)

  return testes.every((t) => t.ok)
}

// ---------------------------------------------------------------- fase 6
async function reverter() {
  relatorio.fase = 'rollback'

  // Retagear com migration aplicada colocaria código velho contra schema novo
  // — às vezes pior que a falha original. E restaurar o dump apagaria tudo que
  // foi escrito desde ele. Nesse caso a máquina para e chama gente.
  if (relatorio.migrations.aplicadas) {
    log('\n✗ smoke falhou COM migration aplicada — rollback automático proibido')
    encerrar('intervencao-manual',
      `smoke falhou depois de aplicar ${relatorio.migrations.pendentes.join(', ')}. `
      + `Rollback automático colocaria código velho contra schema novo. Dump em ${relatorio.deploy.dump}`)
  }

  log('\n— rollback')
  for (const backup of relatorio.deploy.imagensBackup) {
    const servico = backup.includes('-web:') ? 'web' : 'worker'
    await docker(['tag', backup, `lidimus-saas-${servico}:latest`])
  }
  const r = await docker([...COMPOSE, 'up', '-d', '--no-deps', '--force-recreate', 'web', 'worker'],
    { timeoutMs: 5 * 60 * 1000 })
  const voltou = await buscarComRepeticao(`${URL_PROD}/api/health`, { tentativas: 60, esperaMs: 1000, timeoutMs: 3000 })

  log(voltou.ok ? '  produção restaurada na versão anterior' : '  ATENÇÃO: rollback não restaurou a saúde')
  encerrar('rollback', voltou.ok
    ? 'smoke falhou; produção restaurada na imagem anterior'
    : `smoke falhou e o rollback também (${r.erro || 'health não voltou'}) — produção precisa de socorro`)
}

// ---------------------------------------------------------------- fase 7
async function publicarNoGithub() {
  relatorio.fase = 'github'
  log('— GitHub')

  if (ehDryRun) {
    log('  (dry-run: commit e push pulados)')
    return
  }

  const sujo = await git(['status', '--porcelain'])
  if (!sujo.saida.trim() && !relatorio.codigo.commitsAFrente) {
    log('  nada a publicar')
    return
  }

  if (sujo.saida.trim()) {
    await git(['add', '-A'])

    // A árvore já foi aprovada e conferida por hash, então o -A é seguro para
    // o CÓDIGO. O que não pode passar de jeito nenhum é o dump do banco ou uma
    // chave — daí a segunda peneira.
    const staged = await git(['diff', '--cached', '--name-only'])
    const proibidos = staged.saida.split(/\r?\n/).filter((f) => f && NUNCA_COMMITAR.test(f))
    if (proibidos.length) {
      await git(['reset'])
      abortar('github', `arquivos que nunca podem ser commitados entraram no stage: ${proibidos.join(', ')}`)
    }

    const mensagem = `feat(deploy): promove sandbox validado em ${new Date().toLocaleDateString('pt-BR')}

${relatorio.aprovacao.descricao}

Aprovado em ${relatorio.aprovacao.aprovadoEm} por ${relatorio.aprovacao.aprovadoPor}.
Deploy automatico pelo Lidimus Update.`

    const c = await git(['commit', '-m', JSON.stringify(mensagem)])
    if (!c.ok) abortar('github', `commit falhou: ${c.erro || c.saida}`)
    const sha = await git(['rev-parse', 'HEAD'])
    relatorio.github.commit = sha.saida.slice(0, 7)
    log(`  commit ${relatorio.github.commit}`)
  }

  const p = await git(['push', 'origin', 'main'], { timeoutMs: 5 * 60 * 1000 })
  if (!p.ok) abortar('github', `push falhou (produção já está no ar com o código novo): ${p.erro || p.saida}`)
  relatorio.github.empurrado = true
  log('  push concluído')
}

// ---------------------------------------------------------------- fase 8
async function limpar() {
  relatorio.fase = 'limpeza'
  if (!ehDryRun) {
    await docker(['image', 'prune', '-f'], { timeoutMs: 5 * 60 * 1000 })
    await docker(['builder', 'prune', '--keep-storage=10GB', '-f'], { timeoutMs: 10 * 60 * 1000 })
  }
  const livre = await espacoLivreGb()
  relatorio.disco.livreGbDepois = livre === null ? null : Number(livre.toFixed(1))
  log(`— limpeza: ${livre?.toFixed(1)} GB livres`)
}

// ---------------------------------------------------------------- roteiro
try {
  log(ehDryRun ? 'Lidimus Update (dry-run)\n' : 'Lidimus Update\n')

  await preflight()
  await levantarMudancas()
  await conferirN8n()
  await conferirMigrations()

  const problemaNoDeploy = await implantar()

  if (!ehDryRun) {
    if (problemaNoDeploy?.falhou) {
      relatorio.erros.push(problemaNoDeploy.falhou)
      await reverter()
    }
    if (!(await smoke())) await reverter()
  }

  await publicarNoGithub()

  // A aprovação vale para um deploy só. Sem isto, uma falha de rede amanhã
  // faria a automação reempurrar o mesmo estado como se fosse novidade.
  if (!ehDryRun && existsSync(CAMINHO_MARCADOR)) {
    writeFileSync(CAMINHO_MARCADOR + '.aplicado', readFileSync(CAMINHO_MARCADOR))
    const { unlinkSync } = await import('node:fs')
    unlinkSync(CAMINHO_MARCADOR)
  }

  await limpar()
  encerrar('sucesso', null)
} catch (e) {
  relatorio.erros.push(String(e?.stack || e))
  abortar(relatorio.fase || 'desconhecida', String(e?.message || e))
}
