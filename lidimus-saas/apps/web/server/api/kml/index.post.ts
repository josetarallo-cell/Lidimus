import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { useQueues } from '../../lib/queue'
import { requireAuth } from '../../lib/requireAuth'
import { storeJobFile } from '../../lib/jobFile'
import { exigirPermissaoDeCriar, vinculoDoUsuario } from '../../lib/orgAtiva'
import { checkRateLimit } from '../../lib/rateLimit'
import { exigirAcesso } from '../../lib/planAccess'
import { assertKmlSignature } from '../../lib/fileSignature'
import { jobs, creditTransactions, creditCostFor, lockOrgCreditBalance } from '@lidimus/db'

const paramsSchema = z.object({
  nomeImovel: z.string().optional().default(''),
  municipio: z.string().optional().default(''),
  estado: z.string().optional().default(''),
  rua: z.string().trim().max(120).optional().default(''),
})

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const config = useRuntimeConfig()
  const db = useDb()

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, statusMessage: 'Multipart form required' })

  const filePart = form.find((f) => f.name === 'file')
  if (!filePart?.data) throw createError({ statusCode: 400, statusMessage: 'Field "file" required' })

  const paramsPart = form.find((f) => f.name === 'params')
  const rawParams = paramsPart?.data ? JSON.parse(paramsPart.data.toString()) : {}
  const params = paramsSchema.parse(rawParams)

  assertKmlSignature(filePart.data)

  const mimeType = filePart.type ?? 'application/vnd.google-earth.kml+xml'
  const originalName = filePart.filename ?? 'terreno.kml'

  const maxBytes = config.maxUploadSizeMb * 1024 * 1024
  if (filePart.data.length > maxBytes) {
    throw createError({ statusCode: 413, statusMessage: `Arquivo excede o limite de ${config.maxUploadSizeMb}MB.` })
  }

  const vinculo = await vinculoDoUsuario(db, user.id, user.name)
  exigirPermissaoDeCriar(vinculo)
  const orgId = vinculo.orgId
  await exigirAcesso(db, orgId, 'kml')

  const { connection, kmlQueue } = useQueues()
  await checkRateLimit(connection, `ratelimit:upload:${orgId}`, config.uploadRateLimitPerHour, 3600)

  const custo = creditCostFor('kml')

  const job = await db.transaction(async (tx) => {
    const saldo = await lockOrgCreditBalance(tx, orgId)
    if (saldo < custo) {
      throw createError({
        statusCode: 402,
        statusMessage: `Créditos insuficientes. Saldo: ${saldo}, necessário: ${custo}.`,
      })
    }

    const [created] = await tx
      .insert(jobs)
      .values({
        orgId,
        userId: user.id,
        type: 'kml',
        status: 'pending',
        inputMeta: { originalName, params },
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

  const callbackUrl = `${config.publicBaseUrl}/api/webhooks/n8n-callback`

  await kmlQueue.add('process', {
    jobId: job.id,
    fileAccessToken: accessToken,
    callbackUrl,
    fileUrl,
    params,
  })

  await db.update(jobs).set({ status: 'queued' }).where(eq(jobs.id, job.id))

  return { jobId: job.id }
})
