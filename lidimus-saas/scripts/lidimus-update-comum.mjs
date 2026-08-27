// Peças compartilhadas pelo Lidimus Update (sandbox-ok, n8n-diff,
// verificar-env-producao, lidimus-update e update-agent).
//
// Existe para que o marcador de aprovação seja gravado e conferido pelo MESMO
// código: se o hash da árvore fosse calculado de dois jeitos diferentes, o gate
// passaria a reprovar deploys legítimos (ou, pior, a aprovar árvores alteradas).

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PORTA_WEB } from './sandbox-env.mjs'

export const raizSaas = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const raizRepo = resolve(raizSaas, '..')
export const CAMINHO_MARCADOR = resolve(raizRepo, '.lidimus', 'sandbox-aprovado.json')
export const CAMINHO_ENV_PROD = resolve(raizSaas, '.env')

// O Git Credential Manager abre uma JANELA GRÁFICA quando a credencial expira.
// Num deploy das 5h isso não é um erro: é um processo pendurado para sempre,
// segurando o lock do agente. Estas duas variáveis transformam o prompt em
// falha imediata, que vira relatório no WhatsApp.
export const ENV_GIT_NAO_INTERATIVO = {
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
}

// Wrapper de spawn que captura saída em vez de herdar o terminal — o relatório
// precisa do texto dos comandos, e o agente HTTP não tem terminal para herdar.
export function executar(comando, args, opcoes = {}) {
  const { cwd = raizSaas, env = {}, timeoutMs = 15 * 60 * 1000, entrada } = opcoes

  return new Promise((resolver) => {
    const filho = spawn(comando, args, {
      cwd,
      shell: true,
      env: { ...process.env, ...ENV_GIT_NAO_INTERATIVO, ...env },
    })

    let saida = ''
    let erro = ''
    let expirou = false

    const relogio = setTimeout(() => {
      expirou = true
      filho.kill('SIGKILL')
    }, timeoutMs)

    filho.stdout.on('data', (p) => { saida += p })
    filho.stderr.on('data', (p) => { erro += p })

    if (entrada !== undefined) {
      filho.stdin.write(entrada)
      filho.stdin.end()
    }

    filho.on('error', (e) => {
      clearTimeout(relogio)
      resolver({ ok: false, codigo: -1, saida, erro: String(e.message), comando: `${comando} ${args.join(' ')}` })
    })

    filho.on('close', (codigo) => {
      clearTimeout(relogio)
      resolver({
        ok: codigo === 0 && !expirou,
        codigo: expirou ? -2 : codigo,
        saida: saida.trim(),
        erro: expirou ? `expirou apos ${Math.round(timeoutMs / 1000)}s` : erro.trim(),
        comando: `${comando} ${args.join(' ')}`,
      })
    })
  })
}

export async function git(args, opcoes = {}) {
  return executar('git', args, { cwd: raizRepo, ...opcoes })
}

// Impressão digital do que está no disco AGORA.
//
// O sandbox builda a árvore de trabalho, não o último commit (docs/20-deploy.md
// avisa disso) — então "o que foi validado no sandbox" só pode ser identificado
// pelo estado do disco, não pelo histórico do git.
//
// Devolve também o mapa arquivo→sha. Só o hash agregado diria "a árvore mudou"
// e nada mais: às 5h da manhã, com o relatório sendo lido horas depois, a
// diferença entre "o formatador do editor trocou as quebras de linha" e
// "alguém mexeu no código de verdade" é o que decide o que fazer.
export async function hashArvore() {
  const cabeca = await git(['rev-parse', 'HEAD'])
  if (!cabeca.ok) throw new Error(`git rev-parse falhou: ${cabeca.erro}`)

  // Dois comandos que devolvem caminho puro, em vez de `git status --porcelain`.
  // O porcelain prefixa cada linha com o código de estado e um espaço (" M x"),
  // e o trim() que este módulo aplica à saída comia o espaço da PRIMEIRA linha
  // — resultado: o primeiro arquivo da lista virava "gitignore" em vez de
  // ".gitignore", e era hasheado como se tivesse sido apagado.
  const modificados = await git(['diff', '--name-only', 'HEAD'])
  if (!modificados.ok) throw new Error(`git diff --name-only falhou: ${modificados.erro}`)

  const naoRastreados = await git(['ls-files', '--others', '--exclude-standard'])
  if (!naoRastreados.ok) throw new Error(`git ls-files falhou: ${naoRastreados.erro}`)

  const arquivos = {}
  const lista = [...modificados.saida.split(/\r?\n/), ...naoRastreados.saida.split(/\r?\n/)]
  for (const caminho of lista.filter(Boolean)) {
    const absoluto = resolve(raizRepo, caminho)
    arquivos[caminho] = existsSync(absoluto)
      ? createHash('sha256').update(readFileSync(absoluto)).digest('hex').slice(0, 16)
      : 'apagado'
  }

  const soma = createHash('sha256')
  soma.update(cabeca.saida)
  for (const caminho of Object.keys(arquivos).sort()) {
    soma.update(` ${caminho}:${arquivos[caminho]}`)
  }

  return { commit: cabeca.saida, hash: soma.digest('hex'), arquivos }
}

// Diz exatamente o que saiu do lugar desde a aprovação.
export function compararArvores(aprovados = {}, atuais = {}) {
  const mudancas = []
  for (const caminho of new Set([...Object.keys(aprovados), ...Object.keys(atuais)])) {
    if (aprovados[caminho] === atuais[caminho]) continue
    if (!(caminho in aprovados)) mudancas.push(`${caminho} (novo)`)
    else if (!(caminho in atuais)) mudancas.push(`${caminho} (voltou ao estado commitado)`)
    else mudancas.push(`${caminho} (alterado)`)
  }
  return mudancas.sort()
}

export function lerMarcador() {
  if (!existsSync(CAMINHO_MARCADOR)) return null
  try {
    return JSON.parse(readFileSync(CAMINHO_MARCADOR, 'utf8'))
  } catch (e) {
    throw new Error(`.lidimus/sandbox-aprovado.json ilegível: ${e.message}`)
  }
}

// Grava o marcador de aprovação. Mora aqui, e não no sandbox-ok.mjs, porque
// existem dois caminhos até ele — o `pnpm sandbox:ok` do teclado e o aceite pelo
// WhatsApp (update-agent.mjs) — e os dois precisam impor exatamente as mesmas
// condições. Duplicar isso seria criar uma porta dos fundos sem a checagem de
// saúde do sandbox.
//
// Lança Error com texto de mensagem pronta: o chamador HTTP devolve esse texto
// direto para a tela do celular, e o CLI imprime no terminal.
export async function aprovarSandbox(descricao, { aprovadoPor } = {}) {
  const texto = String(descricao || '').trim()
  if (!texto) throw new Error('falta a descrição do que foi validado')

  // Aprovar um sandbox que não está de pé é quase sempre engano: ou o container
  // caiu, ou o que foi testado foi o `nuxt dev` no host, que não passa pelo
  // build do container — justamente onde os erros de build aparecem.
  const url = `http://127.0.0.1:${PORTA_WEB}/api/health`
  let saude
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(5000) })
    saude = await resposta.json()
  } catch (e) {
    throw new Error(`o sandbox não respondeu em ${url} (${e.message}) — suba com \`pnpm sandbox:up\` e valide lá antes de aprovar`)
  }
  if (saude?.status !== 'ok') {
    throw new Error(`o sandbox respondeu, mas não está saudável: ${JSON.stringify(saude)}`)
  }

  const { commit, hash, arquivos } = await hashArvore()

  const marcador = {
    descricao: texto,
    commit,
    hashArvore: hash,
    arquivos,
    aprovadoEm: new Date().toISOString(),
    aprovadoPor: aprovadoPor || process.env.USERNAME || process.env.USER || 'desconhecido',
  }

  mkdirSync(dirname(CAMINHO_MARCADOR), { recursive: true })
  writeFileSync(CAMINHO_MARCADOR, JSON.stringify(marcador, null, 2) + '\n', 'utf8')
  return marcador
}

// O que está esperando aprovação, na forma que o WhatsApp precisa mostrar.
//
// Usado pelo lembrete das 22h e pelo próprio relatório das 5h quando ele termina
// em `nada-a-fazer` — é o que transforma um "💤 nada aprovado" mudo na lista do
// que ficou para trás.
export async function resumoPendencia() {
  const { commit, hash, arquivos } = await hashArvore()

  // Sem fetch a contagem mente depois de um push feito de outra máquina. Falha
  // de rede aqui não é motivo para não mandar o lembrete: segue com o que tem.
  await git(['fetch', 'origin', 'main'], { timeoutMs: 30000 })
  const log = await git(['log', '--oneline', 'origin/main..HEAD'])
  const commits = log.ok ? log.saida.split(/\r?\n/).filter(Boolean) : []

  const assunto = await git(['log', '-1', '--format=%s'])

  const marcador = lerMarcador()
  const nomes = Object.keys(arquivos)

  return {
    commit,
    hash,
    arquivos: nomes,
    commits,
    commitsAFrente: commits.length,
    jaAprovado: Boolean(marcador),
    // Sem árvore suja e sem commit à frente não há o que promover — é o dia em
    // que ninguém mexeu em nada, e o lembrete deve ficar calado.
    temMudanca: nomes.length > 0 || commits.length > 0,
    descricaoSugerida: assunto.ok ? assunto.saida.slice(0, 80) : '',
  }
}

// ------------------------------------------------------------------ tickets
//
// O link de aprovação que vai no WhatsApp precisa provar duas coisas quando
// voltar: que saiu daqui, e que se refere à árvore que a mensagem descreveu.
// Um ticket assinado resolve as duas sem guardar estado nenhum — e sem segredo
// novo, porque a chave é derivada do LIDIMUS_UPDATE_TOKEN que o agente já usa.

const VALIDADE_HORAS = Number(process.env.LIDIMUS_TICKET_HORAS || 18)

function chaveDeTicket() {
  const token = valorDoEnv(lerEnvProducaoBruto(), 'LIDIMUS_UPDATE_TOKEN')
  if (!token || token.length < 32) {
    throw new Error('LIDIMUS_UPDATE_TOKEN ausente ou curto demais no lidimus-saas/.env')
  }
  // Derivar em vez de usar o token cru: quem capturar um ticket não fica com a
  // credencial que dispara deploy no agente.
  return createHash('sha256').update(token + ':aprovacao').digest()
}

const paraBase64Url = (buf) => Buffer.from(buf).toString('base64url')
const assinar = (corpo) => createHmac('sha256', chaveDeTicket()).update(corpo).digest()

// O hash da árvore entra truncado em 128 bits: é o que decide o tamanho do link
// no WhatsApp, e forjar não é o risco (a assinatura cobre isso) — colisão
// acidental em 128 bits, muito menos.
export function criarTicket(pendencia) {
  const payload = {
    h: pendencia.hash.slice(0, 32),
    c: pendencia.commit.slice(0, 7),
    n: pendencia.arquivos.length,
    a: pendencia.arquivos.slice(0, 3).map((p) => p.split(/[\\/]/).pop()),
    f: pendencia.commitsAFrente,
    d: (pendencia.descricaoSugerida || '').slice(0, 80),
    exp: Math.floor(Date.now() / 1000) + VALIDADE_HORAS * 3600,
  }
  const corpo = paraBase64Url(JSON.stringify(payload))
  return `${corpo}.${paraBase64Url(assinar(corpo))}`
}

// Devolve { ok, payload } ou { ok: false, motivo }. Nunca lança: o chamador é um
// endpoint HTTP recebendo texto de fora.
export function conferirTicket(ticket) {
  const partes = String(ticket || '').split('.')
  if (partes.length !== 2) return { ok: false, motivo: 'link inválido' }

  const [corpo, assinatura] = partes
  let recebida
  try { recebida = Buffer.from(assinatura, 'base64url') } catch { return { ok: false, motivo: 'link inválido' } }

  const esperada = assinar(corpo)
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) {
    return { ok: false, motivo: 'link inválido — a assinatura não confere' }
  }

  let payload
  try { payload = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) } catch {
    return { ok: false, motivo: 'link inválido' }
  }

  if (!payload?.exp || payload.exp * 1000 < Date.now()) {
    return { ok: false, motivo: `link vencido (valia ${VALIDADE_HORAS}h) — o próximo relatório traz um novo` }
  }

  return { ok: true, payload }
}

// O link pronto para colar no WhatsApp, com a validade já em texto — quem lê a
// mensagem precisa saber se ainda dá tempo sem ter que decodificar nada.
export function montarLinkAprovacao(pendencia, urlBase) {
  const ticket = criarTicket(pendencia)
  const exp = new Date((espiarTicket(ticket).exp) * 1000)
  return {
    ticket,
    url: `${urlBase}?t=${ticket}`,
    validoAte: exp.toISOString(),
    validoAteTexto: exp.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }),
  }
}

// Lê o payload sem conferir assinatura. Só para a PÁGINA montar o resumo do que
// está sendo aprovado: quem valida de verdade é o agente, no POST.
export function espiarTicket(ticket) {
  try {
    return JSON.parse(Buffer.from(String(ticket).split('.')[0], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

// O .env de produção é lido cru (não parseado) porque verificarEspelhoNuxt()
// trabalha em cima do texto, e porque nada aqui precisa dos valores.
export function lerEnvProducaoBruto() {
  if (!existsSync(CAMINHO_ENV_PROD)) {
    throw new Error('lidimus-saas/.env não existe — é o .env de produção')
  }
  return readFileSync(CAMINHO_ENV_PROD, 'utf8')
}

export function valorDoEnv(bruto, chave) {
  const achado = bruto.match(new RegExp(`^${chave}=(.*)$`, 'm'))
  return achado ? achado[1].trim().replace(/^["']|["']$/g, '') : null
}

export function carimbo(data = new Date()) {
  const d = (n) => String(n).padStart(2, '0')
  return `${data.getFullYear()}${d(data.getMonth() + 1)}${d(data.getDate())}`
    + `-${d(data.getHours())}${d(data.getMinutes())}${d(data.getSeconds())}`
}

export async function buscarComRepeticao(url, { tentativas = 1, esperaMs = 3000, timeoutMs = 10000 } = {}) {
  let ultimo = null
  for (let i = 0; i < tentativas; i++) {
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      const corpo = await resposta.text()
      if (resposta.ok) return { ok: true, status: resposta.status, corpo, tentativa: i + 1 }
      ultimo = { ok: false, status: resposta.status, corpo, tentativa: i + 1 }
    } catch (e) {
      ultimo = { ok: false, status: 0, corpo: '', erro: String(e.message), tentativa: i + 1 }
    }
    if (i < tentativas - 1) await new Promise((r) => setTimeout(r, esperaMs))
  }
  return ultimo
}
