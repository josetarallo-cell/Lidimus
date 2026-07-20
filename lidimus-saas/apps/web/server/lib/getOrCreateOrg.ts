import { eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { organizations, orgMembers, creditTransactions, SIGNUP_GRANT_CREDITS } from '@lidimus/db'

// Código de erro do Postgres para violação de unicidade (unique_violation).
const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION
}

async function findPersonalOrg(db: Db, userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .innerJoin(orgMembers, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .limit(1)
  return row?.id
}

// Obtém a organização pessoal do usuário (ou cria uma automaticamente no primeiro login).
export async function getOrCreatePersonalOrg(db: Db, userId: string, userName: string) {
  const existing = await findPersonalOrg(db, userId)
  if (existing) return existing

  try {
    return await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: `${userName}'s workspace`, ownerId: userId })
        .returning({ id: organizations.id })

      // org_members_one_owner_per_user_idx rejeita esta linha se outra
      // requisição concorrente já criou a org pessoal do usuário — o catch
      // abaixo trata a corrida sem duplicar org nem bônus de créditos.
      await tx.insert(orgMembers).values({ orgId: org.id, userId, role: 'owner' })

      await tx.insert(creditTransactions).values({
        orgId: org.id,
        delta: SIGNUP_GRANT_CREDITS,
        reason: 'signup_grant',
      })

      return org.id
    })
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    // Perdemos a corrida do primeiro login: a transação inteira (incluindo a
    // organização recém-criada) foi revertida — usa a org que já venceu.
    const winner = await findPersonalOrg(db, userId)
    if (!winner) throw err
    return winner
  }
}
