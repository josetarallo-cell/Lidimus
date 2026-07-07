import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { useStripe } from '../../lib/stripe'
import { plans, subscriptions, creditTransactions } from '@lidimus/db'

// Sincroniza assinaturas e credita compras a partir dos eventos do Stripe.
// Autenticação: assinatura nativa do Stripe (constructEvent) — nunca aceitar
// o corpo sem validar, o endpoint é público.

type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

function mapStatus(s: Stripe.Subscription.Status): SubStatus {
  if (s === 'trialing') return 'trialing'
  if (s === 'active') return 'active'
  if (s === 'past_due' || s === 'unpaid' || s === 'incomplete') return 'past_due'
  return 'canceled'
}

// current_period_end saiu da subscription e foi para os items em versões novas
// da API — ler dos dois lugares.
function periodEnd(sub: Stripe.Subscription): Date | null {
  const raw =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end
  return typeof raw === 'number' ? new Date(raw * 1000) : null
}

// invoice.subscription (API antiga) vs. invoice.parent.subscription_details (basil)
function invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const legacy = (inv as unknown as { subscription?: string | { id: string } }).subscription
  if (typeof legacy === 'string') return legacy
  if (legacy?.id) return legacy.id
  const parent = (inv as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id: string } } }
  }).parent?.subscription_details?.subscription
  if (typeof parent === 'string') return parent
  return parent?.id ?? null
}

function invoiceSubscriptionMetadata(inv: Stripe.Invoice): Record<string, string> {
  const legacy = (inv as unknown as { subscription_details?: { metadata?: Record<string, string> } })
    .subscription_details?.metadata
  const parent = (inv as unknown as {
    parent?: { subscription_details?: { metadata?: Record<string, string> } }
  }).parent?.subscription_details?.metadata
  return legacy ?? parent ?? {}
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const stripe = useStripe()

  const signature = getHeader(event, 'stripe-signature')
  const rawBody = await readRawBody(event)
  if (!signature || !rawBody) throw createError({ statusCode: 400 })

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret)
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  const db = useDb()

  // ── Assinatura criada via checkout ─────────────────────────────────────────
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object
    if (session.mode !== 'subscription') return { received: true }

    const orgId = session.metadata?.orgId
    const planId = session.metadata?.planId
    const providerSubscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    const providerCustomerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id

    if (!orgId || !planId || !providerSubscriptionId) return { received: true }

    const [existing] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.providerSubscriptionId, providerSubscriptionId))
      .limit(1)

    if (!existing) {
      await db.insert(subscriptions).values({
        orgId,
        planId,
        status: 'active',
        providerCustomerId,
        providerSubscriptionId,
      })
    }
    return { received: true }
  }

  // ── Status/renovação sincronizados pelo próprio Stripe ─────────────────────
  if (
    stripeEvent.type === 'customer.subscription.updated' ||
    stripeEvent.type === 'customer.subscription.deleted'
  ) {
    const sub = stripeEvent.data.object
    await db
      .update(subscriptions)
      .set({ status: mapStatus(sub.status), currentPeriodEnd: periodEnd(sub) })
      .where(eq(subscriptions.providerSubscriptionId, sub.id))
    return { received: true }
  }

  // ── Pagamento confirmado → credita o ciclo ──────────────────────────────────
  if (stripeEvent.type === 'invoice.paid') {
    const invoice = stripeEvent.data.object
    const providerSubscriptionId = invoiceSubscriptionId(invoice)
    if (!providerSubscriptionId) return { received: true }

    const [sub] = await db
      .select({ orgId: subscriptions.orgId, planId: subscriptions.planId })
      .from(subscriptions)
      .where(eq(subscriptions.providerSubscriptionId, providerSubscriptionId))
      .limit(1)

    const meta = invoiceSubscriptionMetadata(invoice)
    const orgId = sub?.orgId ?? meta.orgId
    const planId = sub?.planId ?? meta.planId
    if (!orgId || !planId) return { received: true }

    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
    if (!plan) return { received: true }

    // Ciclo anual paga 12 meses de uma vez — credita os 12 meses juntos
    const cycle = meta.cycle ?? (invoice.amount_paid >= plan.annualPriceCents ? 'anual' : 'mensal')
    const delta = plan.creditsPerCycle * (cycle === 'anual' ? 12 : 1)

    // provider_ref UNIQUE + onConflictDoNothing = reenvio do webhook não credita duas vezes
    await db
      .insert(creditTransactions)
      .values({ orgId, delta, reason: 'purchase', providerRef: invoice.id })
      .onConflictDoNothing({ target: creditTransactions.providerRef })

    return { received: true }
  }

  return { received: true }
})
