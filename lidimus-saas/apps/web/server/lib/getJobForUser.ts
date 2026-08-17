import { eq, and } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobs, organizations, orgMembers } from '@lidimus/db'
import { limparJob } from './semTelemetria'
import { trocarRecortesPorUrl } from './recortesDaRevisao'

// Job visível para o usuário (via org de que participa) — usado pelo GET e pelo SSE
export async function getJobForUser(db: Db, jobId: string, userId: string) {
  const [job] = await db
    .select({
      id: jobs.id,
      // A organização DONA do job — não a org ativa de quem pede. É ela que
      // paga a análise, então é o plano dela que decide o que se pode fazer
      // com o parecer (ex.: exportar em Word). Quem participa de duas orgs
      // leva o entitlement de cada uma, job a job.
      orgId: jobs.orgId,
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

  // Sai limpo do custo em dólar e dos modelos usados — ver semTelemetria.ts.
  // Limpar aqui, e não em cada rota, faz rota nova nascer segura.
  // Os recortes do corretor de leitura saem daqui como endereço, não como
  // imagem — 256 KB de base64 num payload de status estouravam o SSE. Ver
  // recortesDaRevisao.ts. Aplicado no mesmo ponto que a limpeza de
  // telemetria, pela mesma razão: rota nova já nasce leve.
  return job ? trocarRecortesPorUrl(limparJob(job)) : null
}
