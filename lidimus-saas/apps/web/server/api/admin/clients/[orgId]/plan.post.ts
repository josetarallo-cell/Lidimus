import { z } from 'zod'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { useDb } from '../../../../lib/db'
import { requirePlatformAdmin } from '../../../../lib/requirePlatformAdmin'
import { STATUS_COM_ACESSO } from '../../../../lib/planAccess'
import { exigirPlanoComportaEquipe } from '../../../../lib/orgSeats'
import { creditTransactions, organizations, plans, subscriptions } from '@lidimus/db'

const bodySchema = z.object({
  planId: z.string().uuid(),
  ciclo: z.enum(['mensal', 'anual']).default('mensal'),
  // A franquia do plano entra como crédito na hora. Desligue quando estiver só
  // corrigindo o plano de um cliente que já recebeu os créditos deste ciclo.
  creditar: z.boolean().default(true),
})

// Coloca uma organização num plano à mão. Existe para os contratos que não
// passam pelo Stripe — hoje o Enterprise, negociado caso a caso.
//
// Consequência importante: assinatura sem `provider_subscription_id` não é
// renovada por webhook nenhum. A cada ciclo, os créditos do contrato precisam
// ser lançados de novo (por aqui ou pelo ajuste de créditos do painel).
export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const db = useDb()

  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400 })

  const { planId, ciclo, creditar } = bodySchema.parse(await readBody(event))

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)
  if (!org) throw createError({ statusCode: 404, statusMessage: 'Organização não encontrada.' })

  const [plano] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
  if (!plano) throw createError({ statusCode: 404, statusMessage: 'Plano não encontrado.' })

  // A mesma trava do autoatendimento: o teto de usuários do plano novo precisa
  // comportar quem já está na organização.
  await exigirPlanoComportaEquipe(db, orgId, plano)

  const [existente] = await db
    .select({ id: subscriptions.id, providerSubscriptionId: subscriptions.providerSubscriptionId })
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), inArray(subscriptions.status, STATUS_COM_ACESSO)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  // Sobrescrever uma assinatura do Stripe daqui deixaria o banco dizendo uma
  // coisa e a cobrança fazendo outra. O cancelamento é feito no Stripe primeiro.
  if (existente?.providerSubscriptionId) {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Esta organização tem assinatura ativa no Stripe. Cancele-a lá antes de aplicar um plano de contrato.',
    })
  }

  const meses = ciclo === 'anual' ? 12 : 1
  const fimDoPeriodo = new Date()
  fimDoPeriodo.setMonth(fimDoPeriodo.getMonth() + meses)

  const creditos = creditar ? plano.creditsPerCycle * meses : 0

  await db.transaction(async (tx) => {
    if (existente) {
      await tx
        .update(subscriptions)
        .set({ planId: plano.id, status: 'active', currentPeriodEnd: fimDoPeriodo })
        .where(eq(subscriptions.id, existente.id))
    } else {
      await tx.insert(subscriptions).values({
        orgId,
        planId: plano.id,
        status: 'active',
        currentPeriodEnd: fimDoPeriodo,
      })
    }

    if (creditos > 0) {
      await tx
        .insert(creditTransactions)
        .values({
          orgId,
          delta: creditos,
          reason: 'admin_adjustment',
          // Idempotência por ciclo: dois cliques no mesmo dia não creditam duas
          // vezes o mesmo contrato. Sem o onConflictDoNothing, o provider_ref
          // único derrubaria a transação inteira e a troca de plano junto.
          providerRef: `contrato_${orgId}_${plano.id}_${fimDoPeriodo.toISOString().slice(0, 10)}`,
        })
        .onConflictDoNothing({ target: creditTransactions.providerRef })
    }
  })

  return {
    ok: true,
    planName: plano.name,
    maxUsers: plano.maxUsers,
    creditosLancados: creditos,
    currentPeriodEnd: fimDoPeriodo,
  }
})
