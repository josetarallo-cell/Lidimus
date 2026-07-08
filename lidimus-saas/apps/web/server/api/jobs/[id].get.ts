import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { getJobForUser } from '../../lib/getJobForUser'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400 })

  const job = await getJobForUser(db, id, user.id)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  return job
})
