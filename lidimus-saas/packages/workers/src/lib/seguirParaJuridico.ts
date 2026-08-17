// Fecha a etapa de revisão e manda o job para a análise jurídica.
//
// Existe no worker (o app tem o seu próprio caminho, que é o do usuário que
// respondeu) porque há dois desfechos que acontecem sem ninguém clicar em nada:
// o prazo da revisão estourou, ou o recorte falhou e não há o que perguntar. Nos
// dois casos a análise segue com o texto que o OCR leu — o corretor melhora a
// precisão, nunca bloqueia a entrega.

import { and, eq, inArray } from 'drizzle-orm'
import type IORedis from 'ioredis'
import type { Db } from '@lidimus/db'
import { jobs } from '@lidimus/db'
import type { MatriculaJuridicoJobPayload } from '@lidimus/queue'
import { publishJobEvent } from '@lidimus/queue'
import { semRecortes } from '@lidimus/revisao'
import type { Candidato } from '@lidimus/revisao'

/** Por que a revisão terminou. Fica no stageData e explica o job no suporte. */
export type DesfechoRevisao = 'expirada' | 'indisponivel'

/**
 * Como enfileirar a análise jurídica.
 *
 * Uma função, e não a `Queue` do BullMQ: o tipo genérico dela atravessaria a
 * fronteira entre @lidimus/queue e @lidimus/workers, que resolvem cópias
 * diferentes do bullmq no pnpm e deixam de ser compatíveis. Quem monta a fila é
 * o index; aqui só interessa poder chamá-la.
 */
export type EnfileirarJuridico = (payload: MatriculaJuridicoJobPayload) => Promise<unknown>

type Status = (typeof jobs.$inferSelect)['status']

export async function seguirParaJuridico(
  db: Db,
  enfileirar: EnfileirarJuridico,
  publisher: IORedis,
  jobId: string,
  callbackUrl: string,
  desfecho: DesfechoRevisao,
  deStatus: Status[],
): Promise<boolean> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)
  if (!job) return false

  const stageData = (job.stageData ?? {}) as Record<string, unknown>
  const ocr = (stageData.ocr ?? {}) as Record<string, unknown>
  const textoOcr = String(ocr.texto_ocr ?? '')
  if (!textoOcr.trim()) return false

  const revisao = (stageData.revisao ?? {}) as Record<string, unknown>
  const candidatos = Array.isArray(revisao.candidatos) ? (revisao.candidatos as Candidato[]) : []

  const novoStageData = {
    ...stageData,
    revisao: {
      ...revisao,
      // As imagens saem do banco assim que deixam de ter uso — ver semRecortes
      candidatos: semRecortes(candidatos),
      desfecho,
      encerradaEm: new Date().toISOString(),
    },
  }

  // A transição condicional é a trava entre este caminho e o do usuário: se ele
  // enviou as correções no mesmo segundo em que o prazo estourou, um dos dois
  // encontra o job já fora do estado esperado e desiste — sem duas análises
  // jurídicas enfileiradas para o mesmo job.
  const aplicado = await db
    .update(jobs)
    .set({ status: 'queued', stage: 'juridico', stageData: novoStageData })
    .where(and(eq(jobs.id, jobId), inArray(jobs.status, deStatus)))
    .returning({ id: jobs.id })

  if (aplicado.length === 0) return false

  await enfileirar({
    jobId,
    callbackUrl,
    textoOcr,
    totalPaginas: typeof ocr.total_paginas === 'number' ? ocr.total_paginas : undefined,
    params: ((job.inputMeta as Record<string, unknown>)?.params ?? {}) as never,
  })
  await publishJobEvent(publisher, jobId)
  return true
}
