import { eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { organizations, orgMembers, creditTransactions, SIGNUP_GRANT_CREDITS } from '@lidimus/db'

// Obtém a organização pessoal do usuário (ou cria uma automaticamente no primeiro login).
export async function getOrCreatePersonalOrg(db: Db, userId: string, userName: string) {
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .innerJoin(orgMembers, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .limit(1)

  if (existing.length > 0) return existing[0].id

  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name: `${userName}'s workspace`, ownerId: userId })
      .returning({ id: organizations.id })

    await tx.insert(orgMembers).values({ orgId: org.id, userId, role: 'owner' })

    await tx.insert(creditTransactions).values({
      orgId: org.id,
      delta: SIGNUP_GRANT_CREDITS,
      reason: 'signup_grant',
    })

    return org.id
  })
}
