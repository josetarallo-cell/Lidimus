import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import type IORedis from 'ioredis'
import type { Db } from '@lidimus/db'
import { jobs, refundJobCredits } from '@lidimus/db'
import type { CroquiJobPayload } from '@lidimus/queue'
import { QUEUE_NAMES, publishJobEvent } from '@lidimus/queue'
import { triggerN8nWebhook } from './lib/n8n.ts'

export function startCroquiWorker(
  db: Db,
  redisUrl: string,
  n8nWebhookUrl: string,
  callbackSecret: string,
  publicBaseUrl: string,
  publisher: IORedis,
) {
  const worker = new Worker<CroquiJobPayload>(
    QUEUE_NAMES.CROQUI,
    async (job) => {
      const { jobId, textoOcr, totalPaginas, callbackUrl, params } = job.data

      await db
        .update(jobs)
        .set({ status: 'processing', stage: 'croqui' })
        .where(eq(jobs.id, jobId))

      await triggerN8nWebhook(n8nWebhookUrl, {
        jobId,
        stage: 'croqui',
        textoOcr,
        totalPaginas: totalPaginas ?? null,
        callbackUrl,
        callbackSecret,
        // Base para o n8n carregar a skill croqui-matricula servida pelo app
        skillBaseUrl: `${publicBaseUrl}/api/skills`,
        params,
      })
    },
    {
      connection: { url: redisUrl },
      // Etapa com chamada LLM — concorrência menor
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 3),
    },
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    // 'failed' dispara a cada tentativa — só finaliza (completedAt + estorno)
    // quando os retries acabaram; um retry ainda pode voltar para 'processing'
    const finalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1)
    await db
      .update(jobs)
      .set({
        status: 'error',
        errorMessage: `[croqui] ${err.message}`,
        ...(finalAttempt ? { completedAt: new Date() } : {}),
      })
      .where(eq(jobs.id, job.data.jobId))
    if (finalAttempt) {
      await refundJobCredits(db, job.data.jobId)
    }
    await publishJobEvent(publisher, job.data.jobId)
  })

  return worker
}
