import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { useDb } from '../../../lib/db'
import { requireAuth } from '../../../lib/requireAuth'
import { jobs, organizations, orgMembers } from '@lidimus/db'

// Dado o job de uma matrícula, devolve o croqui já gerado a partir dela (se houver).
// O vínculo mora no croqui: inputMeta.origem = { tipo: 'matricula', jobId }.
// Serve à navegação matrícula → croqui (botão "Visualizar croqui" no parecer) e a
// não gerar croqui duplicado. Croquis com erro não contam — deixam gerar de novo.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400 })

  const [croqui] = await db
    .select({ id: jobs.id, status: jobs.status })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.orgId))
    .innerJoin(
      orgMembers,
      and(eq(orgMembers.orgId, organizations.id), eq(orgMembers.userId, user.id)),
    )
    .where(
      and(
        eq(jobs.type, 'croqui'),
        ne(jobs.status, 'error'),
        sql`${jobs.inputMeta} -> 'origem' ->> 'jobId' = ${id}`,
      ),
    )
    .orderBy(desc(jobs.createdAt))
    .limit(1)

  return { croquiJobId: croqui?.id ?? null, status: croqui?.status ?? null }
})
