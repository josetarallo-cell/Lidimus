import { sql, desc } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requirePlatformAdmin } from '../../lib/requirePlatformAdmin'
import { operationalCosts } from '@lidimus/db'

// Painel de custos do admin: consumo de tokens/custo por modelo (agregado das
// entradas gravadas em jobs.result.usage.entries pelos workflows do n8n) +
// linhas de custo operacional (hospedagem, impostos, salários, etc.).
export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const config = useRuntimeConfig()
  const db = useDb()

  const usdBrlRate = Number(config.usdBrlRate) || 5.45

  const [byModel, cost30d, opCosts] = await Promise.all([
    // Agregação por modelo, todo o histórico. Cada job pode ter várias entradas
    // (uma por modelo/etapa) em result.usage.entries.
    db.execute(sql`
      select
        e->>'model'                                            as model,
        coalesce(nullif(e->>'workflow', ''), '—')             as workflow,
        count(distinct j.id)::int                              as jobs,
        coalesce(sum((e->>'promptTokens')::numeric), 0)::bigint     as prompt_tokens,
        coalesce(sum((e->>'completionTokens')::numeric), 0)::bigint as completion_tokens,
        coalesce(sum((e->>'totalTokens')::numeric), 0)::bigint      as total_tokens,
        coalesce(sum((e->>'units')::numeric), 0)::numeric           as units,
        coalesce(sum((e->>'costUsd')::numeric), 0)::numeric         as cost_usd
      from jobs j
      cross join lateral jsonb_array_elements(
        coalesce(j.result->'usage'->'entries', '[]'::jsonb)
      ) as e
      where jsonb_typeof(j.result->'usage'->'entries') = 'array'
      group by 1, 2
      order by total_tokens desc, cost_usd desc
    `),
    // Custo de modelos nos últimos 30 dias (comparável ao custo operacional mensal).
    db.execute(sql`
      select coalesce(sum((e->>'costUsd')::numeric), 0)::numeric as cost_usd
      from jobs j
      cross join lateral jsonb_array_elements(
        coalesce(j.result->'usage'->'entries', '[]'::jsonb)
      ) as e
      where jsonb_typeof(j.result->'usage'->'entries') = 'array'
        and j.created_at >= now() - interval '30 days'
    `),
    db
      .select()
      .from(operationalCosts)
      .orderBy(desc(operationalCosts.active), desc(operationalCosts.amountCents)),
  ])

  const models = (byModel as unknown as Record<string, unknown>[]).map((r) => ({
    model: String(r.model),
    workflow: String(r.workflow),
    jobs: Number(r.jobs),
    promptTokens: Number(r.prompt_tokens),
    completionTokens: Number(r.completion_tokens),
    totalTokens: Number(r.total_tokens),
    units: Number(r.units),
    costUsd: Number(r.cost_usd),
    costBrl: Number(r.cost_usd) * usdBrlRate,
  }))

  const modelCostUsd = models.reduce((s, m) => s + m.costUsd, 0)
  const modelCostUsd30d = Number((cost30d as unknown as Record<string, unknown>[])[0]?.cost_usd ?? 0)

  return {
    usdBrlRate,
    models,
    totals: {
      modelCostUsd,
      modelCostBrl: modelCostUsd * usdBrlRate,
      modelCostUsd30d,
      modelCostBrl30d: modelCostUsd30d * usdBrlRate,
      totalTokens: models.reduce((s, m) => s + m.totalTokens, 0),
    },
    operationalCosts: opCosts,
  }
})
