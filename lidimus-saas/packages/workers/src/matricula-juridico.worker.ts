import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import type IORedis from 'ioredis'
import type { Db } from '@lidimus/db'
import { jobs, refundJobCredits } from '@lidimus/db'
import type { MatriculaJuridicoJobPayload } from '@lidimus/queue'
import { QUEUE_NAMES, publishJobEvent } from '@lidimus/queue'
import { triggerN8nWebhook } from './lib/n8n.ts'

export function startMatriculaJuridicoWorker(
  db: Db,
  redisUrl: string,
  n8nWebhookUrl: string,
  callbackSecret: string,
  publicBaseUrl: string,
  publisher: IORedis,
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
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 3),
      // Como no worker de OCR, `concurrency` não segura nada: o disparo do
      // webhook volta em milissegundos. O limiter é o que evita que um lote
      // inteiro chegue de uma vez na Anthropic e no Mistral.
      limiter: { max: 3, duration: 1000 },
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
        errorMessage: `[juridico] ${err.message}`,
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
