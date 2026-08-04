import { nomeDoArquivoParecer, pareceMatriculaDocx } from '@lidimus/docx'
import { useDb } from '../../../lib/db'
import { requireAuth } from '../../../lib/requireAuth'
import { getJobForUser } from '../../../lib/getJobForUser'
import { exigirDocx } from '../../../lib/planAccess'
import { dataDeEmissao, enviarDocx } from '../../../lib/respostaDocx'

// O parecer em .docx — a versão editável do que a tela imprime em PDF.
//
// Exportar não consome créditos: é reemissão de trabalho já pago. A autorização
// é a mesma do GET do job (getJobForUser filtra por organização do usuário e
// ainda passa pelo limparJob, que remove custo em dólar e modelos).
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400 })

  const job = await getJobForUser(db, id, user.id)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  // O plano de quem PAGOU a análise. Esconder o botão na tela não é controle de
  // acesso: esta linha é a única coisa entre o arquivo e quem montar a URL.
  await exigirDocx(db, job.orgId)

  if (job.type !== 'matricula') {
    throw createError({ statusCode: 404, statusMessage: 'Job não é uma análise de matrícula' })
  }

  const documento = (job.result as Record<string, any> | null)?.documento
  if (job.status !== 'done' || !documento) {
    // 409 e não 404: o job existe e é do usuário — só ainda não tem parecer.
    throw createError({
      statusCode: 409,
      statusMessage:
        job.status === 'error'
          ? 'Esta análise falhou e não tem parecer para exportar.'
          : 'Esta análise ainda não foi concluída.',
    })
  }

  const buffer = await pareceMatriculaDocx(documento, {
    emitidoEm: dataDeEmissao(job.completedAt),
    arquivoOriginal: (job.inputMeta as Record<string, any> | null)?.originalName ?? null,
  })

  return enviarDocx(event, buffer, nomeDoArquivoParecer(documento, job.id))
})
