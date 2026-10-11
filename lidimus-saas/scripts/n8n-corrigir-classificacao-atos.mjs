// Publica a correção da classificação de atos (15/09/2026) nos dois workflows
// que dependem dos nomes das classes.
//
// Escrita em PRODUÇÃO — mesma advertência do n8n-migrar-juridico.mjs: esta
// instância do n8n atende o site no ar e a alteração vale na hora. Rode o
// --dry-run primeiro.
//
// O parser vem de ./n8n-parser-classificacao-correcao.mjs, o mesmo módulo que a
// medição exercita contra o corpus de OCR real dos dois bancos. As classes novas
// (usucapiao, arrolamento_fiscal, existencia_acao) precisam existir também onde
// o nome da classe é consumido, ou saem cruas no documento:
//
//   lidimus-Juridico · Processar Atos e Coords — a classificação em si
//   lidimus-Juridico · Montar Consultas RAG    — consulta do manual por classe
//   lidimus-Juridico · Análise Jurídica        — usucapião na lista de atos dominiais
//   lidimus-Doc      · Montar Documento        — rótulo da classe (LABEL_TIPO)
//
// Depende do n8n-corrigir-parser-cabecalho-linha.mjs (15/09) já publicado: as
// âncoras do parser incluem linhas que ele escreveu. Se `trocar` falhar, o nó ao
// vivo mudou — confira com n8n-diff.mjs antes de forçar qualquer coisa.
//
// Uso:
//   node scripts/n8n-corrigir-classificacao-atos.mjs [--dry-run]

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { carimbo, lerEnvProducaoBruto, raizRepo, valorDoEnv } from './lidimus-update-comum.mjs'
import { corrigirJsCode } from './n8n-parser-classificacao-correcao.mjs'

const simulacao = process.argv.includes('--dry-run')
const env = lerEnvProducaoBruto()
const base = (valorDoEnv(env, 'N8N_BASE_URL') || 'https://n8n.gvlar.com.br').replace(/\/+$/, '')
const chave = valorDoEnv(env, 'N8N_API_KEY')

if (!chave) {
  console.error('N8N_API_KEY não está no lidimus-saas/.env.')
  process.exit(1)
}

// O WAF na frente do n8n bloqueia User-Agent de bot — ver n8n-diff.mjs
const cabecalhos = { 'X-N8N-API-KEY': chave, 'User-Agent': 'curl/8.0', Accept: 'application/json' }

function trocaUnica(texto, de, para, rotulo) {
  const n = texto.split(de).length - 1
  if (n !== 1) throw new Error(`âncora "${rotulo}" aparece ${n} vezes (esperado 1)`)
  return texto.replace(de, para)
}

const MARCA = 'arrolamento_fiscal'

const WORKFLOWS = [
  {
    id: 'XakDkY7aCjCYkyqt',
    rotulo: 'juridico',
    nos: [
      {
        nome: 'Processar Atos e Coords',
        campo: 'jsCode',
        aplicar: (js) => corrigirJsCode(js),
      },
      {
        nome: 'Montar Consultas RAG',
        campo: 'jsCode',
        aplicar: (js) =>
          trocaUnica(
            js,
            "  heranca: ['inventário arrolamento partilha registro do formal'],\n",
            "  heranca: ['inventário arrolamento partilha registro do formal'],\n"
            + "  usucapiao: ['usucapião registro da sentença aquisição originária'],\n"
            + "  existencia_acao: ['averbação de existência de ação concentração dos atos na matrícula fraude à execução'],\n"
            + "  arrolamento_fiscal: ['arrolamento de bens pela Receita Federal averbação e comunicação da alienação'],\n",
            'MAPA do RAG',
          ),
      },
      {
        nome: 'Análise Jurídica',
        campo: 'jsonBody',
        aplicar: (body) =>
          trocaUnica(
            body,
            'partilha ou heranca)',
            'partilha, heranca ou usucapiao - aquisicao originaria, sem transmitente)',
            'lista de atos dominiais do prompt',
          ),
        jaAplicado: (body) => body.includes('usucapiao - aquisicao originaria'),
      },
    ],
  },
  {
    id: null, // resolvido pelo nome abaixo
    nomeWorkflow: 'lidimus-Doc',
    rotulo: 'doc',
    nos: [
      {
        nome: 'Montar Documento',
        campo: 'jsCode',
        aplicar: (js) =>
          trocaUnica(
            js,
            "clausula_restritiva:'Cláusulas Restritivas'};",
            "clausula_restritiva:'Cláusulas Restritivas',usucapiao:'Usucapião',arrolamento_fiscal:'Arrolamento Fiscal (Receita Federal)',existencia_acao:'Existência de Ação'};",
            'LABEL_TIPO',
          ),
      },
    ],
  },
]

// `settings` é obrigatório no PUT e a instância guarda nele campos que o schema
// da API recusa — ver a explicação por extenso no n8n-publicar.mjs.
const PERMITIDOS_NO_PUT = [
  'saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution',
  'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder',
]

const marca = carimbo()

if (WORKFLOWS.some((w) => !w.id)) {
  const lista = await (await fetch(`${base}/api/v1/workflows?limit=250`, { headers: cabecalhos })).json()
  for (const w of WORKFLOWS.filter((x) => !x.id)) {
    const achado = lista.data.find((x) => x.name === w.nomeWorkflow)
    if (!achado) {
      console.error(`workflow "${w.nomeWorkflow}" não encontrado — nada foi enviado.`)
      process.exit(1)
    }
    w.id = achado.id
  }
}

// Tudo é preparado e validado ANTES do primeiro PUT: se uma âncora falhar no
// segundo workflow, o primeiro não pode ter ido sozinho para o ar.
const preparados = []
for (const w of WORKFLOWS) {
  const resposta = await fetch(`${base}/api/v1/workflows/${w.id}`, { headers: cabecalhos, signal: AbortSignal.timeout(20000) })
  if (!resposta.ok) {
    console.error(`HTTP ${resposta.status} ao buscar ${w.id}`)
    process.exit(1)
  }
  const wf = await resposta.json()
  writeFileSync(resolve(raizRepo, 'tmp', `classificacao-${w.rotulo}-antes-${marca}.json`), JSON.stringify(wf, null, 2))

  const esperados = []
  for (const alvo of w.nos) {
    const no = wf.nodes.find((n) => n.name === alvo.nome)
    if (!no) {
      console.error(`nó "${alvo.nome}" não existe no workflow ao vivo — nada foi enviado.`)
      process.exit(1)
    }
    const antes = no.parameters[alvo.campo]
    const jaFeito = alvo.jaAplicado ? alvo.jaAplicado(antes) : antes.includes(MARCA) || antes.includes("usucapiao:'Usucapião'")
    if (jaFeito) {
      console.log(`= ${alvo.nome} — já contém a correção`)
      continue
    }
    let depois
    try {
      depois = alvo.aplicar(antes)
    } catch (e) {
      console.error(`${alvo.nome}: ${e.message}`)
      console.error('O nó ao vivo mudou desde que a correção foi escrita. Confira com n8n-diff.mjs. Nada foi enviado.')
      process.exit(1)
    }
    no.parameters[alvo.campo] = depois
    esperados.push({ nome: alvo.nome, campo: alvo.campo, valor: depois })
    console.log(`~ ${wf.name} · ${alvo.nome} — ${alvo.campo} ${antes.length} → ${depois.length} bytes`)
  }
  if (esperados.length) preparados.push({ w, wf, esperados })
}

if (!preparados.length) {
  console.log('Nada a publicar.')
  process.exit(0)
}
console.log('grafo: inalterado — nenhum nó entra ou sai, nenhuma aresta muda')

if (simulacao) {
  console.log('\n--dry-run: nada foi enviado.')
  process.exit(0)
}

for (const { w, wf, esperados } of preparados) {
  const settingsEnviado = Object.fromEntries(
    Object.entries(wf.settings ?? {}).filter(([c]) => PERMITIDOS_NO_PUT.includes(c)),
  )
  const envio = await fetch(`${base}/api/v1/workflows/${w.id}`, {
    method: 'PUT',
    headers: { ...cabecalhos, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: settingsEnviado }),
    signal: AbortSignal.timeout(30000),
  })
  if (!envio.ok) {
    console.error(`HTTP ${envio.status} ao publicar ${wf.name}: ${(await envio.text()).slice(0, 400)}`)
    process.exit(1)
  }
  console.log(`\n✓ ${wf.name} publicado — ativo: ${(await envio.json()).active}`)

  // Reconsulta em vez de acreditar no eco do PUT. O retrato em tmp/ não prova
  // publicação — o updatedAt ao vivo, sim.
  const conf = await (await fetch(`${base}/api/v1/workflows/${w.id}`, { headers: cabecalhos })).json()
  for (const e of esperados) {
    const ok = conf.nodes.find((n) => n.name === e.nome)?.parameters?.[e.campo] === e.valor
    console.log(`${ok ? '✓' : '✗'} ${e.nome} no ar é idêntico ao medido`)
    if (!ok) process.exitCode = 1
  }
  const extras = [
    [conf.nodes.length === wf.nodes.length, 'nenhum nó entrou ou saiu'],
    [conf.versionId === conf.activeVersionId, 'versão publicada é a versão salva'],
  ]
  for (const [ok, texto] of extras) {
    console.log(`${ok ? '✓' : '✗'} ${texto}`)
    if (!ok) process.exitCode = 1
  }
  console.log(`updatedAt ao vivo: ${conf.updatedAt}`)
}
