// Troca a `Extracao Croqui` do lidimus-croqui de Mistral para Anthropic.
//
// Escrita em PRODUÇÃO — vale a mesma advertência do n8n-migrar-juridico.mjs:
// esta instância do n8n atende o site no ar e a alteração vale na hora. Rode o
// --dry-run primeiro.
//
// Mais simples que a do jurídico: a `Extracao Croqui` já era um nó HTTP, então
// o grafo não muda — nenhuma aresta, nenhum nó entra ou sai. Mudam três nós:
// para onde o HTTP aponta, quem lê a resposta e como o custo é contado.
//
// Uso:
//   node scripts/n8n-migrar-croqui.mjs [--dry-run]
//
// Os retratos de antes e depois ficam em tmp/ (ignorado pelo git).

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { carimbo, lerEnvProducaoBruto, raizRepo, valorDoEnv } from './lidimus-update-comum.mjs'
import { jsonBody, jsValidar, trechoTelemetria } from './n8n-migrar-croqui-corpo.mjs'

const simulacao = process.argv.includes('--dry-run')
const env = lerEnvProducaoBruto()
const base = (valorDoEnv(env, 'N8N_BASE_URL') || 'https://n8n.gvlar.com').replace(/\/+$/, '')
const chave = valorDoEnv(env, 'N8N_API_KEY')

if (!chave) {
  console.error('N8N_API_KEY não está no lidimus-saas/.env.')
  process.exit(1)
}

const ID = 'DdM1aWpt0iAdQ4Pe'
// O WAF na frente do n8n bloqueia User-Agent de bot — ver n8n-diff.mjs
const cabecalhos = { 'X-N8N-API-KEY': chave, 'User-Agent': 'curl/8.0', Accept: 'application/json' }

const resposta = await fetch(`${base}/api/v1/workflows/${ID}`, {
  headers: cabecalhos,
  signal: AbortSignal.timeout(20000),
})
if (!resposta.ok) {
  console.error(`HTTP ${resposta.status} ao buscar ${ID}`)
  process.exit(1)
}
const wf = await resposta.json()

const marca = carimbo()
const retrato = (fase) => resolve(raizRepo, 'tmp', `croqui-${fase}-${marca}.json`)
writeFileSync(retrato('antes'), JSON.stringify(wf, null, 2))

// ── 1. "Extracao Croqui": Mistral → Anthropic ──
const extracao = wf.nodes.find((n) => n.name === 'Extracao Croqui')
if (!extracao) {
  console.error('nó "Extracao Croqui" não existe no workflow ao vivo — nada foi enviado.')
  process.exit(1)
}

extracao.parameters = {
  method: 'POST',
  url: 'https://api.anthropic.com/v1/messages',
  authentication: 'genericCredentialType',
  genericAuthType: 'httpHeaderAuth',
  sendHeaders: true,
  headerParameters: {
    parameters: [
      { name: 'anthropic-version', value: '2023-06-01' },
      { name: 'content-type', value: 'application/json' },
    ],
  },
  sendBody: true,
  specifyBody: 'json',
  jsonBody,
  options: {},
}
// A mesma credencial que o lidimus-Juridico já usa.
extracao.credentials = { httpHeaderAuth: { id: 'x0BtGwj48aRQbzJ3', name: 'Anthropic API - lidimus (x-api-key)' } }

// ── 2. "Validar JSON": lê blocos de content, não choices ──
const validar = wf.nodes.find((n) => n.name === 'Validar JSON')
if (!validar) {
  console.error('nó "Validar JSON" não existe no workflow ao vivo — nada foi enviado.')
  process.exit(1)
}
validar.parameters.jsCode = jsValidar

// ── 3. "Montar Callback": telemetria com os campos da Anthropic ──
// Substitui o bloco inteiro, do comentário de abertura até a linha que monta o
// `usage` — é ele que alimenta o painel Admin > Custos.
const callback = wf.nodes.find((n) => n.name === 'Montar Callback')
const codigo = callback?.parameters?.jsCode ?? ''
const inicio = codigo.indexOf('// Uso real do modelo para telemetria')
const fim = codigo.indexOf('const usage = { models:')
if (inicio < 0 || fim < 0) {
  console.error('bloco de telemetria não encontrado em "Montar Callback" — nada foi enviado.')
  process.exit(1)
}
callback.parameters.jsCode = codigo.slice(0, inicio) + trechoTelemetria + codigo.slice(codigo.indexOf('\n', fim))

// ── PUT ──
// `settings` é obrigatório no PUT e a instância guarda nele campos que o schema
// da API recusa — ver a explicação por extenso no n8n-publicar.mjs.
const PERMITIDOS_NO_PUT = [
  'saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution',
  'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder',
]
const settingsAntes = wf.settings ?? {}
const settingsEnviado = Object.fromEntries(
  Object.entries(settingsAntes).filter(([c]) => PERMITIDOS_NO_PUT.includes(c)),
)
const descartados = Object.keys(settingsAntes).filter((c) => !PERMITIDOS_NO_PUT.includes(c))

console.log(`nós: ${wf.nodes.length} (inalterado)`)
console.log(`modelo no corpo: ${jsonBody.match(/model: '([^']+)'/)[1]}`)
console.log('grafo: inalterado — nenhuma aresta muda')
console.log('nós alterados: Extracao Croqui, Validar JSON, Montar Callback')
if (descartados.length) {
  console.log(`settings fora do schema do PUT (voltam ao padrão): ${descartados.join(', ')}`)
}

writeFileSync(retrato('depois'), JSON.stringify(wf, null, 2))
console.log(`\nretratos em tmp/croqui-{antes,depois}-${marca}.json`)

if (simulacao) {
  console.log('\n--dry-run: nada foi enviado.')
  process.exit(0)
}

const envio = await fetch(`${base}/api/v1/workflows/${ID}`, {
  method: 'PUT',
  headers: { ...cabecalhos, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: settingsEnviado,
  }),
  signal: AbortSignal.timeout(30000),
})
if (!envio.ok) {
  console.error(`HTTP ${envio.status} ao publicar: ${(await envio.text()).slice(0, 400)}`)
  process.exit(1)
}
console.log(`\n✓ publicado — ativo: ${(await envio.json()).active}`)

// Reconsulta em vez de acreditar no eco do PUT.
const conf = await (await fetch(`${base}/api/v1/workflows/${ID}`, { headers: cabecalhos })).json()
const ec = conf.nodes.find((n) => n.name === 'Extracao Croqui')
const vj = conf.nodes.find((n) => n.name === 'Validar JSON')
const mc = conf.nodes.find((n) => n.name === 'Montar Callback')

const conferencias = [
  [ec?.parameters?.url === 'https://api.anthropic.com/v1/messages', 'Extracao Croqui aponta para a Anthropic'],
  [ec?.parameters?.jsonBody === jsonBody, 'corpo no ar é idêntico ao do módulo testado'],
  [ec?.credentials?.httpHeaderAuth?.id === 'x0BtGwj48aRQbzJ3', 'credencial Anthropic aplicada'],
  [vj?.parameters?.jsCode === jsValidar, 'Validar JSON lê blocos de content'],
  [mc?.parameters?.jsCode.includes('claude-sonnet-5'), 'telemetria com os campos da Anthropic'],
  [!JSON.stringify(conf.nodes).includes('api.mistral.ai'), 'nenhuma referência a Mistral no workflow'],
]
for (const [ok, texto] of conferencias) {
  console.log(`${ok ? '✓' : '✗'} ${texto}`)
  if (!ok) process.exitCode = 1
}
