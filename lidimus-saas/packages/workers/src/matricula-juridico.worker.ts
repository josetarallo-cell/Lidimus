import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobs, refundJobCredits } from '@lidimus/db'
import type { MatriculaJuridicoJobPayload } from '@lidimus/queue'
import { QUEUE_NAMES } from '@lidimus/queue'
import { triggerN8nWebhook } from './lib/n8n.ts'

export function startMatriculaJuridicoWorker(
  db: Db,
  redisUrl: string,
  n8nWebhookUrl: string,
  callbackSecret: string,
  publicBaseUrl: string,
) {
  const worker = new Worker<MatriculaJuridicoJobPayload>(
    QUEUE_NAMES.MATRICULA_JURIDICO,
    async (job) => {
      const { jobId, textoOcr, totalPaginas, callbackUrl, params } = job.data

      await db
        .update(jobs)
        .set({ status: 'processing', stage: 'juridico' })
        .where(eq(jobs.id, jobId))

      await triggerN8nWebhook(n8nWebhookUrl, {
        jobId,
        stage: 'juridico',
        textoOcr,
        totalPaginas: totalPaginas ?? null,
        callbackUrl,
        callbackSecret,
        // Base para o n8n carregar as skills servidas pelo app
        skillBaseUrl: `${publicBaseUrl}/api/skills`,
        params,
      })
    },
    {
      connection: { url: redisUrl },
      // Etapa com chamadas LLM — mais lenta e cara, concorrência menor
      concurrency: 3,
    },
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    await db
      .update(jobs)
      .set({ status: 'error', errorMessage: `[juridico] ${err.message}` })
      .where(eq(jobs.id, job.data.jobId))
    // 'failed' dispara a cada tentativa — só estorna quando os retries acabaram
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await refundJobCredits(db, job.data.jobId)
    }
  })

  return worker
}
