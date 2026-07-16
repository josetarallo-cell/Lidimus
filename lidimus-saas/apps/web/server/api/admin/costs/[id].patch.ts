import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../lib/db'
import { requirePlatformAdmin } from '../../../lib/requirePlatformAdmin'
import { operationalCosts } from '@lidimus/db'

// Edição parcial de uma linha de custo — ativar/desativar ou ajustar valor.
const bodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: z.string().min(1).max(60).optional(),
  amountCents: z.number().int().min(0).optional(),
  currency: z.string().min(1).max(8).optional(),
  period: z.enum(['mensal', 'anual', 'unico']).optional(),
  active: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const db = useDb()

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id obrigatório' })

  const body = bodySchema.parse(await readBody(event))

  const [updated] = await db
    .update(operationalCosts)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(operationalCosts.id, id))
    .returning()

  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Custo não encontrado' })
  return updated
})
