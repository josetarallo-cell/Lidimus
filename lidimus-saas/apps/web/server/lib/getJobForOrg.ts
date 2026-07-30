import { and, eq } from 'drizzle-orm'
import type { Db, JobType } from '@lidimus/db'
import { jobs } from '@lidimus/db'
import { limparJob } from './semTelemetria'

// Job visível para uma organização — usado pela API pública.
//
// Irmão de getJobForUser, e separado dele de propósito: aquele resolve
// visibilidade pela pessoa (join em org_members), o que na API faria a chave
// enxergar apenas as análises de quem a emitiu. A credencial é da organização, e
// é justamente isso que permite compartilhá-la com a equipe: quem tem a chave vê
// o que a empresa produziu, não o que uma pessoa produziu.
//
// `tipo` fecha o escopo da v1 na matrícula: pedir por aqui o id de um croqui
// devolve 404, e não um recurso de um contrato que ainda não existe.
export async function getJobForOrg(db: Db, jobId: string, orgId: string, tipo?: JobType) {
  const [job] = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      stage: jobs.stage,
      inputMeta: jobs.inputMeta,
      result: jobs.result,
      errorMessage: jobs.errorMessage,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
    })
    .from(jobs)
    .where(
      and(eq(jobs.id, jobId), eq(jobs.orgId, orgId), ...(tipo ? [eq(jobs.type, tipo)] : [])),
    )
    .limit(1)

  return job ? limparJob(job) : null
}
