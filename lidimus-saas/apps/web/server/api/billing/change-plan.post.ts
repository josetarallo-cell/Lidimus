import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { useStripe } from '../../lib/stripe'
import { requireAuth } from '../../lib/requireAuth'
import { getOrCreatePersonalOrg } from '../../lib/getOrCreateOrg'
import { sendPlanChangedEmail } from '../../lib/subscriptionEmails'
import { plans, subscriptions, creditTransactions } from '@lidimus/db'

const bodySchema = z.object({
  planId: z.string().uuid(),
})

// Migração de plano de uma assinatura ativa.
// Upgrade: imediato — cobra a diferença proporcional do ciclo (always_invoice) e
//   credita na hora a diferença de créditos (novo − atual).
// Downgrade: sem cobrança/estorno — o preço muda para a próxima renovação
//   (proration none) e o usuário mantém preço e créditos já pagos do ciclo atual.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()
  const stripe = useStripe()

  const { planId } = bodySchema.parse(await readBody(event))

  const orgId = await getOrCreatePersonalOrg(db, user.id, user.name)

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Nenhuma assinatura ativa para alterar. Assine um plano primeiro.',
    })
  }
  if (!sub.providerSubscriptionId) {
    throw createError({ statusCode: 400, statusMessage: 'Assinatura sem vínculo com o Stripe.' })
  }
  if (sub.planId === planId) {
    throw createError({ statusCode: 400, statusMessage: 'Este já é o seu plano atual.' })
  }

  const [currentPlan] = await db.select().from(plans).where(eq(plans.id, sub.planId)).limit(1)
  const [newPlan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
  if (!currentPlan || !newPlan) {
    throw createError({ statusCode: 404, statusMessage: 'Plano não encontrado.' })
  }

  // Mantém o ciclo atual (mensal/anual) — a troca de ciclo fica fora do escopo
  const stripeSub = await stripe.subscriptions.retrieve(sub.providerSubscriptionId)
  const item = stripeSub.items.data[0]
  if (!item) throw createError({ statusCode: 502, statusMessage: 'Assinatura sem itens no Stripe.' })

  const interval = item.price.recurring?.interval === 'year' ? 'year' : 'month'
  const cycle = interval === 'year' ? 'anual' : 'mensal'
  const isUpgrade = newPlan.monthlyPriceCents > currentPlan.monthlyPriceCents

  const updated = await stripe.subscriptions.update(sub.providerSubscriptionId, {
    items: [
      {
        id: item.id,
        price_data: {
          currency: 'brl',
          unit_amount: cycle === 'anual' ? newPlan.annualPriceCents : newPlan.monthlyPriceCents,
          recurring: { interval },
          product: typeof item.price.product === 'string' ? item.price.product : item.price.product.id,
        },
      },
    ],
    // upgrade cobra a diferença proporcional agora; downgrade só muda o preço da renovação
    proration_behavior: isUpgrade ? 'always_invoice' : 'none',
    metadata: { orgId, planId: newPlan.id, cycle },
    expand: ['latest_invoice'],
  })

  await db.update(subscriptions).set({ planId: newPlan.id }).where(eq(subscriptions.id, sub.id))

  let creditsDelta = 0
  if (isUpgrade) {
    // Credita só a diferença do ciclo — a fatura proporcional é ignorada pelo
    // webhook (billing_reason subscription_update), então não há crédito em dobro
    const multiplier = cycle === 'anual' ? 12 : 1
    const delta = (newPlan.creditsPerCycle - currentPlan.creditsPerCycle) * multiplier
    const latestInvoice = updated.latest_invoice
    const invoiceId =
      typeof latestInvoice === 'string' ? latestInvoice : latestInvoice?.id ?? null

    if (delta > 0) {
      creditsDelta = delta
      await db
        .insert(creditTransactions)
        .values({
          orgId,
          delta,
          reason: 'purchase',
          providerRef: invoiceId ? `upgrade_${invoiceId}` : `upgrade_${sub.id}_${Date.now()}`,
        })
        .onConflictDoNothing({ target: creditTransactions.providerRef })
    }
  }

  await sendPlanChangedEmail(user.email, user.name, {
    planName: newPlan.name,
    change: isUpgrade ? 'upgrade' : 'downgrade',
    creditsDelta,
  })

  return {
    ok: true,
    change: isUpgrade ? 'upgrade' : 'downgrade',
    planName: newPlan.name,
    effective: isUpgrade ? 'agora' : 'proxima_renovacao',
  }
})
