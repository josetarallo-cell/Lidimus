// Ponte entre o n8n e o host.
//
// O container do n8n não tem o socket do Docker nem o código-fonte, e está numa
// rede separada das stacks do Lidimus — ele não consegue buildar nem reiniciar
// a produção. O que ele alcança é o host, e é só isso que este agente oferece.
//
// Por que 127.0.0.1 e não 0.0.0.0: o `host.docker.internal` resolve para
// 192.168.65.254, endereço da VM interna do Docker Desktop, que não existe em
// nenhuma interface do Windows. O proxy do Docker Desktop entrega o tráfego em
// LOOPBACK — então escutar em 127.0.0.1 é alcançável por qualquer container e
// invisível para a rede local e para o Tailscale, sem precisar de regra de
// firewall.
//
// O outro lado da moeda: loopback também significa que todo processo desta
// máquina alcança esta porta. O token é o único controle, e ele dispara
// `git push`, `docker build` e `docker compose up` com a conta do usuário
// logado. Trate como credencial de execução remota de código.
//
// Rotas, todas exigindo o Bearer:
//   POST /lidimus-update  implanta ou ensaia; responde 202 na hora
//   GET  /execucao/<id>   como está (ou como terminou) uma execução
//   GET  /status          se há algo rodando e como terminou o último
//   GET  /pendencia       o que espera aprovação + ticket para o link do WhatsApp
//   POST /aprovar         grava o sandbox:ok vindo do celular, sem implantar
//
// Uso: node scripts/update-agent.mjs

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  aprovarSandbox, conferirTicket, hashArvore, lerEnvProducaoBruto,
  montarLinkAprovacao, raizRepo, raizSaas, resumoPendencia, valorDoEnv,
} from './lidimus-update-comum.mjs'

const PORTA = Number(process.env.PORTA_UPDATE_AGENT || 8099)
const ENDERECO = '127.0.0.1'
const ROTA = '/lidimus-update'

const envProducao = lerEnvProducaoBruto()
const URL_APROVAR = valorDoEnv(envProducao, 'LIDIMUS_APROVAR_URL')
  || 'https://n8n.gvlar.com/webhook/lidimus-aprovar'

const token = valorDoEnv(envProducao, 'LIDIMUS_UPDATE_TOKEN')
if (!token || token.length < 32) {
  console.error(
    'LIDIMUS_UPDATE_TOKEN ausente ou curto demais no lidimus-saas/.env.\n' +
    'Gere um com:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  )
  process.exit(1)
}

const digest = (v) => createHash('sha256').update(String(v)).digest()
const tokenEsperado = digest(token)

// Comparação de tempo constante — mesmo padrão do callback do n8n em
// server/api/webhooks/n8n-callback.post.ts. O sha256 antes serve para os dois
// buffers terem sempre o mesmo tamanho.
function tokenConfere(cabecalho) {
  if (!cabecalho?.startsWith('Bearer ')) return false
  return timingSafeEqual(digest(cabecalho.slice(7).trim()), tokenEsperado)
}

let emExecucao = false
let ultimoResultado = null

// Execuções desta sessão, para o n8n consultar enquanto o deploy roda.
const execucoes = new Map()
const LIMITE_EM_MEMORIA = 40

// E o histórico que sobrevive a um reinício do agente. Sem isto, `ultimoResultado`
// morre junto com o processo: em 27/08/2026 o relatório do deploy quebrado só
// existia dentro de um .log de 49 KB sem rotação, e quem foi investigar às 14h
// teve que garimpar texto corrido.
const DIR_HISTORICO = resolve(raizRepo, '.lidimus', 'historico')
const HISTORICO_A_MANTER = 60

function arquivarExecucao(execucao) {
  try {
    mkdirSync(DIR_HISTORICO, { recursive: true })
    writeFileSync(resolve(DIR_HISTORICO, `${execucao.id}.json`),
      JSON.stringify(execucao, null, 2) + '\n', 'utf8')

    const antigos = readdirSync(DIR_HISTORICO).filter((n) => n.endsWith('.json')).sort()
    for (const velho of antigos.slice(0, -HISTORICO_A_MANTER)) {
      unlinkSync(resolve(DIR_HISTORICO, velho))
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] não consegui arquivar a execução: ${e.message}`)
  }
}

function executarDeploy(script, argumentos) {
  return new Promise((resolver) => {
    const filho = spawn('node', [script, ...argumentos], {
      cwd: raizSaas,
      shell: true,
      env: process.env,
    })

    let saida = ''
    filho.stdout.on('data', (p) => { saida += p; process.stdout.write(p) })
    filho.stderr.on('data', (p) => { saida += p; process.stderr.write(p) })

    filho.on('close', (codigo) => {
      // O script imprime log legível e, na última linha, o relatório JSON. A
      // marca separa os dois sem depender de o log ser silencioso.
      const marca = saida.lastIndexOf('FIM-DO-RELATORIO')
      let relatorio = null
      if (marca !== -1) {
        try { relatorio = JSON.parse(saida.slice(marca + 'FIM-DO-RELATORIO'.length).trim()) } catch { /* abaixo */ }
      }
      resolver(relatorio ?? {
        resultado: 'erro-do-agente',
        motivo: 'o script terminou sem relatório legível',
        codigoDeSaida: codigo,
        saida: saida.slice(-3000),
      })
    })
  })
}

function lerCorpo(req) {
  return new Promise((r) => {
    let dados = ''
    req.on('data', (p) => { dados += p; if (dados.length > 10_000) req.destroy() })
    req.on('end', () => r(dados))
  })
}

const servidor = createServer(async (req, res) => {
  const responder = (status, corpo) => {
    // Sem Access-Control-Allow-Origin, de propósito: nenhuma página de
    // navegador deve conseguir ler a resposta deste agente.
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(corpo))
  }

  const url = new URL(req.url, `http://${ENDERECO}`)

  if (req.method === 'GET' && url.pathname === '/status') {
    if (!tokenConfere(req.headers.authorization)) return responder(401, { erro: 'nao autorizado' })
    return responder(200, {
      emExecucao,
      ultimoResultado,
      execucoes: [...execucoes.values()].slice(-10).map(({ id, alvo, pronto, iniciadoEm, concluidoEm, relatorio }) =>
        ({ id, alvo, pronto, iniciadoEm, concluidoEm, resultado: relatorio?.resultado || null })),
    })
  }

  // O que está esperando aprovação, mais o ticket que vira link no WhatsApp.
  // Só lê o disco e o git — é o que o lembrete das 22h chama.
  if (req.method === 'GET' && url.pathname === '/pendencia') {
    if (!tokenConfere(req.headers.authorization)) return responder(401, { erro: 'nao autorizado' })
    try {
      const pendencia = await resumoPendencia()
      // Sem mudança não há o que aprovar, e um link para aprovar o nada só
      // confundiria quem lê a mensagem.
      const link = pendencia.temMudanca ? montarLinkAprovacao(pendencia, URL_APROVAR) : {}
      return responder(200, { ...pendencia, ...link })
    } catch (e) {
      return responder(500, { erro: String(e?.message || e) })
    }
  }

  // Aceite vindo do celular. NÃO implanta: só grava o marcador, e responde em
  // segundos. Quem implanta é o workflow Lidimus Update, que o n8n chama em
  // seguida — assim o aceite passa por todos os gates do preflight, iguais aos
  // de um deploy das 5h.
  if (req.method === 'POST' && url.pathname === '/aprovar') {
    if (!tokenConfere(req.headers.authorization)) return responder(401, { erro: 'nao autorizado' })

    // Gravar o marcador no meio de um deploy é corrida com o passo que o
    // consome no fim do roteiro: a aprovação nova seria apagada sem nunca ter
    // subido.
    if (emExecucao) {
      return responder(409, { ok: false, motivo: 'já existe um deploy em andamento — espere o relatório e aprove depois' })
    }

    let pedido = {}
    try { pedido = JSON.parse(await lerCorpo(req) || '{}') } catch { /* tratado abaixo */ }

    const conferido = conferirTicket(pedido.t)
    if (!conferido.ok) return responder(401, { ok: false, motivo: conferido.motivo })

    const descricao = String(pedido.descricao || '').trim()
    if (!descricao) return responder(400, { ok: false, motivo: 'falta a descrição do que foi validado' })

    try {
      // O ponto do ticket: você aprova a árvore que a mensagem descreveu, não o
      // que estiver no disco na hora em que tocou no link. Se o código mudou
      // desde então, ninguém validou esse estado no sandbox.
      const atual = await hashArvore()
      if (atual.hash.slice(0, 32) !== conferido.payload.h) {
        // O ticket não carrega o mapa arquivo→sha (não caberia numa URL de
        // WhatsApp), então não dá para nomear o que mudou. Diz o que ele de
        // fato sabe — commit e contagem — em vez de inventar uma lista.
        const antes = conferido.payload
        const agora = Object.keys(atual.arquivos).length
        let detalhe
        if (antes.c !== atual.commit.slice(0, 7)) {
          detalhe = `o commit era ${antes.c} e agora é ${atual.commit.slice(0, 7)}`
        } else if (antes.n !== agora) {
          detalhe = `o commit é o mesmo (${antes.c}), mas os arquivos não commitados passaram de ${antes.n} para ${agora}`
        } else {
          // O caso mais comum: editar um arquivo no lugar. Commit e contagem
          // ficam iguais, e só o hash denuncia.
          detalhe = `o commit e a quantidade de arquivos são os mesmos, mas o conteúdo de algum deles mudou`
        }
        return responder(409, {
          ok: false,
          motivo: `a árvore mudou depois que este link foi gerado — ${detalhe}. `
            + 'Valide de novo no sandbox e rode `pnpm sandbox:ok` na máquina, ou espere o próximo relatório.',
        })
      }

      const marcador = await aprovarSandbox(descricao, { aprovadoPor: 'whatsapp' })
      console.log(`[${new Date().toISOString()}] aprovado pelo WhatsApp: "${descricao}" (${marcador.commit.slice(0, 7)})`)
      return responder(200, { ok: true, marcador })
    } catch (e) {
      return responder(400, { ok: false, motivo: String(e?.message || e) })
    }
  }

  // Como está a execução que o POST devolveu. É o que o n8n consulta em laço
  // enquanto o build roda.
  if (req.method === 'GET' && url.pathname.startsWith('/execucao/')) {
    if (!tokenConfere(req.headers.authorization)) return responder(401, { erro: 'nao autorizado' })
    const execucao = execucoes.get(url.pathname.slice('/execucao/'.length))
    if (!execucao) return responder(404, { erro: 'execucao desconhecida' })
    return responder(200, execucao)
  }

  if (req.method !== 'POST' || url.pathname !== ROTA) {
    return responder(404, { erro: 'nao encontrado' })
  }

  // Exigir o header Authorization (não um campo do corpo, não a querystring)
  // força o preflight de CORS, o que fecha a porta para CSRF e DNS rebinding a
  // partir de uma página aberta no navegador desta máquina.
  if (!tokenConfere(req.headers.authorization)) {
    return responder(401, { erro: 'nao autorizado' })
  }

  if (emExecucao) {
    return responder(409, { erro: 'ja existe um deploy em andamento' })
  }

  const corpo = await lerCorpo(req)

  let pedido = {}
  try { pedido = corpo ? JSON.parse(corpo) : {} } catch { /* corpo vazio é o caso normal */ }

  // Só `ensaio` é aceito como alvo alternativo, e ele escolhe um SCRIPT, não um
  // argumento: esta rota executa comandos com a conta do usuário logado, e
  // montar linha de comando a partir de texto de fora seria dar um shell a quem
  // alcançasse a porta.
  const ehEnsaio = pedido.alvo === 'ensaio'
  const script = ehEnsaio ? 'scripts/ensaio-geral.mjs' : 'scripts/lidimus-update.mjs'
  const argumentos = pedido.dryRun ? ['--dry-run'] : []

  const execucao = {
    // aaaammddhhmmss-xxxxxx: ordenável por nome, que é como o expurgo do
    // histórico decide o que apagar.
    id: `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${randomUUID().slice(0, 6)}`,
    alvo: ehEnsaio ? 'ensaio' : 'producao',
    dryRun: Boolean(pedido.dryRun),
    iniciadoEm: new Date().toISOString(),
    concluidoEm: null,
    pronto: false,
    relatorio: null,
  }
  execucoes.set(execucao.id, execucao)
  for (const velho of [...execucoes.keys()].slice(0, -LIMITE_EM_MEMORIA)) execucoes.delete(velho)

  emExecucao = true
  console.log(`[${execucao.iniciadoEm}] ${execucao.alvo} solicitado${execucao.dryRun ? ' (dry-run)' : ''} — execucao ${execucao.id}`)

  // O trabalho segue em segundo plano e a resposta sai agora.
  //
  // Era síncrono, e o nó HTTP do n8n desistia em 15 min. Um build de 20 min
  // fazia o n8n reportar "o agente do host nao respondeu" no WhatsApp ENQUANTO
  // o deploy continuava rodando aqui — relatório mentindo, e o `emExecucao`
  // segurando as tentativas seguintes sem que ninguém soubesse por quê.
  const trabalho = executarDeploy(script, argumentos)
    .then((relatorio) => relatorio)
    .catch((e) => ({ resultado: 'erro-do-agente', motivo: String(e?.message || e) }))
    .then((relatorio) => {
      execucao.relatorio = relatorio
      execucao.pronto = true
      execucao.concluidoEm = new Date().toISOString()
      ultimoResultado = relatorio
      emExecucao = false
      arquivarExecucao(execucao)
      console.log(`[${execucao.concluidoEm}] ${execucao.alvo} terminou: ${relatorio?.resultado} (${execucao.id})`)
      return relatorio
    })

  // `aguardar` existe para o uso no teclado (`curl` à mão, um teste rápido):
  // segura a conexão e devolve o relatório inteiro, como antes.
  if (pedido.aguardar) return responder(200, await trabalho)

  return responder(202, {
    aceito: true,
    execucaoId: execucao.id,
    consultarEm: `/execucao/${execucao.id}`,
    alvo: execucao.alvo,
  })
})

// Sem timeout de resposta: o build pode levar vários minutos e o n8n segura a
// conexão até o fim (o nó HTTP Request está configurado com 15 min).
servidor.timeout = 0
servidor.headersTimeout = 0
servidor.requestTimeout = 0

// Morrer alto em vez de virar processo-fantasma.
//
// Sem este handler o EADDRINUSE de um segundo agente subia como evento 'error'
// não tratado — e o processo ficava por aí sem escutar nada. Em 27/08/2026
// havia três `update-agent.mjs` vivos na máquina e só um detinha a porta; os
// outros dois eram órfãos de 20/08 que ninguém tinha como distinguir do bom.
servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(
      `A porta ${PORTA} já está ocupada — provavelmente por outro agente já rodando.\n`
      + 'Confira com:  Get-NetTCPConnection -LocalPort 8099 | Select-Object OwningProcess',
    )
  } else {
    console.error(`o servidor do agente falhou: ${e.stack || e.message}`)
  }
  process.exit(1)
})

servidor.listen(PORTA, ENDERECO, () => {
  console.log(`Lidimus Update escutando em http://${ENDERECO}:${PORTA}${ROTA}`)
  console.log('Alcançável de dentro dos containers por http://host.docker.internal:' + PORTA)
})
