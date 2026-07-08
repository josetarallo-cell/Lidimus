import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { useQueues } from '../../lib/queue'
import { softDeleteJobFile } from '../../lib/jobFile'
import { jobs, refundJobCredits } from '@lidimus/db'
import { publishJobEvent } from '../../lib/jobEvents'
import { createHmac, timingSafeEqual } from 'crypto'

const bodySchema = z.object({
  jobId: z.string().uuid(),
  stage: z.enum(['ocr', 'juridico', 'doc']).optional(),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
})

function verifyHmac(secret: string, body: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const expectedFull = `sha256=${expected}`
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedFull))
  } catch {
    return false
  }
}

function verifyStaticSecret(secret: string, provided: string): boolean {
  if (secret.length !== provided.length) return false
  try {
    return timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
  } catch {
    return false
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const rawBody = await readRawBody(event)
  if (!rawBody) throw createError({ statusCode: 400 })

  // Aceita tanto X-Lidimus-Signature (HMAC sha256) quanto X-Lidimus-Secret (secret estático)
  // Os workflows n8n enviam X-Lidimus-Secret com o callbackSecret passado pelo worker
  const hmacSig = getHeader(event, 'x-lidimus-signature')
  const staticSecret = getHeader(event, 'x-lidimus-secret')

  const authenticated =
    (hmacSig && verifyHmac(config.n8nCallbackSecret, rawBody, hmacSig)) ||
    (staticSecret && verifyStaticSecret(config.n8nCallbackSecret, staticSecret))

  if (!authenticated) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  const body = bodySchema.parse(JSON.parse(rawBody))
  const db = useDb()

  const [job] = await db.select().from(jobs).where(eq(jobs.id, body.jobId)).limit(1)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  if (body.error) {
    await db
      .update(jobs)
      .set({
        status: 'error',
        errorMessage: body.stage ? `[${body.stage}] ${body.error}` : body.error,
        completedAt: new Date(),
      })
      .where(eq(jobs.id, body.jobId))
    await refundJobCredits(db, body.jobId)
    await publishJobEvent(useQueues().connection, body.jobId)
    return { ok: true }
  }

  // ─── Pipeline de matrícula: orquestração por etapa ──────────────────────────
  if (job.type === 'matricula' && body.stage) {
    const result = body.result ?? {}
    const stageData = { ...(job.stageData ?? {}), [body.stage]: result }
    const callbackUrl = `${config.publicBaseUrl}/api/webhooks/n8n-callback`
    const params = ((job.inputMeta as Record<string, unknown>)?.params ?? {}) as Record<string, unknown>

    if (body.stage === 'ocr') {
      // O PDF já foi lido — o binário não é mais necessário nas próximas etapas
      await softDeleteJobFile(db, body.jobId)

      const textoOcr = String(result.texto_ocr ?? '')
      if (!textoOcr.trim()) {
        await db
          .update(jobs)
          .set({
            status: 'error',
            stageData,
            errorMessage: '[ocr] OCR retornou texto vazio.',
            completedAt: new Date(),
          })
          .where(eq(jobs.id, body.jobId))
        await refundJobCredits(db, body.jobId)
        await publishJobEvent(useQueues().connection, body.jobId)
        return { ok: true }
      }

      await db
        .update(jobs)
        .set({ stageData, status: 'queued', stage: 'juridico' })
        .where(eq(jobs.id, body.jobId))

      const { matriculaJuridicoQueue } = useQueues()
      await matriculaJuridicoQueue.add('process', {
        jobId: body.jobId,
        callbackUrl,
        textoOcr,
        totalPaginas: typeof result.total_paginas === 'number' ? result.total_paginas : undefined,
        params,
      })
      await publishJobEvent(useQueues().connection, body.jobId)
      return { ok: true }
    }

    if (body.stage === 'juridico') {
      await db
        .update(jobs)
        .set({ stageData, status: 'queued', stage: 'doc' })
        .where(eq(jobs.id, body.jobId))

      const { matriculaDocQueue } = useQueues()
      await matriculaDocQueue.add('process', {
        jobId: body.jobId,
        callbackUrl,
        dadosConsolidados: {
          ...result,
          total_paginas: (stageData.ocr as Record<string, unknown> | undefined)?.total_paginas ?? null,
          params,
        },
      })
      await publishJobEvent(useQueues().connection, body.jobId)
      return { ok: true }
    }

    // stage === 'doc' — etapa final
    await db
      .update(jobs)
      .set({
        stageData,
        status: 'done',
        stage: 'doc',
        result,
        completedAt: new Date(),
      })
      .where(eq(jobs.id, body.jobId))
    await publishJobEvent(useQueues().connection, body.jobId)
    return { ok: true }
  }

  // ─── Jobs de etapa única (kml, injection) ────────────────────────────────────
  await db
    .update(jobs)
    .set({ status: 'done', result: body.result ?? {}, completedAt: new Date() })
    .where(eq(jobs.id, body.jobId))

  await softDeleteJobFile(db, body.jobId)

  await publishJobEvent(useQueues().connection, body.jobId)
  return { ok: true }
})
