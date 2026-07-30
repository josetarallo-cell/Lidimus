import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { useQueues } from '../../lib/queue'
import { requireAuth } from '../../lib/requireAuth'
import { storeJobFile } from '../../lib/jobFile'
import { exigirPermissaoDeCriar, vinculoDoUsuario } from '../../lib/orgAtiva'
import { checkRateLimit } from '../../lib/rateLimit'
import { exigirAcesso } from '../../lib/planAccess'
import { countPdfPages } from '../../lib/pdfPages'
import { assertPdfSignature } from '../../lib/fileSignature'
import { jobs, creditTransactions, creditCostFor, lockOrgCreditBalance } from '@lidimus/db'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const config = useRuntimeConfig()
  const db = useDb()

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, statusMessage: 'Multipart form required' })

  const filePart = form.find((f) => f.name === 'file')
  if (!filePart?.data) throw createError({ statusCode: 400, statusMessage: 'Field "file" required' })

  assertPdfSignature(filePart.data)

  const mimeType = filePart.type ?? 'application/pdf'
  const originalName = filePart.filename ?? 'document.pdf'

  const maxBytes = config.maxUploadSizeMb * 1024 * 1024
  if (filePart.data.length > maxBytes) {
    throw createError({ statusCode: 413, statusMessage: `Arquivo excede o limite de ${config.maxUploadSizeMb}MB.` })
  }

  const vinculo = await vinculoDoUsuario(db, user.id, user.name)
  exigirPermissaoDeCriar(vinculo)
  const orgId = vinculo.orgId
  await exigirAcesso(db, orgId, 'injection')

  const { connection, injectionQueue } = useQueues()
  await checkRateLimit(connection, `ratelimit:upload:${orgId}`, config.uploadRateLimitPerHour, 3600)

  const paginas = countPdfPages(Buffer.from(filePart.data))
  const custo = creditCostFor('injection', { pages: paginas })

  const job = await db.transaction(async (tx) => {
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
        type: 'injection',
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

  const callbackUrl = `${config.publicBaseUrl}/api/webhooks/n8n-callback`

  await injectionQueue.add('process', {
    jobId: job.id,
    fileAccessToken: accessToken,
    callbackUrl,
    fileUrl,
    params: {},
  })

  await db.update(jobs).set({ status: 'queued' }).where(eq(jobs.id, job.id))

  return { jobId: job.id, custo, paginas }
})
