import { sql } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requirePlatformAdmin } from '../../lib/requirePlatformAdmin'

// Números de faturamento: MRR (assinaturas ativas × preço mensal do plano),
// distribuição por plano e total de cancelamentos
export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const db = useDb()

  const [byPlan, totals] = await Promise.all([
    db.execute(sql`
      select p.name as plan_name,
             count(*) filter (where s.status in ('active', 'trialing'))::int as active_count,
             count(*) filter (where s.status = 'past_due')::int as past_due_count,
             count(*) filter (where s.status = 'canceled')::int as canceled_count,
             (count(*) filter (where s.status in ('active', 'trialing')) * p.monthly_price_cents)::int as mrr_cents
      from plans p
      left join subscriptions s on s.plan_id = p.id
      group by p.id, p.name, p.monthly_price_cents
      order by p.monthly_price_cents
    `),
    db.execute(sql`
      select
        coalesce(sum(p.monthly_price_cents) filter (where s.status in ('active', 'trialing')), 0)::int as mrr_cents,
        count(*) filter (where s.status in ('active', 'trialing'))::int as active_count,
        count(*) filter (where s.status = 'canceled')::int as canceled_count
      from subscriptions s
      join plans p on p.id = s.plan_id
    `),
  ])

  return { totals: totals[0], byPlan }
})
