// Worker do corretor de leitura.
//
// É a única etapa do pipeline que não chama serviço externo nenhum: baixa o PDF
// que ainda está no GCS, recorta a imagem dos trechos que o filtro levantou,
// apaga o binário e para o job em `awaiting_review`, esperando o usuário.
//
// O recorte é feito aqui, e não no container que atende a tela, por dois
// motivos: rasterizar PDF é trabalho de CPU que não deve disputar com quem está
// navegando, e um lote de dez matrículas dispararia dez rasterizações
// simultâneas no processo web.

import { Worker } from 'bullmq'
import { and, eq, inArray } from 'drizzle-orm'
import type IORedis from 'ioredis'
import type { Db } from '@lidimus/db'
import { jobFiles, jobs } from '@lidimus/db'
import type { MatriculaRevisaoJobPayload } from '@lidimus/queue'
import { QUEUE_NAMES, publishJobEvent } from '@lidimus/queue'
import { apagarDoGcs, baixarDoGcs } from './lib/gcs.ts'
import { recortarCandidatos } from './lib/recorte.ts'
import { seguirParaJuridico } from './lib/seguirParaJuridico.ts'
import type { EnfileirarJuridico } from './lib/seguirParaJuridico.ts'

export function startMatriculaRevisaoWorker(
  db: Db,
  redisUrl: string,
  enfileirarJuridico: EnfileirarJuridico,
  callbackUrl: string,
  publisher: IORedis,
) {
  const worker = new Worker<MatriculaRevisaoJobPayload>(
    QUEUE_NAMES.MATRICULA_REVISAO,
    async (job) => {
      const { jobId, candidatos } = job.data

      await db
        .update(jobs)
        .set({ status: 'processing', stage: 'revisao' })
        .where(and(eq(jobs.id, jobId), inArray(jobs.status, ['pending', 'queued', 'processing'])))

      const [arquivo] = await db
        .select({ gcsPath: jobFiles.gcsPath, deletedAt: jobFiles.deletedAt })
        .from(jobFiles)
        .where(eq(jobFiles.jobId, jobId))
        .limit(1)

      let comRecorte = candidatos

      if (arquivo && !arquivo.deletedAt) {
        const pdf = await baixarDoGcs(arquivo.gcsPath)
        comRecorte = await recortarCandidatos(pdf, candidatos)

        // O binário morre aqui, poucos segundos depois da leitura, como sempre
        // morreu — a diferença é que agora sai depois do recorte, e não antes.
        await apagarDoGcs(arquivo.gcsPath)
        await db
          .update(jobFiles)
          .set({ deletedAt: new Date() })
          .where(eq(jobFiles.jobId, jobId))
      }

      // Nenhum recorte saiu: sem imagem, o corretor não tem o que mostrar e a
      // pergunta viraria "confira este texto que você não pode ver". Segue
      // direto para a análise, como antes desta etapa existir.
      if (!comRecorte.some((c) => c.recorte)) {
        await seguirParaJuridico(db, enfileirarJuridico, publisher, jobId, callbackUrl, 'indisponivel', [
          'pending',
          'queued',
          'processing',
        ])
        return
      }

      const [atual] = await db
        .select({ stageData: jobs.stageData })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1)

      const aplicado = await db
        .update(jobs)
        .set({
          status: 'awaiting_review',
          stage: 'revisao',
          stageData: {
            ...(atual?.stageData ?? {}),
            revisao: { candidatos: comRecorte, pedidaEm: new Date().toISOString() },
          },
        })
        .where(and(eq(jobs.id, jobId), inArray(jobs.status, ['pending', 'queued', 'processing'])))
        .returning({ id: jobs.id })

      if (aplicado.length === 0) {
        console.warn(`[revisao] ignorado: job ${jobId} já não estava ativo`)
        return
      }

      await publishJobEvent(publisher, jobId)
    },
    {
      connection: { url: redisUrl },
      // Rasterizar é caro em CPU e o worker divide o container com as outras
      // etapas; poucas em paralelo bastam, já que a etapa dura segundos.
      concurrency: Number(process.env.WORKER_REVISAO_CONCURRENCY ?? 2),
    },
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return

    // Falhar aqui não pode custar a análise ao cliente: ele pagou por um
    // relatório, não pela conferência. O job segue para o jurídico com o texto
    // que o OCR leu e ninguém perde crédito por um recorte que não saiu.
    console.error(`[revisao] job ${job.data.jobId} sem recorte, seguindo sem conferência:`, err)
    await seguirParaJuridico(
      db,
      enfileirarJuridico,
      publisher,
      job.data.jobId,
      callbackUrl,
      'indisponivel',
      ['pending', 'queued', 'processing'],
    )
  })

  return worker
}
