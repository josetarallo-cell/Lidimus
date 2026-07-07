import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../../lib/db'
import { requirePlatformAdmin } from '../../../../lib/requirePlatformAdmin'
import { organizations, creditTransactions } from '@lidimus/db'

const bodySchema = z.object({
  // negativo permitido — o ajuste administrativo também serve para retirar créditos
  delta: z.number().int().refine((n) => n !== 0, 'delta não pode ser zero'),
})

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const db = useDb()

  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400 })

  const { delta } = bodySchema.parse(await readBody(event))

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)
  if (!org) throw createError({ statusCode: 404, statusMessage: 'Organização não encontrada.' })

  await db.insert(creditTransactions).values({ orgId, delta, reason: 'admin_adjustment' })

  return { ok: true }
})
