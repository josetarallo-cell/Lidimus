import { eq } from 'drizzle-orm'
import { jobs } from '@lidimus/db'
import type { Candidato } from '@lidimus/revisao'
import { useDb } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/requireAuth'
import { getJobForUser } from '../../../../lib/getJobForUser'

// Serve o recorte de um trecho em conferência.
//
// Existe para tirar as imagens do payload do job: elas são grandes, imutáveis e
// pedidas uma vez só, o oposto do status, que é pequeno, muda a cada etapa e é
// reenviado a cada mudança. Ver server/lib/recortesDaRevisao.ts.

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const jobId = getRouterParam(event, 'id')
  const candidatoId = getRouterParam(event, 'candidato')
  if (!jobId || !candidatoId) throw createError({ statusCode: 400 })

  // Autorização pelo mesmo caminho de sempre: quem não enxerga o job não
  // enxerga pedaço nenhum do documento dele.
  const permitido = await getJobForUser(db, jobId, user.id)
  if (!permitido) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  // A imagem em si vem da linha crua — o payload que `getJobForUser` devolve é
  // justamente o que teve os recortes trocados por endereço.
  const [bruto] = await db
    .select({ stageData: jobs.stageData })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1)

  const revisao = (bruto?.stageData as Record<string, unknown> | null)?.revisao as
    | Record<string, unknown>
    | undefined
  const candidatos = Array.isArray(revisao?.candidatos)
    ? (revisao.candidatos as Candidato[])
    : []

  const candidato = candidatos.find((c) => c.id === candidatoId)
  const dataUrl = candidato?.recorte

  // Some quando a revisão encerra: as imagens saem do banco assim que deixam de
  // ter uso (ver semRecortes em @lidimus/revisao).
  if (!dataUrl?.startsWith('data:image/png;base64,')) {
    throw createError({ statusCode: 404, statusMessage: 'Recorte não disponível' })
  }

  const png = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')

  setHeader(event, 'Content-Type', 'image/png')
  setHeader(event, 'Content-Length', png.length)
  // Documento de terceiro: cacheia no navegador de quem tem acesso, nunca em
  // proxy compartilhado. `immutable` porque o recorte nunca muda — ele nasce com
  // a revisão e some com ela.
  setHeader(event, 'Cache-Control', 'private, max-age=3600, immutable')
  return png
})
