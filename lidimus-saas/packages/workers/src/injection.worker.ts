import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import type IORedis from 'ioredis'
import type { Db } from '@lidimus/db'
import { jobs, refundJobCredits } from '@lidimus/db'
import type { InjectionJobPayload } from '@lidimus/queue'
import { QUEUE_NAMES, publishJobEvent } from '@lidimus/queue'
import { triggerN8nWebhook } from './lib/n8n.ts'

export function startInjectionWorker(
  db: Db,
  redisUrl: string,
  n8nWebhookUrl: string,
  callbackSecret: string,
  publisher: IORedis,
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
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 10),
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
        errorMessage: err.message,
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
