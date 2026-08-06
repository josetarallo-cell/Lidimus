import type { Db } from '@lidimus/db'
import { termsAcceptances } from '@lidimus/db'
import { COOKIE_ACEITE } from '../../shared/termos'

// Contexto do Better Auth, no pedaço que interessa aqui. O tipo completo
// (GenericEndpointContext) traz o container inteiro de autenticação junto; o
// registro do aceite só precisa saber de onde veio a requisição.
type ContextoAuth = {
  path?: string
  headers?: Headers
  request?: Request
} | null

// Grava o aceite dos Termos declarado no cadastro.
//
// A regra é registrar o que foi observado, não o que se supõe: a linha só nasce
// quando o cookie do aceite chega junto da requisição que cria a conta. Gravar
// para todo usuário criado — presumindo o aceite porque a tela exige a caixa —
// produziria um registro que afirma mais do que o servidor viu, e um registro
// assim não prova nada no dia em que precisar provar.
export async function registrarAceiteTermos(db: Db, userId: string, ctx: ContextoAuth) {
  const headers = ctx?.headers ?? ctx?.request?.headers
  const versao = versaoAceita(headers?.get('cookie'))

  if (!versao) {
    // Só acontece por caminho que não passa pela tela de cadastro (criação
    // manual, script). Fica no log porque é exatamente a conta que ninguém vai
    // conseguir mostrar como tendo aceitado nada.
    console.warn(`[termos] conta ${userId} criada sem cookie de aceite (via=${via(ctx?.path)})`)
    return
  }

  try {
    await db.insert(termsAcceptances).values({
      userId,
      version: versao,
      via: via(ctx?.path),
      ip: ipDaRequisicao(headers),
      userAgent: headers?.get('user-agent')?.slice(0, 500) ?? null,
    })
  } catch (err) {
    // Falhar aqui não pode derrubar o cadastro: a conta já existe neste ponto, e
    // uma exceção deixaria a pessoa com um erro na tela e a conta criada assim
    // mesmo. O aceite perdido vira ruído no log, que é onde alguém pode agir.
    console.error(`[termos] falha ao registrar aceite da conta ${userId}:`, err)
  }
}

// O valor do cookie é a própria versão aceita. Uma versão antiga vinda de um
// cookie velho é gravada como está — o que vale é o texto que a pessoa tinha na
// tela, não o que está no ar agora.
function versaoAceita(cookie: string | null | undefined): string | null {
  if (!cookie) return null

  for (const parte of cookie.split(';')) {
    const [nome, ...resto] = parte.trim().split('=')
    if (nome === COOKIE_ACEITE) {
      const valor = decodeURIComponent(resto.join('=')).trim()
      return valor || null
    }
  }
  return null
}

// '/sign-up/email' → 'email'; '/callback/google' → 'google'.
function via(path: string | undefined): string {
  if (!path) return 'desconhecido'
  if (path.startsWith('/callback/')) return path.split('/')[2] || 'social'
  if (path.startsWith('/sign-up')) return 'email'
  return 'desconhecido'
}

// IP inteiro, sem a normalização /64 de ipDoCliente: ali o endereço é chave de
// agrupamento de limites, aqui é evidência de quem aceitou.
//
// Atrás do cloudflared o remoteAddress é sempre o do proxy, e este hook não tem
// o H3Event para pedir ao h3 — o cabeçalho é a única fonte. O primeiro da lista
// do X-Forwarded-For é o cliente original.
function ipDaRequisicao(headers: Headers | undefined): string | null {
  const encaminhado = headers?.get('x-forwarded-for')?.split(',')[0]?.trim()
  return encaminhado || headers?.get('cf-connecting-ip')?.trim() || null
}
