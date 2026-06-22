import { eq, and } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { jobs, organizations, orgMembers } from '@lidimus/db'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400 })

  const [job] = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      inputMeta: jobs.inputMeta,
      result: jobs.result,
      errorMessage: jobs.errorMessage,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
    })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.orgId))
    .innerJoin(orgMembers, and(
      eq(orgMembers.orgId, organizations.id),
      eq(orgMembers.userId, user.id),
    ))
    .where(eq(jobs.id, id))
    .limit(1)

  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  return job
})
