// Publica no lidimus-Juridico o reconhecimento da cauda órfã.
//
// Escrita em PRODUÇÃO — mesma advertência do n8n-migrar-juridico.mjs: esta
// instância do n8n atende o site no ar e a alteração vale na hora. Rode o
// --dry-run primeiro.
//
// A transformação vem de ./n8n-parser-cauda-orfa-correcao.mjs, o mesmo módulo
// que a medição exercita contra o corpus de OCR real dos dois bancos. Só o
// `parameters.jsCode` de um nó muda: o grafo fica intacto.
//
// Este script é o SEGUNDO a mexer no mesmo nó (o primeiro é o
// n8n-corrigir-parser-atos.mjs, de 04/09) e depende dele: as âncoras aqui são
// as linhas do portão de integridade, que aquele não toca. Se `trocar` falhar,
// o nó ao vivo mudou — confira com n8n-diff.mjs antes de forçar qualquer coisa.
//
// Uso:
//   node scripts/n8n-corrigir-parser-cauda-orfa.mjs [--dry-run]
//
// Os retratos de antes e depois ficam em tmp/ (ignorado pelo git).

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { carimbo, lerEnvProducaoBruto, raizRepo, valorDoEnv } from './lidimus-update-comum.mjs'
import { corrigirJsCode } from './n8n-parser-cauda-orfa-correcao.mjs'

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
const retrato = (fase) => resolve(raizRepo, 'tmp', `juridico-cauda-${fase}-${marca}.json`)
writeFileSync(retrato('antes'), JSON.stringify(wf, null, 2))

const no = wf.nodes.find((n) => n.name === 'Processar Atos e Coords')
if (!no) {
  console.error('nó "Processar Atos e Coords" não existe no workflow ao vivo — nada foi enviado.')
  process.exit(1)
}

const antes = no.parameters.jsCode
let depois
try {
  depois = corrigirJsCode(antes)
} catch (e) {
  console.error(e.message)
  console.error('O nó ao vivo mudou desde que a correção foi escrita. Confira com n8n-diff.mjs.')
  process.exit(1)
}
if (depois === antes) {
  console.log('jsCode já contém a correção — nada a publicar.')
  process.exit(0)
}
no.parameters.jsCode = depois

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

console.log(`nó alterado: Processar Atos e Coords — jsCode ${antes.length} → ${depois.length} bytes`)
console.log('grafo: inalterado — nenhum nó entra ou sai, nenhuma aresta muda')
if (descartados.length) {
  console.log(`settings fora do schema do PUT (voltam ao padrão): ${descartados.join(', ')}`)
}

writeFileSync(retrato('depois'), JSON.stringify(wf, null, 2))
console.log(`retratos em tmp/juridico-cauda-{antes,depois}-${marca}.json`)

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
const noAtivo = conf.nodes.find((n) => n.name === 'Processar Atos e Coords')
const conferencias = [
  [noAtivo?.parameters?.jsCode === depois, 'jsCode no ar é idêntico ao que passou pela medição'],
  [noAtivo?.parameters?.jsCode.includes('caudaOrfaExplica'), 'reconhecedor da cauda presente'],
  [noAtivo?.parameters?.jsCode.includes('explicadosPorCauda'), 'aviso próprio da cauda presente'],
  [conf.nodes.length === wf.nodes.length, 'nenhum nó entrou ou saiu'],
]
for (const [ok, texto] of conferencias) {
  console.log(`${ok ? '✓' : '✗'} ${texto}`)
  if (!ok) process.exitCode = 1
}
