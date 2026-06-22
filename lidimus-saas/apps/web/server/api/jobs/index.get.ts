import { eq, desc, and } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { jobs, organizations, orgMembers } from '@lidimus/db'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  // Busca jobs de todas as orgs do usuário
  const userJobs = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      inputMeta: jobs.inputMeta,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
    })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.orgId))
    .innerJoin(orgMembers, and(
      eq(orgMembers.orgId, organizations.id),
      eq(orgMembers.userId, user.id),
    ))
    .orderBy(desc(jobs.createdAt))
    .limit(50)

  return userJobs
})
