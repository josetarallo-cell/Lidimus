// Compara os workflows do n8n ao vivo com os JSONs versionados em n8n/.
//
// SOMENTE LEITURA — não escreve no repositório nem na instância. Não é timidez:
// a direção da verdade hoje é ambígua nos dois sentidos. Em 12/08/2026 o repo
// estava À FRENTE do n8n (o commit 308f071 trocou "parecer jurídico" por
// "relatório técnico" e nunca foi aplicado na instância), então reexportar por
// cima teria revertido uma correção deliberada e reportado sucesso.
//
// Escrever na instância é o que rag/guarda-producao.cjs protege com
// --confirmar-producao, pelo motivo escrito lá: o workflow é compartilhado com
// o site no ar e a alteração vale na hora, inclusive para os jobs dos clientes.
// Reconciliar continua sendo decisão humana; aqui só apontamos o dedo.
//
// Uso: node scripts/n8n-diff.mjs [--json]

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { lerEnvProducaoBruto, raizRepo, valorDoEnv } from './lidimus-update-comum.mjs'

const comoJson = process.argv.includes('--json')

// Campos que mudam sem que nada de fato tenha mudado.
//
// `activeVersion` merece destaque: ele DUPLICA nodes+connections inteiros e
// ainda traz workflowPublishHistory. Comparar o documento todo garante
// falso-positivo em todo workflow, sempre.
//
// `shared` sai por um segundo motivo: carrega o nome e o e-mail do dono da
// conta n8n, que já estão commitados em 5 dos 7 arquivos.
// `position` entra na lista porque é a coordenada do nó na tela: arrastar um
// nó para arrumar o desenho marcaria o workflow inteiro como divergente. Foi o
// que aconteceu no primeiro teste — 6 de 7 "divergentes", e a única diferença
// real do lidimus-OCR era [660,300] virar [528,304].
const VOLATEIS = new Set([
  'updatedAt', 'createdAt', 'versionId', 'activeVersionId', 'versionCounter',
  'triggerCount', 'staticData', 'pinData', 'isArchived', 'meta', 'shared',
  'activeVersion', 'description', 'tags', 'id', 'position',
])

// Só estes quatro definem o comportamento do workflow.
const COMPARADOS = ['name', 'nodes', 'connections', 'settings']

// Ordena chaves recursivamente para que a serialização não dependa da ordem em
// que a API (ou o export do PowerShell) resolveu emitir os campos.
function estavel(valor) {
  if (Array.isArray(valor)) return valor.map(estavel)
  if (valor && typeof valor === 'object') {
    const saida = {}
    for (const chave of Object.keys(valor).sort()) {
      if (VOLATEIS.has(chave)) continue
      saida[chave] = estavel(valor[chave])
    }
    return saida
  }
  return valor
}

function normalizar(workflow) {
  const recorte = {}
  for (const chave of COMPARADOS) recorte[chave] = workflow?.[chave] ?? null
  return JSON.stringify(estavel(recorte))
}

// Compara nó a nó para dizer O QUE mudou, não só QUE mudou.
function diferencaDeNos(local, remoto) {
  const porNome = (lista) => new Map((lista || []).map((n) => [n.name, n]))
  const a = porNome(local?.nodes)
  const b = porNome(remoto?.nodes)

  const removidos = [...a.keys()].filter((n) => !b.has(n))
  const acrescentados = [...b.keys()].filter((n) => !a.has(n))
  const alterados = [...a.keys()].filter((n) => {
    if (!b.has(n)) return false
    return JSON.stringify(estavel(a.get(n))) !== JSON.stringify(estavel(b.get(n)))
  })

  return { removidos, acrescentados, alterados }
}

const env = lerEnvProducaoBruto()
const base = (valorDoEnv(env, 'N8N_BASE_URL') || 'https://n8n.gvlar.com').replace(/\/+$/, '')
const chave = valorDoEnv(env, 'N8N_API_KEY')

if (!chave) {
  console.error('N8N_API_KEY não está no lidimus-saas/.env.')
  process.exit(1)
}

async function buscarWorkflow(id) {
  const resposta = await fetch(`${base}/api/v1/workflows/${id}`, {
    headers: {
      'X-N8N-API-KEY': chave,
      // O WAF na frente do n8n bloqueia User-Agent de bot. O mesmo truque está
      // em rag/push-workflow-rag.cjs — sem isto a chamada volta HTML de bloqueio.
      'User-Agent': 'curl/8.0',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  })
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ao buscar ${id}`)
  return resposta.json()
}

const mapa = JSON.parse(readFileSync(resolve(raizRepo, 'n8n', 'workflows.json'), 'utf8'))
const resultados = []

for (const entrada of mapa.workflows) {
  const caminho = resolve(raizRepo, 'n8n', entrada.arquivo)
  const item = { arquivo: entrada.arquivo, id: entrada.id }

  let local
  try {
    // Alguns exports vieram do ConvertTo-Json do PowerShell e carregam BOM.
    local = JSON.parse(readFileSync(caminho, 'utf8').replace(/^﻿/, ''))
  } catch (e) {
    resultados.push({ ...item, estado: 'erro', detalhe: `arquivo local ilegível: ${e.message}` })
    continue
  }

  let remoto
  try {
    remoto = await buscarWorkflow(entrada.id)
  } catch (e) {
    resultados.push({ ...item, estado: 'erro', detalhe: String(e.message) })
    continue
  }

  item.nome = remoto.name
  item.ativo = remoto.active

  if (normalizar(local) === normalizar(remoto)) {
    resultados.push({ ...item, estado: 'igual' })
  } else {
    resultados.push({ ...item, estado: 'divergente', nos: diferencaDeNos(local, remoto) })
  }
}

const divergentes = resultados.filter((r) => r.estado === 'divergente')
const comErro = resultados.filter((r) => r.estado === 'erro')

const relatorio = {
  ok: comErro.length === 0,
  total: resultados.length,
  divergentes: divergentes.length,
  erros: comErro.length,
  workflows: resultados,
}

if (comoJson) {
  console.log(JSON.stringify(relatorio, null, 2))
} else {
  for (const r of resultados) {
    if (r.estado === 'igual') {
      console.log(`✓ ${r.arquivo}`)
    } else if (r.estado === 'erro') {
      console.log(`! ${r.arquivo} — ${r.detalhe}`)
    } else {
      const partes = []
      if (r.nos.alterados.length) partes.push(`alterados: ${r.nos.alterados.join(', ')}`)
      if (r.nos.acrescentados.length) partes.push(`só no n8n: ${r.nos.acrescentados.join(', ')}`)
      if (r.nos.removidos.length) partes.push(`só no repo: ${r.nos.removidos.join(', ')}`)
      console.log(`✗ ${r.arquivo} — ${partes.join(' | ') || 'metadados'}`)
    }
  }
  console.log()
  if (divergentes.length) {
    console.log(`${divergentes.length} de ${resultados.length} divergentes. Reconcilie à mão —`)
    console.log('este script nunca escreve, em nenhuma das duas pontas.')
  } else if (!comErro.length) {
    console.log('Repositório e instância em sincronia.')
  }
}

// Divergência não é falha do script: é informação para o relatório. Só erro de
// leitura/rede derruba o código de saída.
process.exit(comErro.length ? 1 : 0)
