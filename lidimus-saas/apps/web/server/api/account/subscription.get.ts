import { eq, desc } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { getOrCreatePersonalOrg } from '../../lib/getOrCreateOrg'
import { subscriptions, plans } from '@lidimus/db'

// Assinatura mais recente da organização pessoal (ou null se nunca assinou)
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const orgId = await getOrCreatePersonalOrg(db, user.id, user.name)

  const [row] = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      createdAt: subscriptions.createdAt,
      planName: plans.name,
      monthlyPriceCents: plans.monthlyPriceCents,
      annualPriceCents: plans.annualPriceCents,
      creditsPerCycle: plans.creditsPerCycle,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.orgId, orgId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  return { orgId, subscription: row ?? null }
})
