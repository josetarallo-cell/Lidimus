import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { jobs, orgMembers } from '@lidimus/db'
import { aplicarCorrecoes, semRecortes } from '@lidimus/revisao'
import type { Candidato } from '@lidimus/revisao'
import { useDb } from '../../../lib/db'
import { useQueues } from '../../../lib/queue'
import { requireAuth } from '../../../lib/requireAuth'
import { getJobForUser } from '../../../lib/getJobForUser'
import { publishJobEvent } from '../../../lib/jobEvents'

// Fim da etapa de revisão pelo caminho do usuário: as correções entram no texto
// e a análise jurídica sai com o texto corrigido.
//
//   OCR  →  CORRETOR  →  Jurídico
//
// O outro caminho (prazo estourado, recorte indisponível) fica no worker, em
// lib/seguirParaJuridico.ts. Os dois disputam a mesma transição condicional a
// partir de `awaiting_review`, e só um ganha.

const bodySchema = z.object({
  correcoes: z
    .array(
      z.object({
        id: z.string().max(16),
        texto: z.string().max(500),
        // "Não é texto": o trecho sai do documento em vez de ser corrigido —
        // rubrica e carimbo que o OCR transcreveu como se fossem palavras.
        descartar: z.boolean().optional(),
      }),
    )
    .max(32)
    .default([]),
})

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()
  const config = useRuntimeConfig()

  const jobId = getRouterParam(event, 'id')
  if (!jobId) throw createError({ statusCode: 400 })

  const { correcoes } = bodySchema.parse(await readBody(event))

  const job = await getJobForUser(db, jobId, user.id)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  // Quem só lê não altera o texto que vai virar o relatório da organização.
  const [vinculo] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, job.orgId), eq(orgMembers.userId, user.id)))
    .limit(1)
  if (vinculo?.role === 'reader') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Seu acesso é somente de leitura e não permite corrigir a análise.',
    })
  }

  if (job.status !== 'awaiting_review') {
    // Acontece de verdade: o prazo estoura enquanto a pessoa digita, ou ela
    // envia duas vezes. Não é erro dela, e a análise já está a caminho.
    throw createError({
      statusCode: 409,
      statusMessage: 'Esta análise já seguiu adiante e não aceita mais correções.',
    })
  }

  // A partir daqui é a linha CRUA do banco, não a que `getJobForUser` devolveu.
  //
  // `getJobForUser` passa o job por `limparTelemetria` antes de entregá-lo — é o
  // que impede o custo em dólar e o nome dos modelos de vazarem para o cliente.
  // Ótimo para ler, ruinoso para escrever: montar o novo `stage_data` em cima do
  // objeto limpo e gravá-lo de volta apagaria o `_usage` acumulado nas etapas
  // anteriores, e o painel de custos perderia toda análise que passasse pelo
  // corretor. O mesmo filtro também poda strings curtas que citem fornecedor, o
  // que corromperia o `textoLido` de um trecho vindo de uma "Gemini
  // Incorporadora" da vida — e sem ele a correção não acha onde encaixar.
  //
  // A checagem de acesso continua sendo a de cima; esta consulta é só pelo dado
  // íntegro do job que já foi autorizado.
  const [bruto] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)
  if (!bruto) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  const stageData = (bruto.stageData ?? {}) as Record<string, unknown>
  const ocr = (stageData.ocr ?? {}) as Record<string, unknown>
  const revisao = (stageData.revisao ?? {}) as Record<string, unknown>
  const candidatos = Array.isArray(revisao.candidatos) ? (revisao.candidatos as Candidato[]) : []
  const textoOcr = String(ocr.texto_ocr ?? '')

  if (!textoOcr.trim() || candidatos.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'Esta análise não tem revisão pendente.' })
  }

  const resultado = aplicarCorrecoes(textoOcr, candidatos, correcoes)

  const novoStageData = {
    ...stageData,
    // O texto que segue para a análise é o corrigido; o original fica ao lado,
    // porque é ele que prova o que o documento trazia antes de qualquer emenda.
    ocr: { ...ocr, texto_ocr: resultado.texto, texto_ocr_original: textoOcr },
    revisao: {
      ...revisao,
      // As imagens saem do banco assim que deixam de ter uso — ver semRecortes
      candidatos: semRecortes(candidatos),
      correcoes: resultado.aplicadas,
      descartadas: resultado.descartadas,
      desfecho: 'revisada',
      encerradaEm: new Date().toISOString(),
    },
  }

  // Condicional: se o watchdog expirou a revisão neste exato intervalo, ele já
  // enfileirou a análise e esta requisição não pode enfileirar outra.
  const aplicado = await db
    .update(jobs)
    .set({ status: 'queued', stage: 'juridico', stageData: novoStageData })
    .where(and(eq(jobs.id, jobId), inArray(jobs.status, ['awaiting_review'])))
    .returning({ id: jobs.id })

  if (aplicado.length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Esta análise já seguiu adiante e não aceita mais correções.',
    })
  }

  const { matriculaJuridicoQueue, connection } = useQueues()
  await matriculaJuridicoQueue.add('process', {
    jobId,
    callbackUrl: `${config.publicBaseUrl}/api/webhooks/n8n-callback`,
    textoOcr: resultado.texto,
    totalPaginas: typeof ocr.total_paginas === 'number' ? ocr.total_paginas : undefined,
    params: ((bruto.inputMeta as Record<string, unknown>)?.params ?? {}) as never,
  })
  await publishJobEvent(connection, jobId)

  return {
    ok: true,
    aplicadas: resultado.aplicadas.length,
    descartadas: resultado.descartadas.length,
  }
})
