import type { H3Event, EventHandlerRequest } from 'h3'

// Erros da API pública têm código estável e mensagem em português.
//
// O código é o contrato: é nele que a integração do cliente ramifica ("sem
// crédito → avisa o financeiro", "429 → espera e tenta de novo"). A mensagem é
// para o humano que lê o log e muda de release para release; o código, não.
//
// Por que um envelope próprio em vez do erro padrão do Nitro: a resposta de erro
// do Nitro carrega `statusMessage`, `message` e, fora de produção, `stack` — sem
// nenhum campo estável para o cliente programar contra, e com risco de vazar
// detalhe interno (o achado S6 da análise de jul/2026 era exatamente isso).

export type CodigoErro =
  | 'tls_obrigatorio'
  | 'credencial_invalida'
  | 'plano_sem_api'
  | 'chave_orfa'
  | 'sem_acesso_a_ferramenta'
  | 'creditos_insuficientes'
  | 'limite_de_uso'
  | 'arquivo_invalido'
  | 'arquivo_grande_demais'
  | 'requisicao_invalida'
  | 'nao_encontrado'
  | 'erro_interno'

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: CodigoErro,
    mensagem: string,
    // Cabeçalhos que fazem parte da semântica do erro (WWW-Authenticate no 401,
    // Retry-After no 429).
    readonly headers?: Record<string, string>,
  ) {
    super(mensagem)
    this.name = 'ErroApi'
  }
}

export function erroApi(
  status: number,
  codigo: CodigoErro,
  mensagem: string,
  headers?: Record<string, string>,
): ErroApi {
  return new ErroApi(status, codigo, mensagem, headers)
}

// Erros levantados pelo miolo compartilhado (exigirAcesso, checkRateLimit, o
// débito de crédito) são H3Error com mensagem já escrita para gente. Aqui eles
// ganham código sem perder a mensagem — traduzir na fronteira, em vez de espalhar
// conhecimento de API pública dentro das funções de domínio.
const CODIGO_POR_STATUS: Record<number, CodigoErro> = {
  400: 'requisicao_invalida',
  401: 'credencial_invalida',
  402: 'creditos_insuficientes',
  403: 'sem_acesso_a_ferramenta',
  404: 'nao_encontrado',
  413: 'arquivo_grande_demais',
  // 415 vem de assertPdfSignature (arquivo que não é PDF) e da recusa de um lote
  // com arquivo inválido. Sem esta linha caía no ramo do 500: a integração
  // recebia `erro_interno` e a mensagem genérica por ter enviado um arquivo
  // errado — um erro dela, apresentado como falha nossa.
  415: 'arquivo_invalido',
  429: 'limite_de_uso',
}

type H3ErrorLike = { statusCode?: number; statusMessage?: string; data?: unknown }

function traduzir(err: unknown): { status: number; codigo: CodigoErro; mensagem: string } {
  if (err instanceof ErroApi) {
    return { status: err.status, codigo: err.codigo, mensagem: err.message }
  }

  const h3 = err as H3ErrorLike
  const status = typeof h3?.statusCode === 'number' ? h3.statusCode : 500

  // 5xx nunca repassa mensagem: o que veio do Postgres, do GCS ou do Redis é
  // diagnóstico nosso, não recado para o cliente.
  if (status >= 500 || !CODIGO_POR_STATUS[status]) {
    return {
      status: status >= 500 ? status : 500,
      codigo: 'erro_interno',
      mensagem: 'Falha ao processar a requisição. Tente novamente em instantes.',
    }
  }

  return {
    status,
    codigo: CODIGO_POR_STATUS[status],
    mensagem: h3.statusMessage || 'Requisição recusada.',
  }
}

type Handler<T> = (event: H3Event<EventHandlerRequest>) => Promise<T> | T

// Envelopa uma rota da v1: erro sempre no mesmo formato, resposta nunca cacheada.
export function defineRotaApi<T>(handler: Handler<T>) {
  return defineEventHandler(async (event) => {
    // Resposta de API carrega dado de cliente e é autenticada por credencial de
    // portador — nada disso pode encostar em cache de proxy.
    setResponseHeader(event, 'Cache-Control', 'no-store')

    try {
      return await handler(event)
    } catch (err) {
      const { status, codigo, mensagem } = traduzir(err)

      if (status >= 500) {
        // Fica no log do servidor, não na resposta.
        console.error('[api/v1] erro não tratado:', err)
      }

      if (err instanceof ErroApi && err.headers) {
        for (const [nome, valor] of Object.entries(err.headers)) {
          setResponseHeader(event, nome, valor)
        }
      }

      setResponseStatus(event, status)
      return { erro: { codigo, mensagem } }
    }
  })
}
