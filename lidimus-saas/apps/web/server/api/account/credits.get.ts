import { eq, desc } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { getOrCreatePersonalOrg } from '../../lib/getOrCreateOrg'
import { creditTransactions, jobs, getOrgCreditBalance } from '@lidimus/db'

// Saldo e histórico de créditos da organização pessoal do usuário
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const orgId = await getOrCreatePersonalOrg(db, user.id, user.name)

  const [balance, transactions] = await Promise.all([
    getOrgCreditBalance(db, orgId),
    db
      .select({
        id: creditTransactions.id,
        delta: creditTransactions.delta,
        reason: creditTransactions.reason,
        createdAt: creditTransactions.createdAt,
        jobId: creditTransactions.jobId,
        jobType: jobs.type,
      })
      .from(creditTransactions)
      .leftJoin(jobs, eq(jobs.id, creditTransactions.jobId))
      .where(eq(creditTransactions.orgId, orgId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(100),
  ])

  return { orgId, balance, transactions }
})
