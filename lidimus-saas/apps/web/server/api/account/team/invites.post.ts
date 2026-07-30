import { z } from 'zod'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { useDb } from '../../../lib/db'
import { useQueues } from '../../../lib/queue'
import { requireAuth } from '../../../lib/requireAuth'
import { checkRateLimit } from '../../../lib/rateLimit'
import { resolverOrgAtivaDoUsuario } from '../../../lib/orgAtiva'
import { exigirAssentoLivre, exigirDonoDaOrg } from '../../../lib/orgSeats'
import { gerarTokenDeConvite, validadeDoConvite } from '../../../lib/inviteToken'
import { sendInviteEmail } from '../../../lib/orgEmails'
import { orgInvitations, orgMembers, organizations, users } from '@lidimus/db'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  // 'owner' fica de fora: a propriedade da conta não se transfere por convite.
  // O cargo em texto livre é definido depois, na linha do membro — não faz
  // sentido pedir "escrevente" antes de saber se a pessoa vai aceitar.
  role: z.enum(['member', 'reader']).default('member'),
})

// Convida alguém para a organização ativa. Reconvidar quem já tem convite em
// aberto substitui o token antigo em vez de empilhar links válidos.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const { email, role } = bodySchema.parse(await readBody(event))

  const orgId = await resolverOrgAtivaDoUsuario(db, user.id, user.name)
  await exigirDonoDaOrg(db, orgId, user.id)

  // Teto de convites por organização: o envio é gratuito para quem dispara e
  // caro para a reputação do domínio no Resend.
  const { connection } = useQueues()
  await checkRateLimit(
    connection,
    `ratelimit:invite:${orgId}`,
    20,
    60 * 60,
    'Muitos convites em pouco tempo. Tente novamente daqui a pouco.',
  )

  if (email === user.email.toLowerCase()) {
    throw createError({ statusCode: 400, statusMessage: 'Você já faz parte desta organização.' })
  }

  const [jaMembro] = await db
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.orgId, orgId), sql`lower(${users.email}) = ${email}`))
    .limit(1)
  if (jaMembro) {
    throw createError({ statusCode: 409, statusMessage: 'Essa pessoa já faz parte da equipe.' })
  }

  await exigirAssentoLivre(db, orgId)

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  const { token, tokenHash } = gerarTokenDeConvite()
  const expiresAt = validadeDoConvite()

  const convite = await db.transaction(async (tx) => {
    // Reconvidar substitui o convite em aberto: o token antigo deixa de valer e
    // a pessoa não fica com dois links ativos na caixa de entrada.
    // (Um DELETE+INSERT em vez de ON CONFLICT porque o índice que garante a
    // unicidade é parcial e sobre uma expressão — lower(email) — e não serve
    // como alvo direto de upsert.)
    await tx
      .delete(orgInvitations)
      .where(
        and(
          eq(orgInvitations.orgId, orgId),
          isNull(orgInvitations.acceptedAt),
          sql`lower(${orgInvitations.email}) = ${email}`,
        ),
      )

    const [row] = await tx
      .insert(orgInvitations)
      .values({ orgId, email, role, tokenHash, invitedBy: user.id, expiresAt })
      .returning({ id: orgInvitations.id })

    return row
  })

  try {
    await sendInviteEmail(email, {
      orgName: org?.name ?? 'Lidimus',
      convidadoPor: user.name,
      token,
      expiraEm: expiresAt,
    })
  } catch (err) {
    // Convite que não chegou é convite que não existe: some com a linha para o
    // dono poder tentar de novo (e para o assento não ficar preso).
    await db.delete(orgInvitations).where(eq(orgInvitations.id, convite.id))
    console.error('[convite] falha ao enviar e-mail, convite desfeito', err)
    throw createError({
      statusCode: 502,
      statusMessage: 'Não conseguimos enviar o e-mail de convite. Confira o endereço e tente novamente.',
    })
  }

  return { ok: true, id: convite.id, email, expiresAt }
})
