import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { jobs, creditTransactions, creditCostFor, lockOrgCreditBalance } from '@lidimus/db'
import { useDb } from './db'
import { useQueues } from './queue'
import { storeJobFile } from './jobFile'
import { checkRateLimit } from './rateLimit'
import { exigirAcesso, avulsosDisponiveis } from './planAccess'
import { countPdfPages } from './pdfPages'
import { assertPdfSignature } from './fileSignature'

// Criação de uma análise de matrícula: validação do arquivo, nível de acesso,
// limite de uso, débito de crédito, guarda do PDF e enfileiramento.
//
// Existe como função porque há dois caminhos de entrada — o painel (sessão em
// cookie) e a API pública (chave de integração) — e a transação que cobra o
// cliente não pode existir em dois lugares. O que difere entre eles é só como se
// descobre a organização e qual limite de uso se aplica; a cobrança é a mesma.
//
// Diferente dos helpers de baixo nível (storeJobFile recebe `db` por parâmetro),
// esta busca as próprias dependências: é orquestração de rota, e assim cada
// handler fica com uma chamada só.

export const paramsMatriculaSchema = z.object({
  incluirMemorial: z.boolean().optional().default(true),
  incluirCroqui: z.boolean().optional().default(false),
  geocodificar: z.boolean().optional().default(true),
})

export type ParamsMatricula = z.infer<typeof paramsMatriculaSchema>

export type OrigemAnalise = 'app' | 'api'

export type NovaAnaliseMatricula = {
  orgId: string
  // Vai para jobs.user_id. Na API é o proprietário que emitiu a chave.
  userId: string
  arquivo: Buffer
  mimeType: string
  originalName: string
  params: ParamsMatricula
  origem: OrigemAnalise
  // Só na origem 'api': permite ao suporte descobrir qual integração gerou o
  // gasto quando a organização tem várias chaves.
  apiKeyId?: string
}

export type AnaliseCriada = {
  jobId: string
  custo: number
  paginas: number
  saldoRestante: number
}

export async function criarAnaliseMatricula(entrada: NovaAnaliseMatricula): Promise<AnaliseCriada> {
  const { orgId, userId, arquivo, mimeType, originalName, params, origem, apiKeyId } = entrada
  const config = useRuntimeConfig()
  const db = useDb()

  assertPdfSignature(arquivo)

  const maxBytes = config.maxUploadSizeMb * 1024 * 1024
  if (arquivo.length > maxBytes) {
    throw createError({
      statusCode: 413,
      statusMessage: `Arquivo excede o limite de ${config.maxUploadSizeMb}MB.`,
    })
  }

  // Nível de acesso antes de qualquer trabalho: a matrícula começa no Essencial,
  // e fora dele só roda com análise avulsa comprada. Vale igual para a API — a
  // chave não passa por cima do entitlement de ferramenta.
  const acesso = await exigirAcesso(db, orgId, 'matricula')

  const { connection, matriculaOcrQueue } = useQueues()
  await aplicarLimiteDeUso(connection, config, orgId, origem, apiKeyId)

  // Custo proporcional ao nº de páginas — o custo real de tokens escala com o
  // tamanho do documento. A contagem no upload é best-effort (ver countPdfPages).
  const paginas = countPdfPages(arquivo)
  const custo = creditCostFor('matricula', { pages: paginas })

  const { job, saldoRestante } = await db.transaction(async (tx) => {
    // Saldo checado e debitado na mesma transação, com lock de linha na org —
    // evita que uploads concorrentes leiam o mesmo saldo e furem o limite.
    const saldo = await lockOrgCreditBalance(tx, orgId)
    if (saldo < custo) {
      throw createError({
        statusCode: 402,
        statusMessage: `Créditos insuficientes. Saldo: ${saldo}, necessário: ${custo} (${paginas} página${paginas === 1 ? '' : 's'}).`,
      })
    }

    // Revalidação do avulso sob o mesmo lock: dois uploads simultâneos com uma
    // única análise avulsa comprada não podem passar os dois.
    if (acesso.via === 'avulso' && (await avulsosDisponiveis(tx, orgId)) < 1) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Suas análises avulsas já foram usadas. Compre outra ou assine o Essencial.',
      })
    }

    const [created] = await tx
      .insert(jobs)
      .values({
        orgId,
        userId,
        type: 'matricula',
        status: 'pending',
        inputMeta: {
          originalName,
          params,
          paginas,
          // Procedência: separa no histórico o que veio de integração do que foi
          // enviado na tela, e dá ao painel de custos como medir uso da API.
          ...(origem === 'api' && { origem, apiKeyId }),
          // A marca é o que dá baixa no avulso: `avulsosDisponiveis` conta os
          // jobs com esta marca que não falharam.
          ...(acesso.via === 'avulso' && { viaAvulso: true }),
        },
      })
      .returning({ id: jobs.id })

    await tx.insert(creditTransactions).values({
      orgId,
      delta: -custo,
      reason: 'consumption',
      jobId: created.id,
    })

    // O saldo já foi lido sob o lock — devolver o resultado do débito não custa
    // consulta nenhuma, e a API responde o consumo na mesma chamada.
    return { job: created, saldoRestante: saldo - custo }
  })

  const { fileUrl, accessToken } = await storeJobFile(
    db,
    job.id,
    arquivo,
    mimeType,
    originalName,
    config.publicBaseUrl,
  )

  await matriculaOcrQueue.add('process', {
    jobId: job.id,
    fileAccessToken: accessToken,
    callbackUrl: `${config.publicBaseUrl}/api/webhooks/n8n-callback`,
    fileUrl,
    params,
  })

  await db.update(jobs).set({ status: 'queued' }).where(eq(jobs.id, job.id))

  return { jobId: job.id, custo, paginas, saldoRestante }
}

// Limite de uso por origem. A API tem teto próprio porque integração de lote
// legitimamente submete mais que gente clicando — e um contador extra por chave
// isola o culpado: quando a chave está compartilhada, o script descontrolado de
// um integrante não derruba a integração dos outros.
async function aplicarLimiteDeUso(
  connection: Parameters<typeof checkRateLimit>[0],
  config: { uploadRateLimitPerHour: number; apiRateLimitPerHour: number },
  orgId: string,
  origem: OrigemAnalise,
  apiKeyId?: string,
) {
  if (origem === 'app') {
    await checkRateLimit(connection, `ratelimit:upload:${orgId}`, config.uploadRateLimitPerHour, 3600)
    return
  }

  await checkRateLimit(
    connection,
    `ratelimit:api:${orgId}`,
    config.apiRateLimitPerHour,
    3600,
    'Limite de análises por hora da organização atingido. Aguarde para enviar mais.',
  )

  if (apiKeyId) {
    await checkRateLimit(
      connection,
      `ratelimit:api-key:${apiKeyId}`,
      config.apiRateLimitPerHour,
      3600,
      'Limite de análises por hora desta chave atingido. Aguarde para enviar mais.',
    )
  }
}
