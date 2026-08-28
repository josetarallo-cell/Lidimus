// A matriz de cenários do Lidimus Update.
//
//   pnpm ensaio                      roda a matriz inteira
//   pnpm ensaio -- --cenario=nome    roda um só
//   pnpm ensaio -- --listar          lista os cenários
//   pnpm ensaio -- --manter          não derruba a stack no fim
//
// Cada cenário coloca o sistema num estado conhecido, roda o pipeline de deploy
// DE VERDADE (`lidimus-update.mjs --alvo=ensaio`, o mesmo arquivo que sobe a
// produção às 5h) e afere duas coisas: o relatório que o WhatsApp mostraria, e
// o estado em que a stack ficou depois.
//
// As duas aferições importam, e a segunda é a que faltava. Em 27/08/2026 o
// relatório disse "migrations aplicadas: 0025_autenticidade" quando nenhuma
// tinha sido aplicada; um teste que só lesse o relatório teria dado ✓ para a
// falha que derrubou a produção por nove horas.
//
// Tudo acontece sobre uma CÓPIA da árvore em C:\tmp\lidimus-ensaio\repo, com um
// bare repo local no lugar do GitHub. Assim os cenários podem quebrar o build,
// forjar migrations e commitar de verdade sem que nada disso encoste no
// repositório real nem no GitHub.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { executar, raizRepo, raizSaas } from './lidimus-update-comum.mjs'
import { gerarEnvEnsaio, subirBanco, COMPOSE_STUB, PORTA_STUB } from './ensaio-preparar.mjs'
import { CENARIOS } from '../ensaio/cenarios.mjs'

const RAIZ = process.env.LIDIMUS_ENSAIO_DIR || 'C:\\tmp\\lidimus-ensaio'
const COPIA = resolve(RAIZ, 'repo')
const COPIA_SAAS = resolve(COPIA, 'lidimus-saas')
const ORIGEM = resolve(RAIZ, 'origin.git')
const URL_STUB = `http://127.0.0.1:${PORTA_STUB}`
const COMPOSE = ['compose', '-f', COMPOSE_STUB, '--env-file', '.env.ensaio']

// Token de mentira, com o tamanho que o agente exige. O .env da cópia existe só
// para o pipeline conseguir montar links de aprovação — nenhum segredo real
// entra aqui.
const ENV_FALSO = [
  '# .env sintético da cópia de ensaio. Nenhum segredo real.',
  `LIDIMUS_UPDATE_TOKEN=${'e'.repeat(48)}`,
  'LIDIMUS_APROVAR_URL=http://127.0.0.1:59998/webhook/lidimus-aprovar',
  'DATABASE_URL=postgres://lidimus:lidimus@postgres:5432/lidimus',
  'REDIS_URL=redis://redis:6379',
  '',
].join('\n')

// O que todo cenário recebe. Um cenário sobrescreve o que precisa perturbar.
const ENV_BASE = {
  LIDIMUS_ENSAIO_COMPOSE: COMPOSE_STUB,
  LIDIMUS_ENSAIO_URL_WEB: URL_STUB,
  // A matriz é autossuficiente: o gate do sandbox aponta para a própria stack de
  // stub, não para o sandbox de verdade na 3100. Rodar a matriz não pode
  // depender de o desenvolvedor estar com o sandbox de pé.
  LIDIMUS_ENSAIO_URL_SANDBOX: URL_STUB,
  // Prefixo próprio: a limpeza da matriz não pode apagar a imagem `candidato`
  // que o ensaio geral selou para a produção promover às 5h.
  LIDIMUS_ENSAIO_IMAGEM: 'lidimus-ensaio-stub',
  PORTA_WEB_SANDBOX: PORTA_STUB,
  LIDIMUS_ENSAIO_TESTES: '0',
  LIDIMUS_ENSAIO_VERIFICA_ENV: '0',
  LIDIMUS_ENSAIO_ESPACO_MINIMO_GB: '1',
  // Estes dois são `false` no ensaio noturno (que não pode consumir a aprovação
  // da produção nem empurrar nada) e `true` aqui, porque consumo de marcador e
  // publicação são justamente duas das coisas que a matriz precisa exercitar.
  LIDIMUS_ENSAIO_CONSOME_MARCADOR: '1',
  LIDIMUS_ENSAIO_PUBLICA_GITHUB: '1',
}

const argumento = (nome) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`))
  return achado ? achado.slice(nome.length + 3) : null
}

const docker = (args, opcoes = {}) => executar('docker', args, { cwd: COPIA_SAAS, ...opcoes })
const git = (args, opcoes = {}) => executar('git', args, { cwd: COPIA, ...opcoes })

async function sql(texto) {
  const r = await docker([...COMPOSE, 'exec', '-T', 'postgres',
    'psql', '-U', 'lidimus', '-d', 'lidimus', '-t', '-A', '-f', '-'], { entrada: texto })
  if (!r.ok) throw new Error(`SQL falhou: ${(r.erro || r.saida).slice(-300)}`)
  return r.saida.trim()
}

async function saude() {
  try {
    const resposta = await fetch(`${URL_STUB}/api/health`, { signal: AbortSignal.timeout(4000) })
    return { status: resposta.status, corpo: await resposta.json() }
  } catch (e) {
    return { status: 0, corpo: null, erro: String(e.message) }
  }
}

// ------------------------------------------------------------------ montagem
async function montarCopia() {
  mkdirSync(RAIZ, { recursive: true })

  // robocopy e não uma cópia em Node: são milhares de arquivos, e /MIR faz o
  // ressincronismo incremental nas rodadas seguintes.
  const r = await executar('robocopy', [
    `"${raizRepo}"`, `"${COPIA}"`, '/MIR',
    '/XD', 'node_modules', '.git', '.nuxt', '.output', 'dist', 'tmp', 'backups', '.lidimus', '.impeccable',
    '/XF', '*.log',
    '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1',
  ], { cwd: raizRepo, timeoutMs: 10 * 60 * 1000 })

  // robocopy usa códigos de saída como bitmask: abaixo de 8 é sucesso (0 = nada
  // mudou, 1 = copiou, 2 = extras removidos, 3 = os dois...). Só >= 8 é erro.
  if (r.codigo >= 8) throw new Error(`robocopy falhou (${r.codigo}): ${r.erro || r.saida}`)

  writeFileSync(resolve(COPIA_SAAS, '.env'), ENV_FALSO, 'utf8')

  // Um bare repo local no lugar do GitHub: a fase 7 empurra de verdade, com o
  // mesmo comando, e nada sai desta máquina.
  if (!existsSync(ORIGEM)) {
    const b = await executar('git', ['init', '--bare', `"${ORIGEM}"`], { cwd: RAIZ })
    if (!b.ok) throw new Error(`não consegui criar o bare repo: ${b.erro}`)
  }

  if (!existsSync(resolve(COPIA, '.git'))) {
    await git(['init', '-b', 'main'])
    await git(['config', 'user.email', 'ensaio@lidimus.local'])
    await git(['config', 'user.name', 'Ensaio Lidimus'])
    await git(['remote', 'add', 'origin', `"${ORIGEM}"`])
  }

  await git(['add', '-A'])
  // Aspas obrigatórias: `executar` roda com `shell: true`, e sem elas o cmd.exe
  // parte "base do ensaio" em três argumentos — o git lê `-m base` e trata o
  // resto como pathspec.
  const c = await git(['commit', '-m', '"base do ensaio"', '--allow-empty'])
  if (!c.ok && !/nothing to commit/i.test(c.saida)) {
    throw new Error(`não consegui commitar a base da cópia: ${c.erro || c.saida}`)
  }

  const p = await git(['push', '-u', '--force', 'origin', 'main'])
  if (!p.ok) throw new Error(`não consegui empurrar a base para o bare repo: ${p.erro || p.saida}`)

  const base = await git(['rev-parse', 'HEAD'])
  if (!base.ok) throw new Error(`a cópia ficou sem commit base: ${base.erro}`)
  return base.saida.trim()
}

// A imagem "anterior": o que está no ar quando o cenário começa. É a diferença
// entre ela e a "candidata" que prova se o rollback voltou de verdade.
//
// Construída UMA vez por rodada. Reconstruí-la a cada cenário custava um
// `FROM node:20-alpine` por cenário, e o BuildKit consulta o registry para
// resolver a tag — foi assim que a primeira rodada completa morreu no cenário
// 18, com timeout do Docker Hub. A matriz não pode depender da rede 19 vezes
// para testar coisa nenhuma de rede.
const IMAGEM_BASE = 'lidimus-ensaio-base:latest'
const IMAGENS_DO_STUB = ['lidimus-ensaio-stub-web:latest', 'lidimus-ensaio-stub-worker:latest']

async function construirLinhaDeBase() {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const b = await docker(['build', '--build-arg', 'ENSAIO_VERSAO=anterior',
      '-t', IMAGEM_BASE, '-f', 'ensaio/Dockerfile.stub', '.'],
    { timeoutMs: 10 * 60 * 1000 })
    if (b.ok) return
    if (tentativa === 3) throw new Error(`build da linha de base falhou: ${(b.erro || b.saida).slice(-800)}`)
    console.log(`  build da linha de base falhou (tentativa ${tentativa}/3) — repetindo em 15s`)
    await new Promise((r) => setTimeout(r, 15000))
  }
}

async function subirLinhaDeBase() {
  for (const imagem of IMAGENS_DO_STUB) {
    const t = await docker(['tag', IMAGEM_BASE, imagem])
    if (!t.ok) throw new Error(`não consegui marcar ${imagem}: ${t.erro}`)
  }

  const up = await docker([...COMPOSE, 'up', '-d', '--force-recreate', 'web', 'worker'],
    { timeoutMs: 5 * 60 * 1000 })
  if (!up.ok) throw new Error(`não consegui subir a linha de base: ${up.erro}`)

  for (let i = 0; i < 30; i++) {
    const s = await saude()
    if (s.corpo?.versao === 'anterior') return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('a linha de base não ficou saudável na versão "anterior"')
}

async function reiniciarEstado(base, marco) {
  // Árvore: volta ao commit base e joga fora o que o cenário anterior criou.
  // Sem -x de propósito: os arquivos ignorados (.env, .env.sandbox, .env.ensaio)
  // precisam sobreviver.
  await git(['reset', '--hard', base])
  await git(['clean', '-fd'])
  await git(['remote', 'set-url', 'origin', `"${ORIGEM}"`])
  await git(['push', '--force', 'origin', 'main'])

  // Estado do Lidimus Update: marcador, selos, publicação pendente.
  rmSync(resolve(COPIA, '.lidimus'), { recursive: true, force: true })

  // Banco: desfaz o que os cenários de migration criaram.
  await sql([
    "delete from jobs where status in ('pending','queued','processing');",
    `delete from drizzle.__drizzle_migrations where created_at > ${marco};`,
    'alter table plans drop column if exists ensaio_marca;',
    'drop table if exists ensaio_lixo;',
  ].join('\n'))

  gerarEnvEnsaioNaCopia()
  await subirLinhaDeBase()
}

// O .env.ensaio vive na cópia, não no repositório real: é ele que o compose da
// cópia lê.
function gerarEnvEnsaioNaCopia(botoes = {}) {
  const gerado = gerarEnvEnsaio(PORTA_STUB, botoes)
  writeFileSync(resolve(COPIA_SAAS, '.env.ensaio'), readFileSync(gerado, 'utf8'), 'utf8')
}

const DIR_LOGS = resolve(raizSaas, '..', 'tmp', 'ensaio')

function gravarLogDaFalha(nome, falhas, saida) {
  try {
    mkdirSync(DIR_LOGS, { recursive: true })
    const cabecalho = [
      `cenario: ${nome}`,
      ...falhas.map((f) => `  - ${f}`),
      '',
      '='.repeat(60),
      '',
    ]
    writeFileSync(resolve(DIR_LOGS, `${nome}.log`), cabecalho.join('\n') + (saida || ''), 'utf8')
  } catch (e) {
    console.log(`    (nao consegui gravar o log da falha: ${e.message})`)
  }
}

// --------------------------------------------------------------- a execução
function extrairRelatorio(saida) {
  const marca = saida.lastIndexOf('FIM-DO-RELATORIO')
  if (marca === -1) return null
  try {
    return JSON.parse(saida.slice(marca + 'FIM-DO-RELATORIO'.length).trim())
  } catch {
    return null
  }
}

async function rodarCenario(cenario, base, marco) {
  const ctx = {
    copia: COPIA, copiaSaas: COPIA_SAAS, origem: ORIGEM, url: URL_STUB, marco,
    sql, git, docker, saude,
    escrever: (rel, conteudo) => {
      const destino = resolve(COPIA, rel)
      mkdirSync(resolve(destino, '..'), { recursive: true })
      writeFileSync(destino, conteudo, 'utf8')
    },
    botoes: (obj) => gerarEnvEnsaioNaCopia(obj),
    // O hash que o marcador de aprovação gravou — é por ele que o selo do
    // ensaio é considerado válido ou desatualizado.
    hashDaArvore: () =>
      JSON.parse(readFileSync(resolve(COPIA, '.lidimus/sandbox-aprovado.json'), 'utf8')).hashArvore,
    selo: (nome, dados) => {
      mkdirSync(resolve(COPIA, '.lidimus'), { recursive: true })
      writeFileSync(resolve(COPIA, '.lidimus', nome), JSON.stringify(dados, null, 2) + '\n', 'utf8')
    },
    // Uma imagem com identidade própria, para provar que a promoção usou ELA e
    // não o produto de um build novo (que se identifica como "candidata").
    imagemSelada: async (versao) => {
      const imagens = {}
      for (const papel of ['web', 'worker']) {
        const tag = `lidimus-ensaio-stub-${papel}:${versao}`
        const b = await docker(['build', '--build-arg', `ENSAIO_VERSAO=${versao}`,
          '-t', tag, '-f', 'ensaio/Dockerfile.stub', '.'], { timeoutMs: 10 * 60 * 1000 })
        if (!b.ok) throw new Error(`não consegui construir ${tag}: ${(b.erro || b.saida).slice(-400)}`)
        imagens[papel] = tag
      }
      return imagens
    },
    aprovar: async (descricao) => {
      // Pela porta de verdade: o mesmo sandbox-ok.mjs que você roda no teclado,
      // que confere a saúde do sandbox e grava o hash da árvore. Forjar o
      // marcador à mão deixaria de testar exatamente o gate que mais aborta.
      const r = await executar('node', ['scripts/sandbox-ok.mjs', `"${descricao}"`], {
        cwd: COPIA_SAAS,
        env: { PORTA_WEB_SANDBOX: PORTA_STUB },
      })
      if (!r.ok) throw new Error(`não consegui aprovar na cópia: ${r.erro || r.saida}`)
    },
    // Uma migration inventada, adicionada ao journal da CÓPIA. Melhor que
    // rebobinar o banco: o estado fica sob controle total e é repetível.
    migracao: async ({ tag = '9999_ensaio', sql: corpo, when }) => {
      const caminhoJournal = resolve(COPIA_SAAS, 'packages/db/drizzle/meta/_journal.json')
      const journal = JSON.parse(readFileSync(caminhoJournal, 'utf8'))
      const quando = when ?? marco + 1000
      journal.entries.push({ idx: journal.entries.length, version: '7', when: quando, tag, breakpoints: true })
      writeFileSync(caminhoJournal, JSON.stringify(journal, null, 2), 'utf8')
      if (corpo !== null) {
        writeFileSync(resolve(COPIA_SAAS, 'packages/db/drizzle', `${tag}.sql`), corpo, 'utf8')
      }
      return quando
    },
  }

  if (cenario.preparar) await cenario.preparar(ctx)

  const r = await executar('node', ['scripts/lidimus-update.mjs', '--alvo=ensaio'], {
    cwd: COPIA_SAAS,
    env: { ...ENV_BASE, ...(cenario.env || {}) },
    timeoutMs: 15 * 60 * 1000,
  })

  const saidaCompleta = `${r.saida}\n${r.erro}`
  const relatorio = extrairRelatorio(saidaCompleta)
  if (!relatorio) {
    return { falhas: ['o pipeline não devolveu relatório legível'], saida: saidaCompleta.slice(-2000) }
  }

  const falhas = []
  const { espera } = cenario

  if (relatorio.resultado !== espera.resultado) {
    falhas.push(`resultado: esperava "${espera.resultado}", veio "${relatorio.resultado}" (${relatorio.motivo})`)
  }
  if (espera.fase && relatorio.fase !== espera.fase) {
    falhas.push(`fase: esperava "${espera.fase}", veio "${relatorio.fase}"`)
  }
  if (espera.erro) {
    const texto = [relatorio.motivo, ...(relatorio.erros || [])].join('\n')
    if (!espera.erro.test(texto)) falhas.push(`nenhum erro casou com ${espera.erro}; veio: ${texto.slice(0, 300)}`)
  }

  if (cenario.conferir) {
    try {
      falhas.push(...(await cenario.conferir(ctx, relatorio) || []))
    } catch (e) {
      falhas.push(`a conferência estourou: ${e.message}`)
    }
  }

  return { falhas, relatorio, saida: saidaCompleta }
}

// ------------------------------------------------------------------- roteiro
const escolhido = argumento('cenario')
const aRodar = escolhido ? CENARIOS.filter((c) => c.nome === escolhido) : CENARIOS

if (process.argv.includes('--listar')) {
  for (const c of CENARIOS) console.log(`${c.nome.padEnd(34)} ${c.descricao}`)
  process.exit(0)
}

if (!aRodar.length) {
  console.error(`cenário desconhecido: "${escolhido}". Use --listar para ver os nomes.`)
  process.exit(1)
}

console.log(`Matriz de cenários do Lidimus Update — ${aRodar.length} cenário(s)\n`)

const inicio = Date.now()
const resultados = []
let interrompida = false

try {
  console.log('montando a cópia da árvore…')
  const base = await montarCopia()
  console.log(`  cópia em ${COPIA} (base ${base.slice(0, 7)})`)

  gerarEnvEnsaioNaCopia()

  // subirBanco e não um `up -d` solto: o `up` volta quando o container arranca,
  // não quando o Postgres aceita conexão. Enquanto a stack ficava de pé entre
  // rodadas isso passou despercebido; assim que a limpeza no fim passou a
  // funcionar de verdade, a rodada seguinte começou a morrer no primeiro SQL.
  await subirBanco(COMPOSE_STUB)

  const marco = Number(await sql('select coalesce(max(created_at), 0) from drizzle.__drizzle_migrations;'))
  if (!marco) throw new Error('o banco do ensaio está vazio — rode `pnpm ensaio:preparar --stub` primeiro')
  console.log(`  banco do ensaio no marco ${marco}`)

  await construirLinhaDeBase()
  console.log('  imagem da linha de base pronta\n')

  for (const cenario of aRodar) {
    process.stdout.write(`${cenario.nome.padEnd(36)}`)
    const t = Date.now()

    await reiniciarEstado(base, marco)
    const { falhas, saida } = await rodarCenario(cenario, base, marco)

    const segundos = Math.round((Date.now() - t) / 1000)
    resultados.push({ nome: cenario.nome, falhas, saida, segundos })
    console.log(falhas.length ? `✗ ${segundos}s` : `✓ ${segundos}s`)
    for (const f of falhas) console.log(`    ${f}`)

    // A saida vai para o disco NA HORA, nao no fim da rodada. Uma matriz
    // interrompida no meio (a sessao caiu, alguem apertou Ctrl+C) levava junto a
    // unica evidencia do que deu errado, e o cenario tinha que ser reproduzido
    // do zero so para ser investigado.
    if (falhas.length) gravarLogDaFalha(cenario.nome, falhas, saida)
  }
} catch (e) {
  // Sem `process.exit` aqui: ele encerra o processo na hora e o `finally` abaixo
  // não chega a terminar o `compose down`. Na primeira rodada completa foi
  // exatamente isso — a stack ficou de pé com o Compose no meio de um down, e a
  // rodada seguinte esperou 5 min por um `up` que nunca destravava.
  console.error(`\n✗ a matriz não pôde rodar: ${e.message}`)
  interrompida = true
} finally {
  if (!process.argv.includes('--manter')) {
    await docker([...COMPOSE, 'down'], { timeoutMs: 5 * 60 * 1000 })
    // As tags `antes-*` de cada cenário acumulariam no mesmo disco cujo piso o
    // preflight protege.
    const imagens = await docker(['images', '--format', '{{.Repository}}:{{.Tag}}'])
    const lixo = imagens.saida.split(/\r?\n/)
      .filter((i) => /^lidimus-ensaio-stub-/.test(i) || i === IMAGEM_BASE)
    if (lixo.length) await docker(['rmi', '-f', ...lixo])
  }
}

if (interrompida) process.exit(1)

const falhos = resultados.filter((r) => r.falhas.length)
const minutos = Math.round((Date.now() - inicio) / 6000) / 10

console.log(`\n${resultados.length - falhos.length}/${resultados.length} cenários verdes em ${minutos} min`)

if (falhos.length) {
  console.log(`
reprovados: ${falhos.map((f) => f.nome).join(', ')}`)
  console.log(`a saida completa de cada um esta em ${DIR_LOGS}`)
  process.exit(1)
}
