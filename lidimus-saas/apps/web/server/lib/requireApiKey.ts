import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { apiKeys, orgMembers, hashDaChave, pareceChave, planoLiberaApi } from '@lidimus/db'
import { useDb } from './db'
import { useQueues } from './queue'
import { checkRateLimit } from './rateLimit'
import { ipDoCliente } from './ipDoCliente'
import { erroApi } from './v1/erroApi'

// Autenticação da API pública. É o irmão de requireAuth, deliberadamente
// separado dele.
//
// Por que não ramificar server/middleware/auth.ts para aceitar `Authorization`
// além do cookie: manter os dois mundos estanques dá duas propriedades de graça.
// (1) A v1 nunca autentica por cookie, então nenhuma requisição disparada por
// navegador de terceiro se autentica sozinha — não existe superfície de CSRF na
// API. (2) As rotas de sessão nunca aceitam chave, então uma chave vazada não
// vira acesso ao painel, à equipe, ao Stripe ou à troca de plano: o raio de dano
// da credencial é exatamente a v1.

export type ContextoApi = {
  keyId: string
  orgId: string
  // Proprietário que emitiu a chave. Vai para jobs.user_id — a análise feita
  // pela API tem o mesmo tipo de responsável que a feita na tela.
  userId: string
  prefix: string
}

// Uma mensagem só para credencial ausente, malformada, desconhecida, revogada e
// expirada. Distinguir os casos ensinaria a quem sonda que o token em mãos existe
// de verdade; o dono legítimo vê o motivo real na tela, onde já está autenticado.
const CREDENCIAL_INVALIDA = 'Credencial ausente ou inválida.'

// Janela e teto das falhas de autenticação por IP.
const FALHAS_JANELA_SEGUNDOS = 300
const FALHAS_LIMITE = 20

// lastUsedAt serve para o dono saber se a integração está viva, não para auditar
// chamada por chamada — atualizar a cada requisição transformaria um lote em um
// UPDATE por análise, de graça.
const INTERVALO_MARCA_USO_MS = 5 * 60 * 1000

export async function requireApiKey(event: H3Event): Promise<ContextoApi> {
  const db = useDb()
  const { connection } = useQueues()

  // ── 1. Exigir TLS ─────────────────────────────────────────────────────────
  // Credencial de portador em canal claro é credencial vazada. Melhor o cliente
  // receber um erro alto na integração do que vazar a chave em silêncio.
  // Atrás do proxy quem sabe o esquema original é o cabeçalho, não a conexão.
  const proto = getRequestHeader(event, 'x-forwarded-proto')?.split(',')[0]?.trim()
  const ehProducao = process.env.NODE_ENV === 'production'
  if (ehProducao && proto && proto !== 'https') {
    throw erroApi(
      400,
      'tls_obrigatorio',
      'A API só aceita requisições por HTTPS. Refaça a chamada em https:// — e considere a chave usada comprometida, revogando-a em Conta → API.',
    )
  }

  // ── 2. Extrair o cabeçalho ────────────────────────────────────────────────
  // Só `Authorization: Bearer`. Token em query string nunca: query string entra
  // em log de acesso, em histórico de proxy e no cabeçalho Referer.
  const authorization = getRequestHeader(event, 'authorization') ?? ''
  const [esquema, token] = authorization.split(' ')

  const naoAutenticado = () =>
    erroApi(401, 'credencial_invalida', CREDENCIAL_INVALIDA, {
      'WWW-Authenticate': 'Bearer realm="lidimus-api"',
    })

  if (esquema?.toLowerCase() !== 'bearer' || !token || !pareceChave(token)) {
    await registrarFalha(connection, event)
    throw naoAutenticado()
  }

  // ── 3./4. Buscar pelo hash ────────────────────────────────────────────────
  // Sem timingSafeEqual: a busca é pelo hash da entrada de quem chama, e o tempo
  // da consulta indexada não revela nada sobre as chaves alheias. É o mesmo
  // raciocínio do token de convite — ao contrário de jobFiles.accessToken, que é
  // comparado em memória e por isso precisa de comparação em tempo constante.
  const [chave] = await db
    .select({
      id: apiKeys.id,
      orgId: apiKeys.orgId,
      createdBy: apiKeys.createdBy,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashDaChave(token)))
    .limit(1)

  // ── 5. Rejeitar com mensagem única ────────────────────────────────────────
  const agora = new Date()
  if (!chave || chave.revokedAt || chave.expiresAt <= agora) {
    await registrarFalha(connection, event)
    throw naoAutenticado()
  }

  // ── 6. Revalidar o plano ──────────────────────────────────────────────────
  // O passo que faz o gate ser real: rebaixamento, cancelamento e inadimplência
  // cortam a API na requisição seguinte, sem depender de alguém revogar chave.
  // A chave não é um passe permanente — é uma credencial de identidade, e a
  // autorização é sempre lida do plano vigente.
  if (!(await planoLiberaApi(db, chave.orgId))) {
    throw erroApi(
      403,
      'plano_sem_api',
      'A API está disponível nos planos Escritório e Enterprise. Verifique a assinatura da sua organização em Conta → Assinatura.',
    )
  }

  // ── 7. O emissor ainda pertence à organização ─────────────────────────────
  // A análise criada pela chave é atribuída a quem a emitiu. Se essa pessoa saiu
  // da empresa, a chave para de valer: credencial de ex-integrante não segue
  // gastando o crédito de quem ficou. O proprietário atual emite outra.
  const [vinculo] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, chave.orgId), eq(orgMembers.userId, chave.createdBy)))
    .limit(1)

  if (!vinculo) {
    throw erroApi(
      403,
      'chave_orfa',
      'Quem emitiu esta chave não faz mais parte da organização. Peça ao proprietário da conta para emitir uma nova em Conta → API.',
    )
  }

  // ── 8. Marcar uso, com parcimônia ─────────────────────────────────────────
  const desatualizado =
    !chave.lastUsedAt || agora.getTime() - chave.lastUsedAt.getTime() > INTERVALO_MARCA_USO_MS
  if (desatualizado) {
    await db.update(apiKeys).set({ lastUsedAt: agora }).where(eq(apiKeys.id, chave.id))
  }

  return { keyId: chave.id, orgId: chave.orgId, userId: chave.createdBy, prefix: chave.prefix }
}

// Contador de falhas por IP. Não é defesa contra força bruta — 256 bits de
// entropia não se quebram por tentativa — é defesa contra varredura barulhenta:
// quem sonda a API com lixo consome Redis, não Postgres. Só incrementa em falha,
// então integração saudável nunca encosta no teto.
async function registrarFalha(connection: Parameters<typeof checkRateLimit>[0], event: H3Event) {
  await checkRateLimit(
    connection,
    `ratelimit:api-auth-fail:${ipDoCliente(event)}`,
    FALHAS_LIMITE,
    FALHAS_JANELA_SEGUNDOS,
    'Muitas tentativas de autenticação recusadas. Aguarde alguns minutos.',
  )
}
