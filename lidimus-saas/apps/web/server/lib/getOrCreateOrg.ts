import { eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { organizations, orgMembers } from '@lidimus/db'

// Obtém a organização pessoal do usuário (ou cria uma automaticamente no primeiro login).
export async function getOrCreatePersonalOrg(db: Db, userId: string, userName: string) {
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .innerJoin(orgMembers, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .limit(1)

  if (existing.length > 0) return existing[0].id

  const [org] = await db
    .insert(organizations)
    .values({ name: `${userName}'s workspace`, ownerId: userId })
    .returning({ id: organizations.id })

  await db.insert(orgMembers).values({ orgId: org.id, userId, role: 'owner' })

  return org.id
}
