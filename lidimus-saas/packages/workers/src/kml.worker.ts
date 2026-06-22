import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobs } from '@lidimus/db'
import type { KmlJobPayload } from '@lidimus/queue'
import { QUEUE_NAMES } from '@lidimus/queue'
import { triggerN8nWebhook } from './lib/n8n.ts'

export function startKmlWorker(
  db: Db,
  redisUrl: string,
  n8nWebhookUrl: string,
  callbackSecret: string,
) {
  const worker = new Worker<KmlJobPayload>(
    QUEUE_NAMES.KML,
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
        nomeImovel: params.nomeImovel ?? '',
        municipio: params.municipio ?? '',
        estado: params.estado ?? '',
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
