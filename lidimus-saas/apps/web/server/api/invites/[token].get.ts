import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { hashDoToken } from '../../lib/inviteToken'
import { orgInvitations, organizations, users } from '@lidimus/db'

// Dados públicos de um convite, para a tela /convite/[token] saber o que
// mostrar antes do login. Devolve só o necessário — nome da organização, quem
// convidou e o e-mail destinatário — nunca a lista de membros.
export default defineEventHandler(async (event) => {
  const db = useDb()

  const token = getRouterParam(event, 'token') ?? ''
  if (token.length !== 64) {
    throw createError({ statusCode: 404, statusMessage: 'Convite não encontrado.' })
  }

  const [convite] = await db
    .select({
      email: orgInvitations.email,
      expiresAt: orgInvitations.expiresAt,
      acceptedAt: orgInvitations.acceptedAt,
      orgName: organizations.name,
      convidadoPor: users.name,
    })
    .from(orgInvitations)
    .innerJoin(organizations, eq(organizations.id, orgInvitations.orgId))
    .innerJoin(users, eq(users.id, orgInvitations.invitedBy))
    .where(eq(orgInvitations.tokenHash, hashDoToken(token)))
    .limit(1)

  if (!convite) {
    throw createError({ statusCode: 404, statusMessage: 'Convite não encontrado.' })
  }
  if (convite.acceptedAt) {
    throw createError({ statusCode: 410, statusMessage: 'Este convite já foi usado.' })
  }
  if (convite.expiresAt.getTime() < Date.now()) {
    throw createError({
      statusCode: 410,
      statusMessage: 'Este convite expirou. Peça um novo para quem administra a organização.',
    })
  }

  return {
    email: convite.email,
    orgName: convite.orgName,
    convidadoPor: convite.convidadoPor,
    expiresAt: convite.expiresAt,
  }
})
