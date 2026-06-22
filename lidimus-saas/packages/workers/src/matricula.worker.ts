import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobs } from '@lidimus/db'
import type { MatriculaJobPayload } from '@lidimus/queue'
import { QUEUE_NAMES } from '@lidimus/queue'
import { triggerN8nWebhook } from './lib/n8n.ts'

export function startMatriculaWorker(
  db: Db,
  redisUrl: string,
  n8nWebhookUrl: string,
  callbackSecret: string,
) {
  const worker = new Worker<MatriculaJobPayload>(
    QUEUE_NAMES.MATRICULA,
    async (job) => {
      const { jobId, fileUrl, callbackUrl, params } = job.data

      await db
        .update(jobs)
        .set({ status: 'processing' })
        .where(eq(jobs.id, jobId))

      await triggerN8nWebhook(n8nWebhookUrl, {
        jobId,
        fileUrl,
        callbackUrl,
        callbackSecret,
        incluirMemorial: params.incluirMemorial ?? true,
        incluirCroqui: params.incluirCroqui ?? false,
        geocodificar: params.geocodificar ?? true,
      })
    },
    {
      connection: { url: redisUrl },
      concurrency: 5,
    },
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    const jobId = job.data.jobId
    await db
      .update(jobs)
      .set({ status: 'error', errorMessage: err.message })
      .where(eq(jobs.id, jobId))
  })

  return worker
}
