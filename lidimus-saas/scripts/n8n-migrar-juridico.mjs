// Troca a `Extração de Campos` do lidimus-Juridico de Mistral para Anthropic.
//
// Escrita em PRODUÇÃO: esta instância do n8n atende o site no ar e a alteração
// vale na hora, inclusive para os jobs de clientes que já estão rodando — o
// mesmo motivo pelo qual o n8n-publicar.mjs é deliberadamente estreito e o
// rag/guarda-producao.cjs pede --confirmar-producao. Rode o --dry-run primeiro.
//
// Por que não usa o n8n-publicar.mjs: aquele script troca `parameters` de nós
// que já existem, a partir do JSON versionado em n8n/. Aqui o grafo muda (entra
// um nó, sai outro, quatro arestas mudam) e o repo está defasado em relação ao
// que está no ar — então o documento é buscado ao vivo, alterado em memória e
// devolvido. O `n8n-diff.mjs` continua sendo o jeito de ver essa defasagem.
//
// O corpo da requisição e o código do nó novo vêm de
// ./n8n-migrar-juridico-corpo.mjs, que é o mesmo módulo exercitado contra a API
// real antes de publicar. A conferência no fim reconsulta a instância e compara
// byte a byte — suposição sobre API de terceiro se verifica, não se confia.
//
// Uso:
//   node scripts/n8n-migrar-juridico.mjs [--dry-run]
//
// Os retratos de antes e depois ficam em tmp/ (ignorado pelo git).

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { carimbo, lerEnvProducaoBruto, raizRepo, valorDoEnv } from './lidimus-update-comum.mjs'
import { jsonBody, jsParsear } from './n8n-migrar-juridico-corpo.mjs'

const simulacao = process.argv.includes('--dry-run')
const env = lerEnvProducaoBruto()
const base = (valorDoEnv(env, 'N8N_BASE_URL') || 'https://n8n.gvlar.com').replace(/\/+$/, '')
const chave = valorDoEnv(env, 'N8N_API_KEY')

if (!chave) {
  console.error('N8N_API_KEY não está no lidimus-saas/.env.')
  process.exit(1)
}

const ID = 'XakDkY7aCjCYkyqt'
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
const retrato = (fase) => resolve(raizRepo, 'tmp', `juridico-${fase}-${marca}.json`)
writeFileSync(retrato('antes'), JSON.stringify(wf, null, 2))

// ── 1. "Extração de Campos": informationExtractor(Mistral) → httpRequest ──
const iExtracao = wf.nodes.findIndex((n) => n.name === 'Extração de Campos')
if (iExtracao < 0) {
  console.error('nó "Extração de Campos" não existe no workflow ao vivo — nada foi enviado.')
  process.exit(1)
}
const antigo = wf.nodes[iExtracao]

wf.nodes[iExtracao] = {
  id: antigo.id,
  name: 'Extração de Campos',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.4,
  position: antigo.position,
  parameters: {
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
  },
  // A mesma credencial que o nó "Análise Jurídica" já usa.
  credentials: { httpHeaderAuth: { id: 'x0BtGwj48aRQbzJ3', name: 'Anthropic API - lidimus (x-api-key)' } },
  // Preservados do nó antigo: o NOME é o que o "Montar Erro" usa (via
  // $prevNode.name) para dizer onde quebrou, e a política de tentativas fica
  // exatamente como estava — 3 tentativas com 5s entre elas.
  onError: antigo.onError,
  retryOnFail: antigo.retryOnFail,
  maxTries: antigo.maxTries,
  waitBetweenTries: antigo.waitBetweenTries,
}

// ── 2. Nó novo "Parsear Campos": resposta da API → contrato { output } ──
// O Information Extractor entregava o objeto pronto; o nó HTTP entrega a
// resposta crua da API. Como "Processar Atos e Coords" lê
// $input.first().json.output, a conversão precisa de um nó próprio.
wf.nodes.splice(iExtracao + 1, 0, {
  id: 'node-parsear-campos',
  name: 'Parsear Campos',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [816, 304],
  parameters: { jsCode: jsParsear },
  // Mesma disciplina dos outros nós de código do caminho principal: saída de
  // erro ligada ao "Montar Erro", senão a execução morre calada e o cliente
  // fica na ampulheta até o watchdog varrer o job.
  onError: 'continueErrorOutput',
})

// ── 3. Fora o "Mistral Chat Model" — não sobrou ninguém para alimentar ──
wf.nodes = wf.nodes.filter((n) => n.name !== 'Mistral Chat Model')
delete wf.connections['Mistral Chat Model']

// ── 4. Religação ──
wf.connections['Extração de Campos'] = {
  main: [
    [{ node: 'Parsear Campos', type: 'main', index: 0 }],
    [{ node: 'Montar Erro', type: 'main', index: 0 }],
  ],
}
wf.connections['Parsear Campos'] = {
  main: [
    [{ node: 'Converter Palavras Numéricas', type: 'main', index: 0 }],
    [{ node: 'Montar Erro', type: 'main', index: 0 }],
  ],
}

// ── 5. Telemetria de margem: consumo real no lugar da estimativa ──
// O nó langchain não expunha usage, então o custo da extração era estimado por
// contagem de caracteres. O nó HTTP devolve usage de verdade.
const noCallback = wf.nodes.find((n) => n.name === 'Montar Callback')
const alvo = noCallback.parameters.jsCode.split('\n').find((l) => l.includes("model: 'mistral-medium-latest'"))
if (!alvo) {
  console.error('linha da estimativa mistral-medium não encontrada em "Montar Callback" — nada foi enviado.')
  process.exit(1)
}

const substituta =
  "try { const _ex = $('Extração de Campos').first().json || {}; const _xu = _ex.usage || {}; " +
  'const _xIn = (Number(_xu.input_tokens) || 0) + (Number(_xu.cache_read_input_tokens) || 0) + (Number(_xu.cache_creation_input_tokens) || 0); ' +
  'const _xOut = Number(_xu.output_tokens) || 0; ' +
  "if (_xIn) usage.models.push({ workflow: 'lidimus-Juridico', model: 'claude-sonnet-5', promptTokens: _xIn, completionTokens: _xOut, totalTokens: _xIn + _xOut, costUsd: Number(((_xIn * 2 + _xOut * 10) / 1e6).toFixed(6)) }); } catch (e) {}"

noCallback.parameters.jsCode = noCallback.parameters.jsCode
  .replace(
    '// Estimativa do custo da Extração de Campos (mistral-medium; nó langchain não expõe usage real).',
    '// Custo real da Extração de Campos (claude-sonnet-5: US$2/1M input, US$10/1M output).',
  )
  .replace(alvo, substituta)

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

console.log(`nós: ${wf.nodes.length} (sai o Mistral Chat Model, entra o Parsear Campos)`)
console.log(`modelo no corpo: ${jsonBody.match(/model: '([^']+)'/)[1]}`)
if (descartados.length) {
  console.log(`settings fora do schema do PUT (voltam ao padrão): ${descartados.join(', ')}`)
}
console.log('\nconexões que mudam no ar:')
console.log('  - Mistral Chat Model → Extração de Campos (ai_languageModel)')
console.log('  - Extração de Campos [0] → Converter Palavras Numéricas')
console.log('  + Extração de Campos [0] → Parsear Campos')
console.log('  + Extração de Campos [1] → Montar Erro')
console.log('  + Parsear Campos [0] → Converter Palavras Numéricas')
console.log('  + Parsear Campos [1] → Montar Erro')

writeFileSync(retrato('depois'), JSON.stringify(wf, null, 2))
console.log(`\nretratos em tmp/juridico-{antes,depois}-${marca}.json`)

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
const ex = conf.nodes.find((n) => n.name === 'Extração de Campos')
const pa = conf.nodes.find((n) => n.name === 'Parsear Campos')
const mc = conf.nodes.find((n) => n.name === 'Montar Callback')

const conferencias = [
  [ex?.type === 'n8n-nodes-base.httpRequest', `Extração de Campos é httpRequest (${ex?.type})`],
  [ex?.parameters?.jsonBody === jsonBody, 'corpo no ar é idêntico ao do módulo testado'],
  [ex?.credentials?.httpHeaderAuth?.id === 'x0BtGwj48aRQbzJ3', 'credencial Anthropic aplicada'],
  [pa?.parameters?.jsCode === jsParsear, 'Parsear Campos existe e confere'],
  [!conf.nodes.some((n) => n.name === 'Mistral Chat Model'), 'Mistral Chat Model removido'],
  [mc?.parameters?.jsCode.includes('claude-sonnet-5'), 'telemetria com usage real'],
]
for (const [ok, texto] of conferencias) {
  console.log(`${ok ? '✓' : '✗'} ${texto}`)
  if (!ok) process.exitCode = 1
}
