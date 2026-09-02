// Publica no n8n os parâmetros de nós específicos de um workflow versionado.
//
// Contraparte de escrita do n8n-diff.mjs, e deliberadamente estreita: em vez de
// mandar o JSON do repo inteiro por cima do que está no ar, busca o workflow ao
// vivo, troca só os `parameters` dos nós nomeados na linha de comando e devolve.
//
// O motivo é o mesmo que o n8n-diff.mjs escreve por extenso: a direção da
// verdade é ambígua nos dois sentidos, e esta instância atende o site no ar —
// alteração vale na hora, inclusive para os jobs dos clientes que já estão
// rodando. Substituir o documento todo aplicaria de carona qualquer divergência
// que o repo tenha acumulado (ou desfaria um ajuste feito na interface), o que é
// exatamente o acidente que o script de diff existe para tornar visível.
//
// `--conexoes` é a exceção deliberada: religar nós muda o CAMINHO que o
// documento percorre, não o que um nó faz, e não há como expressar isso trocando
// `parameters`. Por ser mais larga que o resto do script — publica o mapa de
// conexões inteiro, e com ele qualquer religação que o repo tenha acumulado —
// exige a flag e imprime, antes de enviar, exatamente quais arestas mudam.
//
// Uso:
//   node scripts/n8n-publicar.mjs <arquivo.json> <Nó A> [Nó B ...] [--conexoes] [--dry-run]
//
// Exemplo:
//   node scripts/n8n-publicar.mjs lidimus-OCR.json "Normalizar Texto" "Callback OCR"

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { lerEnvProducaoBruto, raizRepo, valorDoEnv } from './lidimus-update-comum.mjs'

const argv = process.argv.slice(2)
const simulacao = argv.includes('--dry-run')
const publicarConexoes = argv.includes('--conexoes')
const [arquivo, ...nomesDeNos] = argv.filter((a) => a !== '--dry-run' && a !== '--conexoes')

if (!arquivo || (nomesDeNos.length === 0 && !publicarConexoes)) {
  console.error('Uso: node scripts/n8n-publicar.mjs <arquivo.json> <Nó> [Nó ...] [--conexoes] [--dry-run]')
  process.exit(1)
}

const env = lerEnvProducaoBruto()
const base = (valorDoEnv(env, 'N8N_BASE_URL') || 'https://n8n.gvlar.com').replace(/\/+$/, '')
const chave = valorDoEnv(env, 'N8N_API_KEY')

if (!chave) {
  console.error('N8N_API_KEY não está no lidimus-saas/.env.')
  process.exit(1)
}

// O WAF na frente do n8n bloqueia User-Agent de bot — ver n8n-diff.mjs
const cabecalhos = {
  'X-N8N-API-KEY': chave,
  'User-Agent': 'curl/8.0',
  Accept: 'application/json',
}

const mapa = JSON.parse(readFileSync(resolve(raizRepo, 'n8n', 'workflows.json'), 'utf8'))
const entrada = mapa.workflows.find((w) => w.arquivo === arquivo)
if (!entrada) {
  console.error(`"${arquivo}" não está em n8n/workflows.json.`)
  process.exit(1)
}

const local = JSON.parse(
  readFileSync(resolve(raizRepo, 'n8n', entrada.arquivo), 'utf8').replace(/^﻿/, ''),
)

const resposta = await fetch(`${base}/api/v1/workflows/${entrada.id}`, {
  headers: cabecalhos,
  signal: AbortSignal.timeout(20000),
})
if (!resposta.ok) {
  console.error(`HTTP ${resposta.status} ao buscar ${entrada.id}`)
  process.exit(1)
}
const remoto = await resposta.json()

const localPorNome = new Map(local.nodes.map((n) => [n.name, n]))
const trocas = []

for (const nome of nomesDeNos) {
  const doRepo = localPorNome.get(nome)
  if (!doRepo) {
    console.error(`Nó "${nome}" não existe em ${entrada.arquivo}.`)
    process.exit(1)
  }
  const noVivo = remoto.nodes.find((n) => n.name === nome)
  if (!noVivo) {
    console.error(`Nó "${nome}" não existe no workflow ao vivo.`)
    process.exit(1)
  }
  const antes = JSON.stringify(noVivo.parameters)
  const depois = JSON.stringify(doRepo.parameters)
  if (antes === depois) {
    console.log(`= ${nome} — já idêntico, nada a fazer`)
    continue
  }
  noVivo.parameters = doRepo.parameters
  trocas.push({ nome, de: antes.length, para: depois.length })
}

// Conexões: lista aresta a aresta o que muda, para a religação ser conferida
// antes de valer no ar — e não depois, num workflow que atende o site.
const arestas = (mapa) =>
  new Set(
    Object.entries(mapa ?? {}).flatMap(([origem, portas]) =>
      (portas.main ?? []).flatMap((saidas, i) =>
        (saidas ?? []).map((d) => `${origem} [${i}] → ${d.node}`),
      ),
    ),
  )

let conexoesMudam = false
if (publicarConexoes) {
  const antes = arestas(remoto.connections)
  const depois = arestas(local.connections)
  const removidas = [...antes].filter((a) => !depois.has(a))
  const criadas = [...depois].filter((a) => !antes.has(a))
  conexoesMudam = removidas.length > 0 || criadas.length > 0

  if (!conexoesMudam) {
    console.log('= conexões — já idênticas, nada a fazer')
  } else {
    console.log('\nConexões que mudam no ar:')
    for (const a of removidas) console.log(`  - ${a}`)
    for (const a of criadas) console.log(`  + ${a}`)
    remoto.connections = local.connections
  }
}

if (trocas.length === 0 && !conexoesMudam) {
  console.log('Nada a publicar.')
  process.exit(0)
}

for (const t of trocas) {
  console.log(`~ ${t.nome} — parameters ${t.de} → ${t.para} bytes`)
}

if (simulacao) {
  console.log('\n--dry-run: nada foi enviado.')
  process.exit(0)
}

// `settings` é obrigatório no PUT e, ao mesmo tempo, a instância guarda nele
// campos que o schema da API recusa — mandar o objeto como veio devolve
// 400 ("must NOT have additional properties") e omiti-lo devolve 400
// ("must have required property 'settings'"). Sobra reenviar só o que a API
// documenta, o que significa que as chaves de fora somem do registro.
//
// Vale a pena saber o que some, e por que isto não é perda:
//
//   • `callerPolicy: workflowsFromSameOwner` e `availableInMCP: false` são
//     exatamente os padrões do n8n — cair no padrão é continuar igual.
//   • `binaryMode: separate` manda o binário para o filesystem. O nó
//     `Preparar Base64` já não depende dele: ele lê por
//     `helpers.getBinaryDataBuffer`, justamente porque `$binary.data.data`
//     devolve o placeholder 'filesystem-v2' nesse modo. Funciona nos dois.
//
// Mesmo assim, a conferência no fim reconsulta e imprime a diferença: suposição
// sobre API de terceiro se verifica, não se confia.
const PERMITIDOS_NO_PUT = [
  'saveExecutionProgress',
  'saveManualExecutions',
  'saveDataErrorExecution',
  'saveDataSuccessExecution',
  'executionTimeout',
  'errorWorkflow',
  'timezone',
  'executionOrder',
]

const settingsAntes = remoto.settings ?? {}
const settingsEnviado = Object.fromEntries(
  Object.entries(settingsAntes).filter(([chave]) => PERMITIDOS_NO_PUT.includes(chave)),
)

const descartados = Object.keys(settingsAntes).filter((c) => !PERMITIDOS_NO_PUT.includes(c))
if (descartados.length) {
  console.log(`  settings fora do schema do PUT (voltam ao padrão): ${descartados.join(', ')}`)
}

const corpo = {
  name: remoto.name,
  nodes: remoto.nodes,
  connections: remoto.connections,
  settings: settingsEnviado,
}

const envio = await fetch(`${base}/api/v1/workflows/${entrada.id}`, {
  method: 'PUT',
  headers: { ...cabecalhos, 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
  signal: AbortSignal.timeout(30000),
})

if (!envio.ok) {
  console.error(`HTTP ${envio.status} ao publicar: ${(await envio.text()).slice(0, 400)}`)
  process.exit(1)
}

const salvo = await envio.json()
console.log(`\n✓ ${entrada.arquivo} publicado — ativo: ${salvo.active}`)

// Reconsulta em vez de acreditar no eco do PUT.
const conferencia = await fetch(`${base}/api/v1/workflows/${entrada.id}`, {
  headers: cabecalhos,
  signal: AbortSignal.timeout(20000),
})
const depoisDoPut = await conferencia.json()

const settingsDepois = depoisDoPut.settings ?? {}
const mudou = Object.keys({ ...settingsAntes, ...settingsDepois }).filter(
  (c) => JSON.stringify(settingsAntes[c]) !== JSON.stringify(settingsDepois[c]),
)
if (mudou.length) {
  console.log(`\n  settings alterado em: ${mudou.join(', ')}`)
  for (const c of mudou) {
    console.log(`    ${c}: ${JSON.stringify(settingsAntes[c])} → ${JSON.stringify(settingsDepois[c])}`)
  }
} else {
  console.log('✓ settings preservado integralmente')
}

for (const nome of trocas.map((t) => t.nome)) {
  const esperado = JSON.stringify(localPorNome.get(nome).parameters)
  const gravado = JSON.stringify(depoisDoPut.nodes.find((n) => n.name === nome)?.parameters)
  console.log(`${esperado === gravado ? '✓' : '✗'} ${nome} — parâmetros conferem no que está no ar`)
  if (esperado !== gravado) process.exitCode = 1
}

if (conexoesMudam) {
  const esperadas = [...arestas(local.connections)].sort()
  const gravadas = [...arestas(depoisDoPut.connections)].sort()
  const conferem = JSON.stringify(esperadas) === JSON.stringify(gravadas)
  console.log(`${conferem ? '✓' : '✗'} conexões conferem no que está no ar (${gravadas.length} arestas)`)
  if (!conferem) process.exitCode = 1
}
