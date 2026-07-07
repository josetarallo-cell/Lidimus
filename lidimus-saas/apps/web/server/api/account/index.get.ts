import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { organizations, orgMembers } from '@lidimus/db'

// Perfil do usuário + organizações de que participa
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      role: orgMembers.role,
      joinedAt: orgMembers.joinedAt,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(eq(orgMembers.userId, user.id))

  return {
    user: { id: user.id, name: user.name, email: user.email, isPlatformAdmin: user.isPlatformAdmin },
    orgs,
  }
})
