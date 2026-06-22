import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobs } from '@lidimus/db'
import type { InjectionJobPayload } from '@lidimus/queue'
import { QUEUE_NAMES } from '@lidimus/queue'
import { triggerN8nWebhook } from './lib/n8n.ts'

export function startInjectionWorker(
  db: Db,
  redisUrl: string,
  n8nWebhookUrl: string,
  callbackSecret: string,
) {
  const worker = new Worker<InjectionJobPayload>(
    QUEUE_NAMES.INJECTION,
    async (job) => {
      const { jobId, fileUrl, callbackUrl } = job.data

      await db
        .update(jobs)
        .set({ status: 'processing' })
        .where(eq(jobs.id, jobId))

      await triggerN8nWebhook(n8nWebhookUrl, {
        jobId,
        fileUrl,
        callbackUrl,
        callbackSecret,
      })
    },
    {
      connection: { url: redisUrl },
      concurrency: 10,
    },
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    await db
      .update(jobs)
      .set({ status: 'error', errorMessage: err.message })
      .where(eq(jobs.id, job.data.jobId))
  })

  return worker
}
