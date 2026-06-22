import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { useQueues } from '../../lib/queue'
import { requireAuth } from '../../lib/requireAuth'
import { storeJobFile } from '../../lib/jobFile'
import { getOrCreatePersonalOrg } from '../../lib/getOrCreateOrg'
import { jobs } from '@lidimus/db'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const config = useRuntimeConfig()
  const db = useDb()

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, statusMessage: 'Multipart form required' })

  const filePart = form.find((f) => f.name === 'file')
  if (!filePart?.data) throw createError({ statusCode: 400, statusMessage: 'Field "file" required' })

  const mimeType = filePart.type ?? 'application/pdf'
  const originalName = filePart.filename ?? 'document.pdf'

  const orgId = await getOrCreatePersonalOrg(db, user.id, user.name)

  const [job] = await db
    .insert(jobs)
    .values({
      orgId,
      userId: user.id,
      type: 'injection',
      status: 'pending',
      inputMeta: { originalName },
    })
    .returning({ id: jobs.id })

  const { fileUrl, accessToken } = await storeJobFile(
    db,
    job.id,
    Buffer.from(filePart.data),
    mimeType,
    originalName,
    config.publicBaseUrl,
  )

  const callbackUrl = `${config.publicBaseUrl}/api/webhooks/n8n-callback`

  const { injectionQueue } = useQueues()
  await injectionQueue.add('process', {
    jobId: job.id,
    fileAccessToken: accessToken,
    callbackUrl,
    fileUrl,
    params: {},
  })

  await db.update(jobs).set({ status: 'queued' }).where(eq(jobs.id, job.id))

  return { jobId: job.id }
})
