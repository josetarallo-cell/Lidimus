import { eq, and, isNull } from 'drizzle-orm'
import { useDb } from '../../../lib/db'
import { jobFiles } from '@lidimus/db'

// Endpoint acessado pelo n8n para baixar o arquivo (sem auth de usuário — usa token de acesso)
export default defineEventHandler(async (event) => {
  const db = useDb()
  const jobId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const token = query.token as string | undefined

  if (!jobId || !token) throw createError({ statusCode: 400 })

  const [file] = await db
    .select()
    .from(jobFiles)
    .where(
      and(
        eq(jobFiles.jobId, jobId),
        eq(jobFiles.accessToken, token),
        isNull(jobFiles.deletedAt),
      ),
    )
    .limit(1)

  if (!file) throw createError({ statusCode: 404, statusMessage: 'File not found or expired' })

  setResponseHeader(event, 'Content-Type', file.mimeType)
  setResponseHeader(
    event,
    'Content-Disposition',
    `attachment; filename="${file.originalName}"`,
  )

  return Buffer.from(file.content as unknown as Buffer)
})
