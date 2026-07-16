import { eq } from 'drizzle-orm'
import { useDb } from '../../../lib/db'
import { requirePlatformAdmin } from '../../../lib/requirePlatformAdmin'
import { operationalCosts } from '@lidimus/db'

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const db = useDb()

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id obrigatório' })

  await db.delete(operationalCosts).where(eq(operationalCosts.id, id))
  return { ok: true }
})
