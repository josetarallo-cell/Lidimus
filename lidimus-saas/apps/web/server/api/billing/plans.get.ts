import { asc } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { plans } from '@lidimus/db'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const db = useDb()

  return db
    .select({
      id: plans.id,
      name: plans.name,
      monthlyPriceCents: plans.monthlyPriceCents,
      annualPriceCents: plans.annualPriceCents,
      creditsPerCycle: plans.creditsPerCycle,
      maxUsers: plans.maxUsers,
    })
    .from(plans)
    .orderBy(asc(plans.monthlyPriceCents))
})
