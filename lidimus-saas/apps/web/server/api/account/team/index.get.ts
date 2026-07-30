import { and, asc, eq, gt, isNull } from 'drizzle-orm'
import { useDb } from '../../../lib/db'
import { requireAuth } from '../../../lib/requireAuth'
import { resolverOrgAtivaDoUsuario } from '../../../lib/orgAtiva'
import { contarAssentos } from '../../../lib/orgSeats'
import { orgInvitations, orgMembers, organizations, users } from '@lidimus/db'

// Equipe da organização ativa. Qualquer membro pode ver quem mais faz parte —
// só o dono é que administra (convidar, remover, renomear).
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const orgId = await resolverOrgAtivaDoUsuario(db, user.id, user.name)

  const [[org], membros, convites, assentos] = await Promise.all([
    db
      .select({ name: organizations.name, ownerId: organizations.ownerId })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: orgMembers.role,
        title: orgMembers.title,
        joinedAt: orgMembers.joinedAt,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(orgMembers.orgId, orgId))
      .orderBy(asc(orgMembers.joinedAt)),
    db
      .select({
        id: orgInvitations.id,
        email: orgInvitations.email,
        role: orgInvitations.role,
        createdAt: orgInvitations.createdAt,
        expiresAt: orgInvitations.expiresAt,
      })
      .from(orgInvitations)
      .where(
        and(
          eq(orgInvitations.orgId, orgId),
          isNull(orgInvitations.acceptedAt),
          gt(orgInvitations.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(orgInvitations.createdAt)),
    contarAssentos(db, orgId),
  ])

  return {
    orgId,
    orgName: org?.name ?? '',
    souDono: org?.ownerId === user.id,
    membros,
    convites,
    assentos,
  }
})
