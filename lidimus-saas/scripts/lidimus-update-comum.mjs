// Peças compartilhadas pelo Lidimus Update (sandbox-ok, n8n-diff,
// verificar-env-producao, lidimus-update e update-agent).
//
// Existe para que o marcador de aprovação seja gravado e conferido pelo MESMO
// código: se o hash da árvore fosse calculado de dois jeitos diferentes, o gate
// passaria a reprovar deploys legítimos (ou, pior, a aprovar árvores alteradas).

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
