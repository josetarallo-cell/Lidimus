import { asc, sql } from 'drizzle-orm'
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
      features: plans.features,
    })
    .from(plans)
    // Enterprise tem preço 0 (não há valor de tabela) e ordenar só por preço o
    // colocaria como o mais barato, na frente do Croqui. Planos sob contrato vão
    // para o fim da grade, que é onde a conversa comercial começa.
    .orderBy(sql`coalesce((${plans.features}->>'sobContrato')::boolean, false)`, asc(plans.monthlyPriceCents))
})
