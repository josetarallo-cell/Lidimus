import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import type IORedis from 'ioredis'
import type { Db } from '@lidimus/db'
import { jobFiles, jobs, refundJobCredits } from '@lidimus/db'
import type { MatriculaOcrJobPayload } from '@lidimus/queue'
import { QUEUE_NAMES, publishJobEvent } from '@lidimus/queue'
import { analisarPdf, detectarPaginasHeterogeneas, lerQrDoPdf } from '@lidimus/autenticidade'
import { triggerN8nWebhook } from './lib/n8n.ts'
import { baixarDoGcs } from './lib/gcs.ts'

// Perícia completa do arquivo (§1 + QR do §3) — roda aqui, e não no callback,
// porque este é o único ponto do pipeline que ainda tem o binário em mãos
// *antes* de disparar o n8n: o callback do estágio 'ocr' já pode ter apagado o
// PDF do GCS (softDeleteJobFile, quando não sobra nada para o corretor
// revisar). Grava direto em `stage_data.autenticidade` — não passa pelo n8n,
// que não tem acesso ao binário.
//
// Nunca bloqueia nem atrasa o job além do necessário: qualquer falha (GCS,
// poppler ausente, PDF ilegível) vira log e o pipeline segue sem a perícia
// completa — o upload já guardou a perícia leve em `inputMeta.autenticidade`.
async function periciaCompletaDeAutenticidade(db: Db, jobId: string): Promise<void> {
  try {
    const [arquivo] = await db
      .select({ gcsPath: jobFiles.gcsPath, deletedAt: jobFiles.deletedAt })
      .from(jobFiles)
      .where(eq(jobFiles.jobId, jobId))
      .limit(1)
    if (!arquivo || arquivo.deletedAt) return

    const [atual] = await db
      .select({ stageData: jobs.stageData, inputMeta: jobs.inputMeta })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)
    if (!atual) return

    const paginasConhecidas = (atual.inputMeta as Record<string, unknown> | null)?.paginas
    const pdf = await baixarDoGcs(arquivo.gcsPath)
    const pericia = analisarPdf(pdf, {
      paginasConhecidas: typeof paginasConhecidas === 'number' ? paginasConhecidas : undefined,
    })

    const pasta = await mkdtemp(join(tmpdir(), 'lidimus-autenticidade-'))
    const caminhoPdf = join(pasta, 'documento.pdf')
    try {
      await writeFile(caminhoPdf, pdf)

      const [qr, heterogeneas] = await Promise.all([
        lerQrDoPdf(caminhoPdf, pericia.paginas),
        detectarPaginasHeterogeneas(caminhoPdf, pericia.paginas),
      ])
      if (heterogeneas) pericia.indicios.push(heterogeneas)

      await db
        .update(jobs)
        .set({
          stageData: { ...(atual.stageData ?? {}), autenticidade: { pericia, qr } },
        })
        .where(eq(jobs.id, jobId))
    } finally {
      await rm(pasta, { recursive: true, force: true }).catch(() => {})
    }
  } catch (err) {
    console.warn(`[ocr] perícia completa de autenticidade falhou no job ${jobId}, seguindo sem ela:`, err)
  }
}

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

      await periciaCompletaDeAutenticidade(db, jobId)

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
