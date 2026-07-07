import { eq, desc, isNotNull, and } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { useStripe } from '../../lib/stripe'
import { requireAuth } from '../../lib/requireAuth'
import { getOrCreatePersonalOrg } from '../../lib/getOrCreateOrg'
import { subscriptions } from '@lidimus/db'

// Abre o Customer Portal do Stripe — gestão de cartão, faturas e cancelamento
// acontece lá, não reimplementamos nada disso.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const config = useRuntimeConfig()
  const db = useDb()
  const stripe = useStripe()

  const orgId = await getOrCreatePersonalOrg(db, user.id, user.name)

  const [sub] = await db
    .select({ providerCustomerId: subscriptions.providerCustomerId })
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), isNotNull(subscriptions.providerCustomerId)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  if (!sub?.providerCustomerId) {
    throw createError({ statusCode: 400, statusMessage: 'Nenhuma assinatura encontrada para esta organização.' })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.providerCustomerId,
    return_url: `${config.publicBaseUrl}/conta/assinatura`,
  })

  return { url: session.url }
})
