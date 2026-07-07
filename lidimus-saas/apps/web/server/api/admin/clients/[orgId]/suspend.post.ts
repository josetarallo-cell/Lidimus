import { eq, desc } from 'drizzle-orm'
import { useDb } from '../../../../lib/db'
import { useStripe } from '../../../../lib/stripe'
import { requirePlatformAdmin } from '../../../../lib/requirePlatformAdmin'
import { subscriptions } from '@lidimus/db'

// Suspende (cancela) a assinatura mais recente da organização.
// Cancela também no Stripe quando houver vínculo — senão o Stripe continuaria cobrando.
export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const config = useRuntimeConfig()
  const db = useDb()

  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400 })

  const [sub] = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  if (!sub) throw createError({ statusCode: 404, statusMessage: 'Organização sem assinatura.' })
  if (sub.status === 'canceled') return { ok: true }

  if (sub.providerSubscriptionId && config.stripeSecretKey) {
    try {
      await useStripe().subscriptions.cancel(sub.providerSubscriptionId)
    } catch (err) {
      // Já cancelada/inexistente no Stripe não impede a suspensão local
      console.error('Falha ao cancelar assinatura no Stripe:', (err as Error).message)
    }
  }

  await db.update(subscriptions).set({ status: 'canceled' }).where(eq(subscriptions.id, sub.id))

  return { ok: true }
})
