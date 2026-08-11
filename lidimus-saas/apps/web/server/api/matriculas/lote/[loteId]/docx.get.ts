import { z } from 'zod'
import { loteMatriculasDocx, nomeDoArquivoLote } from '@lidimus/docx'
import { useDb } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/requireAuth'
import { getJobsDoLote } from '../../../../lib/getJobsDoLote'
import { exigirDocx } from '../../../../lib/planAccess'
import { dataDeEmissao, enviarDocx } from '../../../../lib/respostaDocx'

// O lote inteiro num .docx só: capa com o índice do envio e um parecer por
// página. Análises que não concluíram entram no índice com o motivo — sumir com
// elas faria o arquivo parecer completo quando não é.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const loteId = z.string().uuid().safeParse(getRouterParam(event, 'loteId'))
  if (!loteId.success) throw createError({ statusCode: 400, statusMessage: 'Lote inválido' })

  const jobsDoLote = await getJobsDoLote(db, loteId.data, user.id)
  // Lote inexistente e lote de outra organização são a mesma resposta: quem não
  // pode ver não fica sabendo que existe.
  if (!jobsDoLote.length) throw createError({ statusCode: 404, statusMessage: 'Lote não encontrado' })

  // Todos os jobs de um lote nascem do mesmo envio, logo da mesma organização —
  // basta perguntar por uma. Como no parecer avulso, é o plano de quem pagou
  // que decide, e a checagem vive aqui, não no botão.
  await exigirDocx(db, jobsDoLote[0].orgId)

  const prontos = jobsDoLote.filter(
    (j) => j.status === 'done' && (j.result as Record<string, any> | null)?.documento,
  )
  if (!prontos.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Nenhuma análise deste lote foi concluída — não há relatório para exportar.',
    })
  }

  const enviadoEm = dataDeEmissao(jobsDoLote[0]?.createdAt)

  const buffer = await loteMatriculasDocx(
    jobsDoLote.map((job) => ({
      id: job.id,
      status: job.status,
      arquivoOriginal: (job.inputMeta as Record<string, any> | null)?.originalName ?? null,
      emitidoEm: dataDeEmissao(job.completedAt),
      documento: (job.result as Record<string, any> | null)?.documento ?? null,
    })),
    { loteId: loteId.data, enviadoEm },
  )

  return enviarDocx(event, buffer, nomeDoArquivoLote(enviadoEm))
})
