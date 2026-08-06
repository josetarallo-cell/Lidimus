import { requireApiKey } from '../../../lib/requireApiKey'
import {
  criarAnalisesMatriculaEmLote,
  paramsMatriculaSchema,
} from '../../../lib/criarAnaliseMatricula'
import { ipDoCliente } from '../../../lib/ipDoCliente'
import { defineRotaApi, erroApi } from '../../../lib/v1/erroApi'

// POST /api/v1/matriculas/lote — várias matrículas numa requisição só.
//
// Não existe para poupar requisições: um laço sobre POST /api/v1/matriculas já
// funciona e cabe no teto de 120/hora. Existe pela **garantia de cobrança**: as N
// análises são validadas e debitadas numa transação só. Ou todas entram, ou
// nenhuma entra e nada é cobrado.
//
// No laço, a integração que fica sem saldo no sétimo PDF termina com seis
// análises pagas, uma recusada e três nunca enviadas — e cabe a ela descobrir
// onde parou e reconciliar. Aqui o 402 chega antes de qualquer débito, com o
// custo do lote inteiro na mensagem.
export default defineRotaApi(async (event) => {
  const { orgId, userId, keyId } = await requireApiKey(event)
  const config = useRuntimeConfig()

  // Antes de ler o corpo: `readMultipartFormData` bufferiza tudo em memória.
  const declarado = Number(getHeader(event, 'content-length') ?? 0)
  if (declarado > config.maxBatchTotalMb * 1024 * 1024) {
    throw erroApi(
      413,
      'arquivo_grande_demais',
      `O lote inteiro não pode passar de ${config.maxBatchTotalMb}MB. Envie em partes.`,
    )
  }

  const form = await readMultipartFormData(event)
  if (!form) {
    throw erroApi(
      400,
      'requisicao_invalida',
      'Envie a requisição como multipart/form-data com um campo "file" por PDF.',
    )
  }

  const partes = form.filter((f) => f.name === 'file' && f.data?.length)
  if (partes.length === 0) {
    throw erroApi(
      400,
      'arquivo_invalido',
      'Envie ao menos um PDF. Repita o campo "file" uma vez por arquivo.',
    )
  }
  if (partes.length > config.maxBatchFiles) {
    throw erroApi(
      400,
      'requisicao_invalida',
      `São no máximo ${config.maxBatchFiles} arquivos por lote — você enviou ${partes.length}.`,
    )
  }

  const paramsPart = form.find((f) => f.name === 'params')
  let params
  try {
    params = paramsMatriculaSchema.parse(
      paramsPart?.data ? JSON.parse(paramsPart.data.toString()) : {},
    )
  } catch {
    throw erroApi(
      400,
      'requisicao_invalida',
      'O campo "params" deve ser um JSON com as chaves incluirMemorial, incluirCroqui e geocodificar (todas booleanas e opcionais). Ele vale para todos os arquivos do lote.',
    )
  }

  const { loteId, itens, custoTotal, saldoRestante } = await criarAnalisesMatriculaEmLote({
    orgId,
    userId,
    arquivos: partes.map((p) => ({
      arquivo: Buffer.from(p.data),
      mimeType: p.type ?? 'application/pdf',
      originalName: p.filename ?? 'matricula.pdf',
    })),
    params,
    origem: 'api',
    ip: ipDoCliente(event),
    apiKeyId: keyId,
  })

  setResponseStatus(event, 202)
  return {
    loteId,
    // Mesma forma de item da resposta unitária (id/status/arquivo/paginas), para
    // a integração poder tratar os dois caminhos com o mesmo código.
    itens: itens.map((i) => ({
      id: i.jobId,
      status: 'queued' as const,
      arquivo: i.originalName,
      paginas: i.paginas,
      custoCreditos: i.custo,
    })),
    custoTotal,
    saldoRestante,
  }
})
