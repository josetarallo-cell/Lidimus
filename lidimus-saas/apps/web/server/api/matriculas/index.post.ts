import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { useQueues } from '../../lib/queue'
import { requireAuth } from '../../lib/requireAuth'
import { storeJobFile } from '../../lib/jobFile'
import { getOrCreatePersonalOrg } from '../../lib/getOrCreateOrg'
import { checkRateLimit } from '../../lib/rateLimit'
import { countPdfPages } from '../../lib/pdfPages'
import { assertPdfSignature } from '../../lib/fileSignature'
import { jobs, creditTransactions, creditCostFor, lockOrgCreditBalance } from '@lidimus/db'

const paramsSchema = z.object({
  incluirMemorial: z.boolean().optional().default(true),
  incluirCroqui: z.boolean().optional().default(false),
  geocodificar: z.boolean().optional().default(true),
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

  assertPdfSignature(filePart.data)

  const mimeType = filePart.type ?? 'application/pdf'
  const originalName = filePart.filename ?? 'matricula.pdf'

  const maxBytes = config.maxUploadSizeMb * 1024 * 1024
  if (filePart.data.length > maxBytes) {
    throw createError({ statusCode: 413, statusMessage: `Arquivo excede o limite de ${config.maxUploadSizeMb}MB.` })
  }

  const orgId = await getOrCreatePersonalOrg(db, user.id, user.name)

  const { connection, matriculaOcrQueue } = useQueues()
  await checkRateLimit(connection, `ratelimit:upload:${orgId}`, config.uploadRateLimitPerHour, 3600)

  // Custo proporcional ao nº de páginas — o custo real de tokens escala com o
  // tamanho do documento. A contagem no upload é best-effort (ver countPdfPages).
  const paginas = countPdfPages(Buffer.from(filePart.data))
  const custo = creditCostFor('matricula', { pages: paginas })

  const job = await db.transaction(async (tx) => {
    // Saldo checado e debitado na mesma transação, com lock de linha na org —
    // evita que uploads concorrentes leiam o mesmo saldo e furem o limite.
    const saldo = await lockOrgCreditBalance(tx, orgId)
    if (saldo < custo) {
      throw createError({
        statusCode: 402,
        statusMessage: `Créditos insuficientes. Saldo: ${saldo}, necessário: ${custo} (${paginas} página${paginas === 1 ? '' : 's'}).`,
      })
    }

    const [created] = await tx
      .insert(jobs)
      .values({
        orgId,
        userId: user.id,
        type: 'matricula',
        status: 'pending',
        inputMeta: { originalName, params, paginas },
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

  await matriculaOcrQueue.add('process', {
    jobId: job.id,
    fileAccessToken: accessToken,
    callbackUrl,
    fileUrl,
    params,
  })

  await db.update(jobs).set({ status: 'queued' }).where(eq(jobs.id, job.id))

  return { jobId: job.id, custo, paginas }
})
