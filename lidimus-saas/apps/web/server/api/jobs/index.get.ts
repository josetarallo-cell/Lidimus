import { z } from 'zod'
import { eq, desc, and, sql } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { alias } from 'drizzle-orm/pg-core'
import { jobs, organizations, orgMembers, users } from '@lidimus/db'

// `users` entra duas vezes na consulta (o autor do job e, indiretamente, o
// membro que está consultando), então o autor precisa de apelido próprio.
const autor = alias(users, 'autor')

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.enum(['matricula', 'kml', 'injection', 'croqui']).optional(),
})

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const { limit, offset, type } = querySchema.parse(getQuery(event))

  // Busca jobs de todas as orgs do usuário
  const memberFilter = and(
    eq(orgMembers.orgId, organizations.id),
    eq(orgMembers.userId, user.id),
  )
  const filtro = type ? and(memberFilter, eq(jobs.type, type)) : memberFilter

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
        // Em equipe, "quem mandou esta análise" é a primeira pergunta ao abrir
        // o painel. O join é left porque jobs antigos podem apontar para um
        // usuário já excluído.
        createdBy: autor.name,
      })
      .from(jobs)
      .innerJoin(organizations, eq(organizations.id, jobs.orgId))
      .innerJoin(orgMembers, filtro)
      .leftJoin(autor, eq(autor.id, jobs.userId))
      .orderBy(desc(jobs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(jobs)
      .innerJoin(organizations, eq(organizations.id, jobs.orgId))
      .innerJoin(orgMembers, filtro),
  ])

  return { items, total }
})
