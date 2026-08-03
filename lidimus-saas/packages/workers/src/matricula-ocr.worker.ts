import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import type IORedis from 'ioredis'
import type { Db } from '@lidimus/db'
import { jobs, refundJobCredits } from '@lidimus/db'
import type { MatriculaOcrJobPayload } from '@lidimus/queue'
import { QUEUE_NAMES, publishJobEvent } from '@lidimus/queue'
import { triggerN8nWebhook } from './lib/n8n.ts'

export function startMatriculaOcrWorker(
  db: Db,
  redisUrl: string,
  n8nWebhookUrl: string,
  callbackSecret: string,
  publisher: IORedis,
) {
  const worker = new Worker<MatriculaOcrJobPayload>(
    QUEUE_NAMES.MATRICULA_OCR,
    async (job) => {
      const { jobId, fileUrl, callbackUrl, params } = job.data

      await db
        .update(jobs)
        .set({ status: 'processing', stage: 'ocr' })
        .where(eq(jobs.id, jobId))

      await triggerN8nWebhook(n8nWebhookUrl, {
        jobId,
        stage: 'ocr',
        fileUrl,
        callbackUrl,
        callbackSecret,
        params,
      })
    },
    {
      connection: { url: redisUrl },
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
      // `concurrency` aqui não é throttle: este worker só dispara o webhook e
      // retorna — o n8n responde na hora (responseNode) e processa depois. Sem o
      // limiter, um lote de 10 matrículas vira 10 chamadas simultâneas ao
      // Document AI. O limiter espaça os disparos; o teto de execuções
      // concorrentes de verdade é o N8N_CONCURRENCY_PRODUCTION_LIMIT da instância.
      limiter: { max: 5, duration: 1000 },
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
        errorMessage: `[ocr] ${err.message}`,
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
