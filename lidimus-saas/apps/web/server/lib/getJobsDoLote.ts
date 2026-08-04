import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobs, organizations, orgMembers } from '@lidimus/db'
import { limparJob } from './semTelemetria'

// Jobs de um mesmo envio em lote, visíveis para o usuário.
//
// O escopo por organização é o que autoriza; o filtro por lote é adicional,
// nunca alternativo — conhecer um loteId não abre job de outra org. Mesma
// construção do GET /api/jobs, extraída aqui para que a exportação do lote não
// reimplemente (e desalinhe) a regra de acesso.
export async function getJobsDoLote(db: Db, loteId: string, userId: string) {
  const linhas = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      inputMeta: jobs.inputMeta,
      result: jobs.result,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
    })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.orgId))
    .innerJoin(
      orgMembers,
      and(eq(orgMembers.orgId, organizations.id), eq(orgMembers.userId, userId)),
    )
    .where(and(eq(jobs.type, 'matricula'), sql`${jobs.inputMeta}->>'loteId' = ${loteId}`))
    // Ordem do envio: o arquivo exportado sai na mesma sequência da tela do lote
    .orderBy(asc(jobs.createdAt))
    // O lote já nasce limitado por maxBatchFiles; o teto aqui é só cinto de segurança
    .limit(100)

  return linhas.map(limparJob)
}
