import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { useStripe } from '../../lib/stripe'
import { requireAuth } from '../../lib/requireAuth'
import { getOrCreatePersonalOrg } from '../../lib/getOrCreateOrg'
import { plans, subscriptions } from '@lidimus/db'

const bodySchema = z.object({
  planId: z.string().uuid(),
  cycle: z.enum(['mensal', 'anual']),
})

// Cria uma Checkout Session de assinatura no Stripe e devolve a URL de pagamento.
// Os preços são enviados inline (price_data) — não é preciso cadastrar produtos
// no dashboard do Stripe; a tabela `plans` é a fonte da verdade.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const config = useRuntimeConfig()
  const db = useDb()
  const stripe = useStripe()

  const { planId, cycle } = bodySchema.parse(await readBody(event))

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
  if (!plan) throw createError({ statusCode: 404, statusMessage: 'Plano não encontrado.' })

  const orgId = await getOrCreatePersonalOrg(db, user.id, user.name)

  // Reutiliza o customer do Stripe se a org já assinou antes (evita duplicar clientes)
  const [existing] = await db
    .select({ providerCustomerId: subscriptions.providerCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  const metadata = { orgId, planId: plan.id, cycle }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    ...(existing?.providerCustomerId
      ? { customer: existing.providerCustomerId }
      : { customer_email: user.email }),
    client_reference_id: orgId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'brl',
          unit_amount: cycle === 'anual' ? plan.annualPriceCents : plan.monthlyPriceCents,
          recurring: { interval: cycle === 'anual' ? 'year' : 'month' },
          product_data: { name: `Lidimus ${plan.name}` },
        },
      },
    ],
    metadata,
    subscription_data: { metadata },
    success_url: `${config.publicBaseUrl}/conta/assinatura?checkout=sucesso`,
    cancel_url: `${config.publicBaseUrl}/conta/assinatura?checkout=cancelado`,
  })

  if (!session.url) throw createError({ statusCode: 502, statusMessage: 'Stripe não retornou URL de pagamento.' })
  return { url: session.url }
})
