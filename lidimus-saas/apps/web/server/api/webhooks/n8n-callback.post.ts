import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { softDeleteJobFile } from '../../lib/jobFile'
import { jobs } from '@lidimus/db'
import { createHmac, timingSafeEqual } from 'crypto'

const bodySchema = z.object({
  jobId: z.string().uuid(),
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

  if (body.error) {
    await db
      .update(jobs)
      .set({ status: 'error', errorMessage: body.error, completedAt: new Date() })
      .where(eq(jobs.id, body.jobId))
  } else {
    await db
      .update(jobs)
      .set({ status: 'done', result: body.result ?? {}, completedAt: new Date() })
      .where(eq(jobs.id, body.jobId))

    await softDeleteJobFile(db, body.jobId)
  }

  return { ok: true }
})
