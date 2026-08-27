// Consulta pública da ONR — §4 do plano, a verificação mais forte disponível.
//
// A SPA do assinador ONR (https://assinador-web.onr.org.br) usa um endpoint
// público, sem autenticação, para resolver o link que aparece nas certidões:
//
//   GET https://assinador-web.onr.org.br/api/document-keys/public/<codigo>
//
// onde `<codigo>` é o código de 4 grupos de 5 caracteres que aparece no link
// impresso na certidão (ex.: FT8Y4-MP5ZW-347UB-ULSG2) — não é o Selo TJSP nem
// o CNM, é um terceiro identificador, específico da ONR.
//
// Cuidados não negociáveis (ver o plano):
//   • é API interna, não documentada, de um SPA Angular — pode mudar sem
//     aviso. Qualquer formato inesperado vira `indisponivel`, nunca exceção;
//   • a resposta traz CPF mascarado, data de nascimento e RG do signatário —
//     este módulo NUNCA persiste esses campos, nem a assinatura em base64, nem
//     a URL do arquivo original (é credencial temporária). Só os campos que
//     `RespostaOnr` (tipos.ts) declara saem daqui;
//   • timeout curto + 1 retry — a consulta nunca pode seгurar o pipeline;
//   • cache por código, porque a resposta é imutável até `availableUntil`.
//
// O schema exato da resposta é inferido da investigação registrada no plano
// (não há documentação pública) — os caminhos de extração abaixo têm
// fallbacks defensivos e nunca lançam por causa de um campo ausente ou
// renomeado. Se a ONR mudar o formato, o sintoma é `indisponivel` silencioso;
// um teste de contrato periódico contra a API real (fora deste pacote, que não
// faz chamadas de rede em teste) é o jeito de perceber a mudança.

import type { ConsultaOnr, RespostaOnr } from './tipos.ts'

const BASE_URL = 'https://assinador-web.onr.org.br/api/document-keys/public/'
const TIMEOUT_MS = 5_000

/** `assinador-web.onr.org.br/docs/FT8Y4-MP5ZW-347UB-ULSG2` → o código depois de "docs/". */
const PADRAO_LINK_ONR = /onr\.org\.br\/docs\/([A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5})/i

/** Fallback: o código sozinho no texto, sem o link em volta. */
const PADRAO_CODIGO_SOLTO = /\b([A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5})\b/

/** Procura o código de documento da ONR no texto do OCR (link ou código solto). */
export function extrairCodigoOnrDoTexto(texto: string): string | null {
  const peloLink = texto.match(PADRAO_LINK_ONR)
  if (peloLink) return peloLink[1].toUpperCase()

  const solto = texto.match(PADRAO_CODIGO_SOLTO)
  if (solto) return solto[1].toUpperCase()

  return null
}

function textoOuNull(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor : null
}

function boolNaoVazio(valor: unknown): boolean {
  return Array.isArray(valor) && valor.length > 0
}

/**
 * Restringe a resposta bruta da ONR aos campos que este produto tem permissão
 * de guardar. Qualquer coisa fora daqui (CPF, RG, nascimento, assinatura,
 * `originalFile.url`) nunca chega a existir como variável depois desta função.
 */
function extrairRespostaSegura(bruto: unknown): RespostaOnr | null {
  if (!bruto || typeof bruto !== 'object') return null
  const raiz = bruto as Record<string, unknown>
  const document = raiz.document as Record<string, unknown> | undefined
  const metadata = document?.metadata as Record<string, unknown> | undefined
  const signers = Array.isArray(raiz.signers) ? (raiz.signers as Record<string, unknown>[]) : []
  const signer = signers[0]
  const validationResults = signer?.validationResults as Record<string, unknown> | undefined

  if (!document && !signer) return null

  return {
    cartorio: textoOuNull(metadata?.cartorio),
    cns: textoOuNull(metadata?.cns),
    validade: textoOuNull(metadata?.validade),
    signingTime: textoOuNull(signer?.signingTime),
    // Campo inferido — a investigação do plano não capturou o nome literal da
    // chave; tentamos os caminhos mais plausíveis de uma API de assinatura.
    nomeSignatario:
      textoOuNull(signer?.name) ??
      textoOuNull((signer?.certificate as Record<string, unknown> | undefined)?.subjectName) ??
      null,
    politicaAssinatura: textoOuNull(signer?.signaturePolicy),
    temErrosDeValidacao: boolNaoVazio(validationResults?.errors),
    temAvisosDeValidacao: boolNaoVazio(validationResults?.warnings),
    consultadoEm: new Date().toISOString(),
  }
}

const cache = new Map<string, RespostaOnr>()

/** Só para teste — o cache é module-level e teste nenhum deve vazar para o outro. */
export function limparCacheOnr(): void {
  cache.clear()
}

export type OpcoesConsultaOnr = {
  /** Feature flag AUTENTICIDADE_ONR_ENABLED — desligado, devolve nao_aplicavel sem tentar rede. */
  habilitado: boolean
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

async function buscarComTimeout(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Lidimus/1.0 (+https://lidimus.com.br) verificador-autenticidade' },
    })
    return resp
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Consulta a ONR pelo `codigo` de documento (não o selo, não o CNM — ver
 * `extrairCodigoOnrDoTexto`). Nunca lança: qualquer falha de rede, timeout ou
 * formato inesperado vira `{ status: 'indisponivel', resposta: null }`.
 */
export async function consultarOnr(codigo: string, opcoes: OpcoesConsultaOnr): Promise<ConsultaOnr> {
  if (!opcoes.habilitado) return { status: 'nao_aplicavel', resposta: null }

  const cacheada = cache.get(codigo)
  if (cacheada) return { status: 'consultado', resposta: cacheada }

  const fetchImpl = opcoes.fetchImpl ?? fetch
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_MS
  const url = `${BASE_URL}${encodeURIComponent(codigo)}`

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const resp = await buscarComTimeout(url, timeoutMs, fetchImpl)
    if (!resp) continue // timeout/erro de rede — tenta de novo (1 retry) ou desiste
    if (!resp.ok) return { status: 'indisponivel', resposta: null }

    try {
      const json = await resp.json()
      const resposta = extrairRespostaSegura(json)
      if (!resposta) return { status: 'indisponivel', resposta: null }
      cache.set(codigo, resposta)
      return { status: 'consultado', resposta }
    } catch {
      return { status: 'indisponivel', resposta: null }
    }
  }

  return { status: 'indisponivel', resposta: null }
}
