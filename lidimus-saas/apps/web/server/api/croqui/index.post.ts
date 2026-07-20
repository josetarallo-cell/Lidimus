import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { useQueues } from '../../lib/queue'
import { requireAuth } from '../../lib/requireAuth'
import { storeJobFile } from '../../lib/jobFile'
import { getOrCreatePersonalOrg } from '../../lib/getOrCreateOrg'
import { getJobForUser } from '../../lib/getJobForUser'
import { checkRateLimit } from '../../lib/rateLimit'
import { countPdfPages } from '../../lib/pdfPages'
import { jobs, creditTransactions, creditCostFor, getOrgCreditBalance } from '@lidimus/db'

// Dois modos de entrada:
//  1. multipart (PDF da matrícula) — pipeline ocr → croqui, cobra por página
//  2. JSON { matriculaJobId } — reaproveita o texto OCR de um job já processado,
//     sem OCR novo: cobra o mínimo (1 página) e vai direto para a fila do croqui
const reuseSchema = z.object({ matriculaJobId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const config = useRuntimeConfig()
  const db = useDb()

  const contentType = getHeader(event, 'content-type') ?? ''
  const orgId = await getOrCreatePersonalOrg(db, user.id, user.name)
  const callbackUrl = `${config.publicBaseUrl}/api/webhooks/n8n-callback`

  // ─── Modo 2: reaproveitar matrícula já lida ─────────────────────────────────
  if (contentType.includes('application/json')) {
    const { matriculaJobId } = reuseSchema.parse(await readBody(event))

    const origem = await getJobForUser(db, matriculaJobId, user.id)
    if (!origem) throw createError({ statusCode: 404, statusMessage: 'Análise de origem não encontrada.' })

    const stageData = (origem.stageData ?? {}) as Record<string, any>
    const textoOcr = String(stageData.ocr?.texto_ocr ?? '')
    if (!textoOcr.trim()) {
      throw createError({
        statusCode: 422,
        statusMessage: 'A análise de origem ainda não tem o texto do documento — aguarde a leitura terminar ou envie o PDF.',
      })
    }

    const custo = creditCostFor('croqui')
    const saldo = await getOrgCreditBalance(db, orgId)
    if (saldo < custo) {
      throw createError({
        statusCode: 402,
        statusMessage: `Créditos insuficientes. Saldo: ${saldo}, necessário: ${custo}.`,
      })
    }

    const inputMeta = (origem.inputMeta ?? {}) as Record<string, any>
    const job = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(jobs)
        .values({
          orgId,
          userId: user.id,
          type: 'croqui',
          status: 'pending',
          stage: 'croqui',
          inputMeta: {
            originalName: inputMeta.originalName ?? 'matricula.pdf',
            origem: { tipo: 'matricula', jobId: matriculaJobId },
          },
        })
        .returning({ id: jobs.id })

      await tx.insert(creditTransactions).values({
        orgId,
        delta: -custo,
        reason: 'consumption',
        jobId: created.id,
      })

      return created
    })

    const { croquiQueue } = useQueues()
    await croquiQueue.add('process', {
      jobId: job.id,
      callbackUrl,
      textoOcr,
      totalPaginas:
        typeof stageData.ocr?.total_paginas === 'number' ? stageData.ocr.total_paginas : undefined,
      params: {},
    })

    await db.update(jobs).set({ status: 'queued' }).where(eq(jobs.id, job.id))

    return { jobId: job.id, custo }
  }

  // ─── Modo 1: upload avulso do PDF da matrícula ──────────────────────────────
  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, statusMessage: 'Multipart form required' })

  const filePart = form.find((f) => f.name === 'file')
  if (!filePart?.data) throw createError({ statusCode: 400, statusMessage: 'Field "file" required' })

  const mimeType = filePart.type ?? 'application/pdf'
  const originalName = filePart.filename ?? 'matricula.pdf'

  const { connection, matriculaOcrQueue } = useQueues()
  await checkRateLimit(connection, `ratelimit:upload:${orgId}`, config.uploadRateLimitPerHour, 3600)

  const maxBytes = config.maxUploadSizeMb * 1024 * 1024
  if (filePart.data.length > maxBytes) {
    throw createError({ statusCode: 413, statusMessage: `Arquivo excede o limite de ${config.maxUploadSizeMb}MB.` })
  }

  const paginas = countPdfPages(Buffer.from(filePart.data))
  const custo = creditCostFor('croqui', { pages: paginas })
  const saldo = await getOrgCreditBalance(db, orgId)
  if (saldo < custo) {
    throw createError({
      statusCode: 402,
      statusMessage: `Créditos insuficientes. Saldo: ${saldo}, necessário: ${custo} (${paginas} página${paginas === 1 ? '' : 's'}).`,
    })
  }

  const job = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(jobs)
      .values({
        orgId,
        userId: user.id,
        type: 'croqui',
        status: 'pending',
        inputMeta: { originalName, paginas },
      })
      .returning({ id: jobs.id })

    await tx.insert(creditTransactions).values({
      orgId,
      delta: -custo,
      reason: 'consumption',
      jobId: created.id,
    })

    return created
  })

  const { fileUrl, accessToken } = await storeJobFile(
    db,
    job.id,
    Buffer.from(filePart.data),
    mimeType,
    originalName,
    config.publicBaseUrl,
  )

  await matriculaOcrQueue.add('process', {
    jobId: job.id,
    fileAccessToken: accessToken,
    callbackUrl,
    fileUrl,
    params: {},
  })

  await db.update(jobs).set({ status: 'queued' }).where(eq(jobs.id, job.id))

  return { jobId: job.id, custo, paginas }
})
