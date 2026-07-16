import { z } from 'zod'
import { useDb } from '../../lib/db'
import { requirePlatformAdmin } from '../../lib/requirePlatformAdmin'
import { operationalCosts } from '@lidimus/db'

// Categoria e período são texto livre de propósito — a interface fica aberta a
// novos tipos de custo (hospedagem, impostos, salários, ferramentas, ...).
const bodySchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60).default('outros'),
  amountCents: z.number().int().min(0),
  currency: z.string().min(1).max(8).default('BRL'),
  period: z.enum(['mensal', 'anual', 'unico']).default('mensal'),
  notes: z.string().max(500).optional(),
})

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const db = useDb()

  const body = bodySchema.parse(await readBody(event))

  const [created] = await db
    .insert(operationalCosts)
    .values({
      name: body.name,
      category: body.category,
      amountCents: body.amountCents,
      currency: body.currency,
      period: body.period,
      notes: body.notes ?? null,
    })
    .returning()

  return created
})
