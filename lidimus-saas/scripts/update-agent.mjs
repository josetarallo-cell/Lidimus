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
// Uso: node scripts/update-agent.mjs

import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { lerEnvProducaoBruto, raizSaas, valorDoEnv } from './lidimus-update-comum.mjs'

const PORTA = Number(process.env.PORTA_UPDATE_AGENT || 8099)
const ENDERECO = '127.0.0.1'
const ROTA = '/lidimus-update'

const token = valorDoEnv(lerEnvProducaoBruto(), 'LIDIMUS_UPDATE_TOKEN')
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

function executarDeploy(argumentos) {
  return new Promise((resolver) => {
    const filho = spawn('node', ['scripts/lidimus-update.mjs', ...argumentos], {
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
    return responder(200, { emExecucao, ultimoResultado })
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

  const corpo = await new Promise((r) => {
    let dados = ''
    req.on('data', (p) => { dados += p; if (dados.length > 10_000) req.destroy() })
    req.on('end', () => r(dados))
  })

  let pedido = {}
  try { pedido = corpo ? JSON.parse(corpo) : {} } catch { /* corpo vazio é o caso normal */ }

  emExecucao = true
  console.log(`[${new Date().toISOString()}] deploy solicitado${pedido.dryRun ? ' (dry-run)' : ''}`)

  try {
    ultimoResultado = await executarDeploy(pedido.dryRun ? ['--dry-run'] : [])
    responder(200, ultimoResultado)
  } catch (e) {
    ultimoResultado = { resultado: 'erro-do-agente', motivo: String(e?.message || e) }
    responder(500, ultimoResultado)
  } finally {
    emExecucao = false
    console.log(`[${new Date().toISOString()}] deploy terminou: ${ultimoResultado?.resultado}`)
  }
})

// Sem timeout de resposta: o build pode levar vários minutos e o n8n segura a
// conexão até o fim (o nó HTTP Request está configurado com 15 min).
servidor.timeout = 0
servidor.headersTimeout = 0
servidor.requestTimeout = 0

servidor.listen(PORTA, ENDERECO, () => {
  console.log(`Lidimus Update escutando em http://${ENDERECO}:${PORTA}${ROTA}`)
  console.log('Alcançável de dentro dos containers por http://host.docker.internal:' + PORTA)
})
