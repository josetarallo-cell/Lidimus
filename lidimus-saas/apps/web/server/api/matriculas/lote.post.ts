import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { exigirPermissaoDeCriar, vinculoDoUsuario } from '../../lib/orgAtiva'
import { criarAnalisesMatriculaEmLote, paramsMatriculaSchema } from '../../lib/criarAnaliseMatricula'
import { ipDoCliente } from '../../lib/ipDoCliente'

// POST /api/matriculas/lote — várias matrículas num envio só.
//
// Um request com N arquivos, e não N requests: é o que permite cobrar o lote em
// uma transação só (tudo ou nada). Fatiar no cliente devolveria o problema que a
// tela quer evitar — o sétimo arquivo esgotar o saldo e deixar seis pagos.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()
  const config = useRuntimeConfig()

  // Antes de ler o corpo, não depois: `readMultipartFormData` bufferiza tudo em
  // memória, então esperar para medir já é tarde — o processo web já pagou a RAM.
  // Content-Length é do cliente e não é confiável como *garantia*, mas é o único
  // sinal disponível antes da leitura, e o teto por arquivo continua valendo
  // depois.
  const declarado = Number(getHeader(event, 'content-length') ?? 0)
  const maxBytes = config.maxBatchTotalMb * 1024 * 1024
  if (declarado > maxBytes) {
    throw createError({
      statusCode: 413,
      statusMessage: `O lote inteiro não pode passar de ${config.maxBatchTotalMb}MB. Envie em partes.`,
    })
  }

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, statusMessage: 'Multipart form required' })

  const partes = form.filter((f) => f.name === 'file' && f.data?.length)
  if (partes.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Envie ao menos um arquivo no campo "file".' })
  }
  if (partes.length > config.maxBatchFiles) {
    throw createError({
      statusCode: 400,
      statusMessage: `São no máximo ${config.maxBatchFiles} arquivos por lote — você enviou ${partes.length}.`,
    })
  }

  const paramsPart = form.find((f) => f.name === 'params')
  const rawParams = paramsPart?.data ? JSON.parse(paramsPart.data.toString()) : {}
  const params = paramsMatriculaSchema.parse(rawParams)

  const vinculo = await vinculoDoUsuario(db, user.id, user.name)
  exigirPermissaoDeCriar(vinculo)

  // Validação dos arquivos, acesso, limite de uso, débito e enfileiramento ficam
  // em criarAnalisesMatriculaEmLote — o mesmo caminho de cobrança do envio
  // unitário e da API pública.
  const { loteId, itens, custoTotal, saldoRestante } = await criarAnalisesMatriculaEmLote({
    orgId: vinculo.orgId,
    userId: user.id,
    arquivos: partes.map((p) => ({
      arquivo: Buffer.from(p.data),
      mimeType: p.type ?? 'application/pdf',
      originalName: p.filename ?? 'matricula.pdf',
    })),
    params,
    origem: 'app',
    ip: ipDoCliente(event),
  })

  return { loteId, itens, custoTotal, saldoRestante }
})
