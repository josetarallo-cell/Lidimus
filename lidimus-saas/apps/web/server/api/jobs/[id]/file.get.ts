import { getJobFileSignedUrl } from '../../../lib/jobFile'
import { useDb } from '../../../lib/db'

// Acessado pelo n8n para baixar o arquivo — valida token e redireciona para URL assinada do GCS
export default defineEventHandler(async (event) => {
  const db = useDb()
  const jobId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const token = query.token as string | undefined

  if (!jobId || !token) throw createError({ statusCode: 400 })

  const result = await getJobFileSignedUrl(db, jobId, token)

  if (!result) throw createError({ statusCode: 404, statusMessage: 'File not found or expired' })

  return sendRedirect(event, result.signedUrl, 302)
})
