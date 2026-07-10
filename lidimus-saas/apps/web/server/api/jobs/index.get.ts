import { z } from 'zod'
import { eq, desc, and, sql } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { jobs, organizations, orgMembers } from '@lidimus/db'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const { limit, offset } = querySchema.parse(getQuery(event))

  // Busca jobs de todas as orgs do usuário
  const memberFilter = and(
    eq(orgMembers.orgId, organizations.id),
    eq(orgMembers.userId, user.id),
  )

  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        id: jobs.id,
        type: jobs.type,
        status: jobs.status,
        stage: jobs.stage,
        inputMeta: jobs.inputMeta,
        result: jobs.result,
        createdAt: jobs.createdAt,
        completedAt: jobs.completedAt,
      })
      .from(jobs)
      .innerJoin(organizations, eq(organizations.id, jobs.orgId))
      .innerJoin(orgMembers, memberFilter)
      .orderBy(desc(jobs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(jobs)
      .innerJoin(organizations, eq(organizations.id, jobs.orgId))
      .innerJoin(orgMembers, memberFilter),
  ])

  return { items, total }
})
