import { eq, and } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobs, organizations, orgMembers } from '@lidimus/db'

// Job visível para o usuário (via org de que participa) — usado pelo GET e pelo SSE
export async function getJobForUser(db: Db, jobId: string, userId: string) {
  const [job] = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      stage: jobs.stage,
      inputMeta: jobs.inputMeta,
      stageData: jobs.stageData,
      result: jobs.result,
      errorMessage: jobs.errorMessage,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
    })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.orgId))
    .innerJoin(orgMembers, and(
      eq(orgMembers.orgId, organizations.id),
      eq(orgMembers.userId, userId),
    ))
    .where(eq(jobs.id, jobId))
    .limit(1)

  return job ?? null
}
