import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { exigirPermissaoDeCriar, vinculoDoUsuario } from '../../lib/orgAtiva'
import { criarAnaliseMatricula, paramsMatriculaSchema } from '../../lib/criarAnaliseMatricula'
import { ipDoCliente } from '../../lib/ipDoCliente'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, statusMessage: 'Multipart form required' })

  const filePart = form.find((f) => f.name === 'file')
  if (!filePart?.data) throw createError({ statusCode: 400, statusMessage: 'Field "file" required' })

  const paramsPart = form.find((f) => f.name === 'params')
  const rawParams = paramsPart?.data ? JSON.parse(paramsPart.data.toString()) : {}
  const params = paramsMatriculaSchema.parse(rawParams)

  const vinculo = await vinculoDoUsuario(db, user.id, user.name)
  exigirPermissaoDeCriar(vinculo)

  // Validação do arquivo, acesso, limite de uso, débito e enfileiramento ficam em
  // criarAnaliseMatricula — o mesmo caminho que a API pública usa.
  const { jobId, custo, paginas } = await criarAnaliseMatricula({
    orgId: vinculo.orgId,
    userId: user.id,
    arquivo: Buffer.from(filePart.data),
    mimeType: filePart.type ?? 'application/pdf',
    originalName: filePart.filename ?? 'matricula.pdf',
    params,
    origem: 'app',
    ip: ipDoCliente(event),
  })

  return { jobId, custo, paginas }
})
