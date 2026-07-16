import { eq, desc } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { useStripe } from '../../lib/stripe'
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
      providerSubscriptionId: subscriptions.providerSubscriptionId,
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

  if (!row) return { orgId, subscription: null }

  // O ciclo (mensal/anual) e o valor cobrado vivem no preço da assinatura no
  // Stripe — o banco só guarda o plano. Se o Stripe estiver indisponível,
  // degrada para o preço mensal da tabela `plans`.
  let cycle: 'mensal' | 'anual' = 'mensal'
  let priceCents = row.monthlyPriceCents
  if (row.providerSubscriptionId && row.status !== 'canceled') {
    try {
      const stripe = useStripe()
      const stripeSub = await stripe.subscriptions.retrieve(row.providerSubscriptionId)
      const price = stripeSub.items.data[0]?.price
      if (price?.recurring?.interval === 'year') cycle = 'anual'
      if (typeof price?.unit_amount === 'number') priceCents = price.unit_amount
    } catch {
      // sem Stripe (dev) ou falha pontual: mantém o fallback mensal
    }
  }

  const { providerSubscriptionId: _omit, ...subscription } = row
  return { orgId, subscription: { ...subscription, cycle, priceCents } }
})
