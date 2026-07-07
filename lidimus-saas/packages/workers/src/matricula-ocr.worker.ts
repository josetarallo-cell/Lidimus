import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobs, refundJobCredits } from '@lidimus/db'
import type { MatriculaOcrJobPayload } from '@lidimus/queue'
import { QUEUE_NAMES } from '@lidimus/queue'
import { triggerN8nWebhook } from './lib/n8n.ts'

export function startMatriculaOcrWorker(
  db: Db,
  redisUrl: string,
  n8nWebhookUrl: string,
  callbackSecret: string,
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
      concurrency: 5,
    },
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    await db
      .update(jobs)
      .set({ status: 'error', errorMessage: `[ocr] ${err.message}` })
      .where(eq(jobs.id, job.data.jobId))
    // 'failed' dispara a cada tentativa — só estorna quando os retries acabaram
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await refundJobCredits(db, job.data.jobId)
    }
  })

  return worker
}
