import { requireApiKey } from '../../../lib/requireApiKey'
import { criarAnaliseMatricula, paramsMatriculaSchema } from '../../../lib/criarAnaliseMatricula'
import { defineRotaApi, erroApi } from '../../../lib/v1/erroApi'

// POST /api/v1/matriculas — envia uma matrícula para análise.
//
// multipart/form-data, os mesmos campos que o painel manda: `file` com o PDF e
// `params` opcional com o JSON de opções. Multipart e não JSON com base64 porque
// é o que qualquer linguagem faz sem biblioteca, e porque assim o arquivo chega
// aqui do mesmo jeito que chega da tela — um caminho de código, não dois.
export default defineRotaApi(async (event) => {
  const { orgId, userId, keyId } = await requireApiKey(event)

  const form = await readMultipartFormData(event)
  if (!form) {
    throw erroApi(
      400,
      'requisicao_invalida',
      'Envie a requisição como multipart/form-data com o campo "file".',
    )
  }

  const filePart = form.find((f) => f.name === 'file')
  if (!filePart?.data) {
    throw erroApi(400, 'arquivo_invalido', 'O campo "file" é obrigatório e deve conter o PDF da matrícula.')
  }

  const paramsPart = form.find((f) => f.name === 'params')
  let params
  try {
    params = paramsMatriculaSchema.parse(paramsPart?.data ? JSON.parse(paramsPart.data.toString()) : {})
  } catch {
    throw erroApi(
      400,
      'requisicao_invalida',
      'O campo "params" deve ser um JSON com as chaves incluirMemorial, incluirCroqui e geocodificar (todas booleanas e opcionais).',
    )
  }

  const { jobId, custo, paginas, saldoRestante } = await criarAnaliseMatricula({
    orgId,
    userId,
    arquivo: Buffer.from(filePart.data),
    mimeType: filePart.type ?? 'application/pdf',
    originalName: filePart.filename ?? 'matricula.pdf',
    params,
    origem: 'api',
    apiKeyId: keyId,
  })

  setResponseStatus(event, 202)
  return {
    id: jobId,
    status: 'queued' as const,
    paginas,
    // O consumo vai na resposta da criação, e não na consulta: aqui é o único
    // momento em que se sabe exatamente o que foi cobrado. Análise que falha tem
    // o crédito estornado, então "custo" de um job concluído é ambíguo.
    custoCreditos: custo,
    saldoRestante,
  }
})
