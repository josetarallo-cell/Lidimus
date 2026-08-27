import { randomUUID } from 'crypto'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { jobs, creditTransactions, creditCostFor, lockOrgCreditBalance, refundJobCredits } from '@lidimus/db'
import { useDb } from './db'
import { useQueues } from './queue'
import { storeJobFile } from './jobFile'
import { checkRateLimit, vagasRestantes } from './rateLimit'
import { exigirAcesso, avulsosDisponiveis, cortesiasDisponiveis } from './planAccess'
import { countPdfPages } from './pdfPages'
import { assertPdfSignature } from './fileSignature'
import { analisarPdf } from '@lidimus/autenticidade'

// Criação de análises de matrícula: validação dos arquivos, nível de acesso,
// limite de uso, débito de crédito, guarda dos PDFs e enfileiramento.
//
// Existe como função porque há três caminhos de entrada — o painel (envio
// unitário e envio em lote) e a API pública (chave de integração) — e a transação
// que cobra o cliente não pode existir em três lugares. O que difere entre eles é
// só como se descobre a organização e qual limite de uso se aplica; a cobrança é
// a mesma. Por isso o envio unitário é literalmente um lote de um: um caminho de
// cobrança, não dois.
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

export type ArquivoMatricula = {
  arquivo: Buffer
  mimeType: string
  originalName: string
}

export type NovaAnaliseMatricula = ArquivoMatricula & {
  orgId: string
  // Vai para jobs.user_id. Na API é o proprietário que emitiu a chave.
  userId: string
  params: ParamsMatricula
  origem: OrigemAnalise
  // IP de quem está enviando. Só a análise de cortesia o usa, como teto contra
  // cadastros em série; obrigatório mesmo assim, para que nenhum caminho novo
  // de entrada chegue aqui sem ele e ganhe cortesia sem teto.
  ip: string
  // Só na origem 'api': permite ao suporte descobrir qual integração gerou o
  // gasto quando a organização tem várias chaves.
  apiKeyId?: string
}

export type NovoLoteMatricula = {
  orgId: string
  userId: string
  arquivos: ArquivoMatricula[]
  params: ParamsMatricula
  origem: OrigemAnalise
  ip: string
  apiKeyId?: string
}

export type AnaliseCriada = {
  jobId: string
  custo: number
  paginas: number
  saldoRestante: number
}

export type ItemDoLote = {
  jobId: string
  originalName: string
  paginas: number
  custo: number
}

export type LoteCriado = {
  // Nulo no envio unitário: sem loteId, o `inputMeta` de quem manda um arquivo só
  // continua exatamente como sempre foi.
  loteId: string | null
  itens: ItemDoLote[]
  custoTotal: number
  saldoRestante: number
}

export async function criarAnaliseMatricula(entrada: NovaAnaliseMatricula): Promise<AnaliseCriada> {
  const { arquivo, mimeType, originalName, ...resto } = entrada

  const lote = await criarAnalisesMatriculaEmLote({
    ...resto,
    arquivos: [{ arquivo, mimeType, originalName }],
  })

  const [item] = lote.itens
  return {
    jobId: item.jobId,
    custo: item.custo,
    paginas: item.paginas,
    saldoRestante: lote.saldoRestante,
  }
}

export async function criarAnalisesMatriculaEmLote(
  entrada: NovoLoteMatricula,
): Promise<LoteCriado> {
  const { orgId, userId, arquivos, params, origem, ip, apiKeyId } = entrada
  const config = useRuntimeConfig()
  const db = useDb()

  if (arquivos.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Nenhum arquivo enviado.' })
  }

  // Todos os arquivos passam pela validação antes de qualquer cobrança: num lote,
  // descobrir no sétimo PDF que ele não é PDF depois de ter debitado os seis
  // primeiros deixaria o cliente pagando por um envio que ele vai refazer inteiro.
  const invalidos = arquivos
    .map((a) => ({ nome: a.originalName, recusa: motivoDeRecusa(a.arquivo, config.maxUploadSizeMb) }))
    .filter((r): r is { nome: string; recusa: Recusa } => r.recusa !== null)

  if (invalidos.length > 0) {
    // No envio unitário o erro sai exatamente como sempre saiu (415 para arquivo
    // que não é PDF, 413 para arquivo grande demais) — a v1 documenta esses
    // status e a tela os traduz por eles.
    if (arquivos.length === 1) {
      throw createError({
        statusCode: invalidos[0].recusa.status,
        statusMessage: invalidos[0].recusa.mensagem,
      })
    }

    // 415 e não 400: na API pública o 400 significa `requisicao_invalida` (lote
    // grande demais, `params` malformado) e o 415, `arquivo_invalido`. Quem
    // integra precisa distinguir "mandei o parâmetro errado" de "mandei o arquivo
    // errado" — são correções diferentes, em lugares diferentes do código dele.
    // A mensagem carrega o porquê de cada arquivo, inclusive os grandes demais.
    const lista = invalidos.map((r) => `${r.nome} (${r.recusa.motivo})`).join('; ')
    throw createError({
      statusCode: 415,
      statusMessage: `Nenhuma análise foi criada — corrija e reenvie. Recusados: ${lista}.`,
    })
  }

  // Nível de acesso antes de qualquer trabalho: a matrícula começa no Essencial,
  // e fora dele só roda com análise avulsa comprada ou com a análise de
  // cortesia. Vale igual para a API — a chave não passa por cima do entitlement
  // de ferramenta.
  const acesso = await exigirAcesso(db, orgId, 'matricula', ip)
  const porCortesia = acesso.via === 'cortesia'

  // A cortesia é uma análise, não um saldo: não há como partir meia cortesia
  // entre cinco arquivos. Recusar aqui, antes de medir e enfileirar, deixa a
  // conta com a cortesia intacta para o envio seguinte.
  if (porCortesia && arquivos.length > 1) {
    throw createError({
      statusCode: 403,
      statusMessage:
        `Sua análise de cortesia cobre um documento, e este envio tem ${arquivos.length}. ` +
        'Envie um por vez, assine o Essencial ou compre análises avulsas.',
    })
  }

  const { connection, matriculaOcrQueue } = useQueues()
  await aplicarLimiteDeUso(connection, config, orgId, origem, arquivos.length, apiKeyId)

  // Custo proporcional ao nº de páginas — o custo real de tokens escala com o
  // tamanho do documento. A contagem no upload é best-effort (ver countPdfPages).
  //
  // Na cortesia o custo é zero, e não um débito coberto por um bônus equivalente:
  // assim o tamanho do PDF não entra na conta em lugar nenhum, e a análise que
  // falha não gera estorno — o que ela devolve é a própria cortesia, porque job
  // com erro não conta em cortesiasDisponiveis.
  const medidos = arquivos.map((a) => {
    const paginas = countPdfPages(a.arquivo)
    // Perícia barata do buffer (§1 do verificador de autenticidade) — nunca
    // bloqueia o upload, só documenta. Falha aqui não pode derrubar a análise
    // que o cliente pagou por isso: um erro do parser vira "sem perícia",
    // não um 500 no upload.
    let autenticidade: ReturnType<typeof analisarPdf> | null = null
    try {
      autenticidade = analisarPdf(a.arquivo, { paginasConhecidas: paginas })
    } catch (err) {
      console.warn('[matricula] perícia de autenticidade falhou no upload:', err)
    }
    return {
      ...a,
      paginas,
      autenticidade,
      custo: porCortesia ? 0 : creditCostFor('matricula', { pages: paginas }),
    }
  })
  const custoTotal = medidos.reduce((soma, m) => soma + m.custo, 0)

  // Um loteId só existe quando há lote de fato — ver o comentário em LoteCriado.
  const loteId = medidos.length > 1 ? randomUUID() : null

  const { criados, saldoRestante } = await db.transaction(async (tx) => {
    // Saldo checado e debitado na mesma transação, com lock de linha na org —
    // evita que uploads concorrentes leiam o mesmo saldo e furem o limite. No
    // lote a checagem é sobre o total: tudo ou nada, sem meio lote pago.
    const saldo = await lockOrgCreditBalance(tx, orgId)
    if (saldo < custoTotal) {
      const paginasTotal = medidos.reduce((s, m) => s + m.paginas, 0)
      throw createError({
        statusCode: 402,
        statusMessage:
          medidos.length === 1
            ? `Créditos insuficientes. Saldo: ${saldo}, necessário: ${custoTotal} (${paginasTotal} página${paginasTotal === 1 ? '' : 's'}).`
            : `Créditos insuficientes para o lote. Saldo: ${saldo}, necessário: ${custoTotal} (${medidos.length} arquivos, ${paginasTotal} páginas). Nada foi cobrado.`,
      })
    }

    // Revalidação do avulso sob o mesmo lock: dois uploads simultâneos com uma
    // única análise avulsa comprada não podem passar os dois. No lote, o avulso
    // precisa cobrir um por arquivo.
    if (acesso.via === 'avulso') {
      const disponiveis = await avulsosDisponiveis(tx, orgId)
      if (disponiveis < medidos.length) {
        throw createError({
          statusCode: 403,
          statusMessage:
            medidos.length === 1
              ? 'Suas análises avulsas já foram usadas. Compre outra ou assine o Essencial.'
              : `Você tem ${disponiveis} análise${disponiveis === 1 ? '' : 's'} avulsa${disponiveis === 1 ? '' : 's'} e o lote tem ${medidos.length} arquivos. Assine o Essencial ou envie menos arquivos.`,
        })
      }
    }

    // Mesma revalidação para a cortesia, pela mesma razão: sem ela, dois envios
    // simultâneos leriam "1 disponível" antes de qualquer job existir e as duas
    // análises sairiam de graça. O lock da organização serializa os dois.
    if (porCortesia && (await cortesiasDisponiveis(tx, orgId, ip)) < 1) {
      throw createError({
        statusCode: 403,
        statusMessage:
          'Sua análise de cortesia já foi usada. Assine o Essencial ou compre uma análise avulsa.',
      })
    }

    const inseridos = await tx
      .insert(jobs)
      .values(
        medidos.map((m) => ({
          orgId,
          userId,
          type: 'matricula' as const,
          status: 'pending' as const,
          inputMeta: {
            originalName: m.originalName,
            params,
            paginas: m.paginas,
            // Perícia do arquivo feita no upload (§1) — o worker completa com QR
            // e páginas heterogêneas antes do binário sair do GCS; o callback
            // funde tudo com as âncoras do OCR e a ONR. Nunca bloqueia o upload:
            // `autenticidade` é null quando o parser falhou.
            ...(m.autenticidade && { autenticidade: m.autenticidade }),
            // Procedência: separa no histórico o que veio de integração do que foi
            // enviado na tela, e dá ao painel de custos como medir uso da API.
            ...(origem === 'api' && { origem, apiKeyId }),
            // A marca é o que dá baixa no avulso: `avulsosDisponiveis` conta os
            // jobs com esta marca que não falharam.
            ...(acesso.via === 'avulso' && { viaAvulso: true }),
            // O par equivalente da cortesia. O IP vai junto porque é ele que o
            // teto por endereço conta — guardá-lo no job mantém a contagem e o
            // fato que ela conta no mesmo lugar, sem tabela nova.
            ...(porCortesia && { viaCortesia: true, cortesiaIp: ip }),
            ...(loteId && { loteId }),
          },
        })),
      )
      .returning({ id: jobs.id })

    // A cortesia não passa por aqui: lançamento de zero crédito só sujaria o
    // extrato e faria refundJobCredits gerar um estorno de zero na falha.
    if (custoTotal > 0) {
      await tx.insert(creditTransactions).values(
        // Uma linha por job, e não uma pelo total: é o que mantém o estorno
        // individual de refundJobCredits funcionando quando só um arquivo do lote
        // falha lá na frente.
        inseridos.map((job, i) => ({
          orgId,
          delta: -medidos[i].custo,
          reason: 'consumption' as const,
          jobId: job.id,
        })),
      )
    }

    // O saldo já foi lido sob o lock — devolver o resultado do débito não custa
    // consulta nenhuma, e a API responde o consumo na mesma chamada.
    return { criados: inseridos, saldoRestante: saldo - custoTotal }
  })

  const itens: ItemDoLote[] = []

  for (const [i, job] of criados.entries()) {
    const m = medidos[i]
    itens.push({ jobId: job.id, originalName: m.originalName, paginas: m.paginas, custo: m.custo })

    try {
      const { fileUrl, accessToken } = await storeJobFile(
        db,
        job.id,
        m.arquivo,
        m.mimeType,
        m.originalName,
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
    } catch (err) {
      // O débito já commitou. Falhar aqui em silêncio deixaria o job pago e
      // parado até o watchdog varrer (60 min); estornar na hora devolve o crédito
      // e libera os outros arquivos do lote para seguir.
      console.error(`[matricula] falha ao enfileirar job ${job.id}:`, err)
      await db
        .update(jobs)
        .set({
          status: 'error',
          errorMessage: 'Não foi possível guardar o arquivo para análise.',
          completedAt: new Date(),
        })
        .where(eq(jobs.id, job.id))
      await refundJobCredits(db, job.id)
    }
  }

  return { loteId, itens, custoTotal, saldoRestante }
}

type Recusa = {
  // Status que o envio unitário devolve — preserva o contrato de hoje.
  status: number
  // Frase completa, para quando o arquivo recusado é o único do envio.
  mensagem: string
  // Trecho curto, para compor a lista de recusados de um lote.
  motivo: string
}

// Por que um arquivo não pode entrar, ou null se ele está bom. Devolve dado em
// vez de lançar porque, no lote, a tela precisa listar *todos* os recusados de
// uma vez — corrigir um por envio seria cruel.
function motivoDeRecusa(arquivo: Buffer, maxUploadSizeMb: number): Recusa | null {
  try {
    assertPdfSignature(arquivo)
  } catch {
    return { status: 415, mensagem: 'Arquivo não é um PDF válido.', motivo: 'não é um PDF válido' }
  }

  if (arquivo.length > maxUploadSizeMb * 1024 * 1024) {
    return {
      status: 413,
      mensagem: `Arquivo excede o limite de ${maxUploadSizeMb}MB.`,
      motivo: `excede o limite de ${maxUploadSizeMb}MB`,
    }
  }

  return null
}

// Limite de uso por origem. A API tem teto próprio porque integração de lote
// legitimamente submete mais que gente clicando — e um contador extra por chave
// isola o culpado: quando a chave está compartilhada, o script descontrolado de
// um integrante não derruba a integração dos outros.
//
// `quantidade` é quantas análises esta chamada representa; um lote consome tantos
// tokens quanto tem arquivos, porque é isso que ele custa ao pipeline.
async function aplicarLimiteDeUso(
  connection: Parameters<typeof checkRateLimit>[0],
  config: { uploadRateLimitPerHour: number; apiRateLimitPerHour: number },
  orgId: string,
  origem: OrigemAnalise,
  quantidade: number,
  apiKeyId?: string,
) {
  if (origem === 'app') {
    const chave = `ratelimit:upload:${orgId}`
    const limite = config.uploadRateLimitPerHour

    // A leitura das vagas só acontece no envio em lote, e serve só para a
    // mensagem: "restam 4" é acionável, "muitas análises" não é. No envio
    // unitário nem vale o roundtrip.
    const mensagem =
      quantidade === 1
        ? 'Muitas análises em pouco tempo. Tente novamente em instantes.'
        : `Este lote tem ${quantidade} análises e restam ${await vagasRestantes(
            connection,
            chave,
            limite,
          )} no seu limite desta hora. Envie menos arquivos ou aguarde.`

    await checkRateLimit(connection, chave, limite, 3600, mensagem, quantidade)
    return
  }

  await checkRateLimit(
    connection,
    `ratelimit:api:${orgId}`,
    config.apiRateLimitPerHour,
    3600,
    'Limite de análises por hora da organização atingido. Aguarde para enviar mais.',
    quantidade,
  )

  if (apiKeyId) {
    await checkRateLimit(
      connection,
      `ratelimit:api-key:${apiKeyId}`,
      config.apiRateLimitPerHour,
      3600,
      'Limite de análises por hora desta chave atingido. Aguarde para enviar mais.',
      quantidade,
    )
  }
}
