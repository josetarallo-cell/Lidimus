// Confere que o .env de produção e o docker-compose.yml conseguem sustentar o
// código que está prestes a subir.
//
// Este é o furo que o gate do sandbox NÃO cobre, por construção: o que difere
// entre sandbox e produção é 100% runtime (.env vs .env.sandbox), e o .env é
// gitignored — logo fica de fora do hash da árvore aprovada. Um código validado
// no sandbox pode subir e derrubar a produção só porque uma variável nova ficou
// para trás.
//
// O sintoma é feio: packages/workers/src/index.ts faz `throw` no boot quando
// falta env var, e com `restart: unless-stopped` o container entra em
// crash-loop (docs/90-troubleshooting.md).
//
// Uso: node scripts/verificar-env-producao.mjs [--json]

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { lerEnvProducaoBruto, raizSaas } from './lidimus-update-comum.mjs'
import { CHAVES_ESPELHADAS_NUXT } from './sandbox-env.mjs'

const comoJson = process.argv.includes('--json')

// Variáveis que o worker lê com valor padrão embutido — faltar não quebra nada.
// Mantida à mão de propósito: crescer esta lista é uma decisão, não um efeito
// colateral de alguém ter escrito um `??` no código.
//
// REVISAO_PRAZO_MINUTOS e WORKER_REVISAO_CONCURRENCY entraram em 20/08/2026:
// chegaram com o corretor de leitura (commit d83153e) e ficaram de fora daqui,
// o que reprovava todo deploy. As duas têm padrão no código (15 e 2) e já
// estavam documentadas como opcionais no .env.example — inclusive o aviso, que
// vale ler antes de definir REVISAO_PRAZO_MINUTOS, de que o nuxt.config lê a
// MESMA variável para prometer o prazo na tela: definir só de um lado faz a
// tela mentir.
const OPCIONAIS = new Set([
  'STUCK_JOB_TIMEOUT_MINUTES', 'SENTRY_DSN', 'SENTRY_ENVIRONMENT',
  'WORKER_HEARTBEAT_PATH', 'NODE_ENV', 'USD_BRL_RATE', 'GCS_BUCKET_NAME',
  'WORKER_CONCURRENCY', 'LOG_LEVEL',
  'REVISAO_PRAZO_MINUTOS', 'WORKER_REVISAO_CONCURRENCY',
])

function arquivosDe(diretorio) {
  const achados = []
  for (const item of readdirSync(diretorio)) {
    const caminho = resolve(diretorio, item)
    if (statSync(caminho).isDirectory()) achados.push(...arquivosDe(caminho))
    else if (/\.(ts|mjs|js)$/.test(item)) achados.push(caminho)
  }
  return achados
}

const problemas = []
const avisos = []

const env = lerEnvProducaoBruto()
const chavesDoEnv = new Set(
  env.split(/\r?\n/)
    .map((l) => l.match(/^([A-Za-z0-9_]+)=/))
    .filter(Boolean)
    .map((m) => m[1]),
)

// 1) Toda variável que o worker exige precisa existir no .env.
//
// A leitura é por CADEIA, não por ocorrência solta. `A || process.env.B` é um
// ajuste com dois nomes aceitos, não duas variáveis: lendo ocorrência a
// ocorrência, o script cobrava as duas e reprovava o deploy por uma alternativa
// que o código nunca chega a usar. Foi o que travou toda promoção entre 17/08 e
// 20/08/2026 por causa de
// `GOOGLE_CLOUD_SA_KEY_JSON || process.env.NUXT_GOOGLE_CLOUD_SA_KEY_JSON`
// (lib/gcs.ts), com o `.env` correto e a produção no ar o tempo todo.
//
// O que NÃO mudou: o literal no fim da cadeia (`?? 15`) continua sem tornar
// nada opcional. Deduzir isso dissolveria o portão sozinho — ver OPCIONAIS.
const NOME = '[A-Z0-9_]+'
const CADEIA = new RegExp(
  `process\\.env\\.(${NOME})((?:\\s*(?:\\|\\||\\?\\?)\\s*process\\.env\\.${NOME})*)`,
  'g',
)

// Detecta se depois da cadeia vem `|| <algo que não é process.env>`, ou seja um
// valor literal. Serve SÓ para redigir a mensagem: sugerir OPCIONAIS a quem
// estiver lendo, sem decidir por essa pessoa.
const TEM_LITERAL = /^\s*(?:\|\||\?\?)\s*(?!process\.env\.)\S/

const dirWorkers = resolve(raizSaas, 'packages/workers/src')
const grupos = new Map()
for (const arquivo of arquivosDe(dirWorkers)) {
  const texto = readFileSync(arquivo, 'utf8')
  for (const achado of texto.matchAll(CADEIA)) {
    const nomes = [achado[1], ...[...achado[2].matchAll(new RegExp(`process\\.env\\.(${NOME})`, 'g'))].map((m) => m[1])]
    const chave = nomes.join('|')
    if (grupos.has(chave)) continue
    grupos.set(chave, {
      nomes,
      ondeUsa: arquivo.replace(raizSaas, '').replace(/\\/g, '/'),
      temLiteral: TEM_LITERAL.test(texto.slice(achado.index + achado[0].length)),
    })
  }
}

for (const { nomes, ondeUsa, temLiteral } of grupos.values()) {
  // Basta UM nome da cadeia estar definido: é o que o código de fato usa.
  if (nomes.some((n) => chavesDoEnv.has(n))) continue

  const rotulo = nomes.length > 1 ? `${nomes.join(' ou ')} (nenhuma delas)` : nomes[0]

  if (nomes.some((n) => OPCIONAIS.has(n))) {
    avisos.push(`${rotulo} não está no .env (tem padrão embutido) — usada em ${ondeUsa}`)
  } else if (temLiteral) {
    // Continua bloqueando: quem decide que uma variável de produção é
    // dispensável é gente, não o regex. Mas a mensagem passa a dizer onde fica
    // o conserto — sem isto, o próximo `?? padrão` derruba o deploy das 5h
    // parecendo configuração faltando em produção.
    problemas.push(
      `${rotulo} é lida pelo worker (${ondeUsa}) e não existe no .env — o código`
      + ' tem padrão embutido; se faltar for intencional, acrescente a OPCIONAIS'
      + ' em scripts/verificar-env-producao.mjs',
    )
  } else {
    problemas.push(`${rotulo} é lida pelo worker (${ondeUsa}) e não existe no .env`)
  }
}

// 2) O container `web` roda um Nuxt buildado: em runtime só NUXT_<CHAVE>
// sobrescreve o runtimeConfig. Em produção esse espelho mora no bloco
// `environment:` do compose, não no .env — por isso a checagem é diferente da
// que o sandbox faz sobre o próprio arquivo.
const compose = readFileSync(resolve(raizSaas, 'docker-compose.yml'), 'utf8')
const blocoWeb = compose.split(/^\s{2}web:$/m)[1]?.split(/^\s{2}\w/m)[0] ?? ''
const espelhadasNoCompose = new Set(
  [...blocoWeb.matchAll(/^\s+NUXT_([A-Z0-9_]+):/gm)].map((m) => m[1]),
)

for (const chave of CHAVES_ESPELHADAS_NUXT) {
  if (chavesDoEnv.has(chave)) {
    if (!espelhadasNoCompose.has(chave)) {
      problemas.push(`NUXT_${chave} não está no bloco environment: do serviço web — o Nuxt buildado vai ignorar ${chave}`)
    }
  } else if (!espelhadasNoCompose.has(chave)) {
    // Armadilha adiada: a chave ainda não existe no .env, então hoje o Nuxt cai
    // no padrão do nuxt.config e nada quebra. Mas no dia em que alguém definir
    // essa variável esperando que valha, o container `web` vai ignorá-la em
    // silêncio — sem erro, sem log, com o valor antigo no ar.
    avisos.push(`${chave} não está no .env e NUXT_${chave} não está no compose — se um dia definir, acrescente os dois`)
  }
}

const resultado = {
  ok: problemas.length === 0,
  problemas,
  avisos,
  variaveisDoWorker: new Set([...grupos.values()].flatMap((g) => g.nomes)).size,
  espelhosNoCompose: espelhadasNoCompose.size,
}

if (comoJson) {
  console.log(JSON.stringify(resultado, null, 2))
} else {
  if (avisos.length) {
    console.log('Avisos (não bloqueiam):')
    for (const a of avisos) console.log(`  · ${a}`)
    console.log()
  }
  if (problemas.length) {
    console.error('Produção NÃO está pronta para receber este código:')
    for (const p of problemas) console.error(`  ✗ ${p}`)
  } else {
    console.log(`✓ .env e docker-compose.yml consistentes (${resultado.variaveisDoWorker} variáveis do worker, ${espelhadasNoCompose.size} espelhos NUXT_).`)
  }
}

process.exit(resultado.ok ? 0 : 1)
