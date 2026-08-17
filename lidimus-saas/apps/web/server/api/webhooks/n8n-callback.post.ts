import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { useDb } from '../../lib/db'
import { useQueues } from '../../lib/queue'
import { softDeleteJobFile } from '../../lib/jobFile'
import { candidatosParaRevisao } from '../../lib/revisaoDaLeitura'
import { jobs, refundJobCredits } from '@lidimus/db'
import { publishJobEvent } from '../../lib/jobEvents'
import { createHmac, timingSafeEqual } from 'crypto'

// Índice compacto dos tokens do OCR, com caixa e confiança por palavra. Vem
// fora de `result` de propósito: `result` é gravado inteiro em `stage_data`, e
// este índice não é para guardar — ele existe só o tempo de levantar os trechos
// que valem conferência humana e morre no fim desta requisição.
const tokensSchema = z
  .array(
    z.object({
      p: z.number().int().positive(),
      b: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      c: z.number(),
      s: z.number().int().nonnegative(),
      e: z.number().int().nonnegative(),
    }),
  )
  .max(30000)
  .optional()

const bodySchema = z.object({
  jobId: z.string().uuid(),
  stage: z.enum(['ocr', 'revisao', 'juridico', 'doc', 'croqui']).optional(),
  result: z.record(z.unknown()).optional(),
  tokens: tokensSchema,
  error: z.string().optional(),
  // Uso real dos modelos, se o workflow do n8n reportar. Serve para medir a
  // margem real (créditos cobrados vs. custo de tokens) e alimentar o painel de
  // custos do admin. Aceita a forma "flat" (1 modelo) ou `models[]` (vários por
  // etapa, ex.: Jurídico usa Sonnet + Mistral). Não afeta a cobrança.
  usage: z
    .object({
      // forma flat — retrocompatível com o que o lidimus-Juridico já emite
      model: z.string().optional(),
      workflow: z.string().optional(),
      promptTokens: z.number().optional(),
      completionTokens: z.number().optional(),
      totalTokens: z.number().optional(),
      costUsd: z.number().optional(),
      // forma multi-modelo
      models: z
        .array(
          z
            .object({
              model: z.string(),
              workflow: z.string().optional(),
              promptTokens: z.number().optional(),
              completionTokens: z.number().optional(),
              totalTokens: z.number().optional(),
              costUsd: z.number().optional(),
              // p/ modelos cobrados por unidade e não por token (ex.: OCR por página)
              units: z.number().optional(),
              unitLabel: z.string().optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough()
    .optional(),
})

type UsageEntry = {
  model: string
  workflow?: string
  stage?: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
  units?: number
  unitLabel?: string
}

// Normaliza o `usage` recebido em uma lista de entradas por modelo.
function toUsageEntries(incoming: Record<string, unknown>, stage: string | undefined): UsageEntry[] {
  const raw = Array.isArray(incoming.models)
    ? (incoming.models as Record<string, unknown>[])
    : incoming.model
      ? [incoming]
      : []
  return raw
    .filter((e) => e && typeof e.model === 'string')
    .map((e) => ({
      model: String(e.model),
      workflow: typeof e.workflow === 'string' ? e.workflow : undefined,
      stage,
      promptTokens: Number(e.promptTokens) || 0,
      completionTokens: Number(e.completionTokens) || 0,
      totalTokens:
        Number(e.totalTokens) || (Number(e.promptTokens) || 0) + (Number(e.completionTokens) || 0),
      costUsd: Number(e.costUsd) || 0,
      ...(e.units != null ? { units: Number(e.units) || 0 } : {}),
      ...(typeof e.unitLabel === 'string' ? { unitLabel: e.unitLabel } : {}),
    }))
}

// Acumula o uso reportado em job.result.usage.entries (uma entrada por modelo),
// somando tokens/custo entre etapas. O painel de custos do admin agrega essas
// entradas por modelo. Não afeta a cobrança — é telemetria de margem.
function mergeUsage(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | undefined,
  stage: string | undefined,
): Record<string, unknown> | undefined {
  if (!incoming) return existing ?? undefined
  const prev = (existing ?? {}) as Record<string, unknown>
  const prevEntries = Array.isArray(prev.entries) ? (prev.entries as UsageEntry[]) : []
  const entries = [...prevEntries, ...toUsageEntries(incoming, stage)]
  const totalTokens = entries.reduce((s, e) => s + (Number(e.totalTokens) || 0), 0)
  const costUsd = Number(entries.reduce((s, e) => s + (Number(e.costUsd) || 0), 0).toFixed(6))
  return { entries, totalTokens, costUsd }
}

function verifyHmac(secret: string, body: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const expectedFull = `sha256=${expected}`
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedFull))
  } catch {
    return false
  }
}

function verifyStaticSecret(secret: string, provided: string): boolean {
  if (secret.length !== provided.length) return false
  try {
    return timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
  } catch {
    return false
  }
}

// Extração de texto de PDF às vezes traz NUL (\u0000), que o JSONB/text do
// Postgres rejeita (22P05) — sem isso o UPDATE quebra e o job fica preso
function stripNullChars<T>(value: T): T {
  if (typeof value === 'string') return value.replaceAll('\u0000', '') as T
  if (Array.isArray(value)) return value.map(stripNullChars) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, stripNullChars(v)]),
    ) as T
  }
  return value
}

// Estados em que um job ainda aceita callback do n8n. Uma vez terminal
// (done/error — seja por resultado final ou por expiração no watchdog), novas
// transições são ignoradas: sem essa guarda, um callback atrasado ou reenviado
// (replay) pode reverter um job já expirado/estornado para 'done', deixando o
// usuário com o estorno *e* o resultado.
const ACTIVE_STATUSES = ['pending', 'queued', 'processing'] as const

// Atualiza o job só se ele ainda estiver em um estado ativo. Retorna `false`
// (sem lançar) quando o callback chegou tarde demais — o chamador decide se
// isso é motivo de log, mas nunca deve prosseguir com efeitos colaterais
// (estorno, enfileiramento da próxima etapa, notificação) para um job morto.
async function transitionActiveJob(
  db: Db,
  jobId: string,
  values: Partial<typeof jobs.$inferInsert>,
): Promise<boolean> {
  const updated = await db
    .update(jobs)
    .set(values)
    .where(and(eq(jobs.id, jobId), inArray(jobs.status, ACTIVE_STATUSES)))
    .returning({ id: jobs.id })
  return updated.length > 0
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const rawBody = await readRawBody(event)
  if (!rawBody) throw createError({ statusCode: 400 })

  // Aceita tanto X-Lidimus-Signature (HMAC sha256) quanto X-Lidimus-Secret (secret estático)
  // Os workflows n8n enviam X-Lidimus-Secret com o callbackSecret passado pelo worker
  const hmacSig = getHeader(event, 'x-lidimus-signature')
  const staticSecret = getHeader(event, 'x-lidimus-secret')

  const authenticated =
    (hmacSig && verifyHmac(config.n8nCallbackSecret, rawBody, hmacSig)) ||
    (staticSecret && verifyStaticSecret(config.n8nCallbackSecret, staticSecret))

  if (!authenticated) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  const body = stripNullChars(bodySchema.parse(JSON.parse(rawBody)))
  const db = useDb()

  const [job] = await db.select().from(jobs).where(eq(jobs.id, body.jobId)).limit(1)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  if (body.error) {
    const applied = await transitionActiveJob(db, body.jobId, {
      status: 'error',
      errorMessage: body.stage ? `[${body.stage}] ${body.error}` : body.error,
      completedAt: new Date(),
    })
    if (!applied) {
      console.warn(`[n8n-callback] ignorado: job ${body.jobId} já não estava ativo`)
      return { ok: true }
    }
    await refundJobCredits(db, body.jobId)
    await publishJobEvent(useQueues().connection, body.jobId)
    return { ok: true }
  }

  // ─── Pipeline de matrícula: orquestração por etapa ──────────────────────────
  if (job.type === 'matricula' && body.stage) {
    const result = body.result ?? {}
    // Uso acumulado entre etapas fica em stageData._usage (persistente); é dobrado
    // em result.usage na etapa final. Só grava a chave quando há uso reportado.
    const priorUsage = (job.stageData as Record<string, unknown> | undefined)?._usage as
      | Record<string, unknown>
      | undefined
    const usage = mergeUsage(priorUsage, body.usage, body.stage)
    const stageData = {
      ...(job.stageData ?? {}),
      [body.stage]: result,
      ...(usage ? { _usage: usage } : {}),
    }
    const callbackUrl = `${config.publicBaseUrl}/api/webhooks/n8n-callback`
    const params = ((job.inputMeta as Record<string, unknown>)?.params ?? {}) as Record<string, unknown>

    if (body.stage === 'ocr') {
      const textoOcr = String(result.texto_ocr ?? '')
      if (!textoOcr.trim()) {
        await softDeleteJobFile(db, body.jobId)
        const applied = await transitionActiveJob(db, body.jobId, {
          status: 'error',
          stageData,
          errorMessage: '[ocr] Erro de leitura do sistema: nenhum texto foi extraído do documento.',
          completedAt: new Date(),
        })
        if (!applied) {
          console.warn(`[n8n-callback] ignorado: job ${body.jobId} já não estava ativo`)
          return { ok: true }
        }
        await refundJobCredits(db, body.jobId)
        await publishJobEvent(useQueues().connection, body.jobId)
        return { ok: true }
      }

      // Corretor de leitura: os trechos que valem conferência humana são
      // levantados aqui, onde o índice de tokens chega. Quando há algum, o job
      // desvia para a etapa de revisão — e o PDF sobrevive mais alguns segundos,
      // até o worker recortar dele as imagens e apagá-lo.
      const candidatos = candidatosParaRevisao({
        textoOcr,
        tokens: body.tokens,
        inputMeta: job.inputMeta as Record<string, unknown> | null,
      })

      if (candidatos.length > 0) {
        const desviado = await transitionActiveJob(db, body.jobId, {
          stageData,
          status: 'queued',
          stage: 'revisao',
        })
        if (!desviado) {
          console.warn(`[n8n-callback] ignorado: job ${body.jobId} já não estava ativo`)
          return { ok: true }
        }

        const { matriculaRevisaoQueue } = useQueues()
        await matriculaRevisaoQueue.add('process', { jobId: body.jobId, candidatos })
        await publishJobEvent(useQueues().connection, body.jobId)
        return { ok: true }
      }

      // Sem nada a conferir, o binário já não serve para mais nada
      await softDeleteJobFile(db, body.jobId)

      const applied = await transitionActiveJob(db, body.jobId, {
        stageData,
        status: 'queued',
        stage: 'juridico',
      })
      if (!applied) {
        console.warn(`[n8n-callback] ignorado: job ${body.jobId} já não estava ativo`)
        return { ok: true }
      }

      const { matriculaJuridicoQueue } = useQueues()
      await matriculaJuridicoQueue.add('process', {
        jobId: body.jobId,
        callbackUrl,
        textoOcr,
        totalPaginas: typeof result.total_paginas === 'number' ? result.total_paginas : undefined,
        params,
      })
      await publishJobEvent(useQueues().connection, body.jobId)
      return { ok: true }
    }

    if (body.stage === 'juridico') {
      const applied = await transitionActiveJob(db, body.jobId, {
        stageData,
        status: 'queued',
        stage: 'doc',
      })
      if (!applied) {
        console.warn(`[n8n-callback] ignorado: job ${body.jobId} já não estava ativo`)
        return { ok: true }
      }

      const ocr = stageData.ocr as Record<string, unknown> | undefined

      const { matriculaDocQueue } = useQueues()
      await matriculaDocQueue.add('process', {
        jobId: body.jobId,
        callbackUrl,
        dadosConsolidados: {
          ...result,
          total_paginas: ocr?.total_paginas ?? null,
          // O jurídico devolve só campos já extraídos; a montagem do documento
          // precisa do texto para detectar a data em que o cartório expediu a
          // certidão (fica no cabeçalho do laudo).
          texto_ocr: ocr?.texto_ocr ?? null,
          params,
        },
      })
      await publishJobEvent(useQueues().connection, body.jobId)
      return { ok: true }
    }

    // stage === 'doc' — etapa final
    const appliedDoc = await transitionActiveJob(db, body.jobId, {
      stageData,
      status: 'done',
      stage: 'doc',
      result: usage ? { ...result, usage } : result,
      completedAt: new Date(),
    })
    if (!appliedDoc) {
      console.warn(`[n8n-callback] ignorado: job ${body.jobId} já não estava ativo`)
      return { ok: true }
    }
    await publishJobEvent(useQueues().connection, body.jobId)
    return { ok: true }
  }

  // ─── Pipeline de croqui: ocr (só no upload avulso) → croqui ─────────────────
  if (job.type === 'croqui' && body.stage) {
    const result = body.result ?? {}
    const priorUsage = (job.stageData as Record<string, unknown> | undefined)?._usage as
      | Record<string, unknown>
      | undefined
    const usage = mergeUsage(priorUsage, body.usage, body.stage)
    const stageData = {
      ...(job.stageData ?? {}),
      [body.stage]: result,
      ...(usage ? { _usage: usage } : {}),
    }
    const callbackUrl = `${config.publicBaseUrl}/api/webhooks/n8n-callback`

    if (body.stage === 'ocr') {
      // O PDF já foi lido — o binário não é mais necessário na extração
      await softDeleteJobFile(db, body.jobId)

      const textoOcr = String(result.texto_ocr ?? '')
      if (!textoOcr.trim()) {
        const applied = await transitionActiveJob(db, body.jobId, {
          status: 'error',
          stageData,
          errorMessage: '[ocr] Erro de leitura do sistema: nenhum texto foi extraído do documento.',
          completedAt: new Date(),
        })
        if (!applied) {
          console.warn(`[n8n-callback] ignorado: job ${body.jobId} já não estava ativo`)
          return { ok: true }
        }
        await refundJobCredits(db, body.jobId)
        await publishJobEvent(useQueues().connection, body.jobId)
        return { ok: true }
      }

      const applied = await transitionActiveJob(db, body.jobId, {
        stageData,
        status: 'queued',
        stage: 'croqui',
      })
      if (!applied) {
        console.warn(`[n8n-callback] ignorado: job ${body.jobId} já não estava ativo`)
        return { ok: true }
      }

      const { croquiQueue } = useQueues()
      await croquiQueue.add('process', {
        jobId: body.jobId,
        callbackUrl,
        textoOcr,
        totalPaginas: typeof result.total_paginas === 'number' ? result.total_paginas : undefined,
        params: {},
      })
      await publishJobEvent(useQueues().connection, body.jobId)
      return { ok: true }
    }

    // stage === 'croqui' — etapa final: o resultado é o JSON estruturado da
    // extração; o desenho em SVG é gerado no app (@lidimus/croqui), sem LLM
    const appliedCroqui = await transitionActiveJob(db, body.jobId, {
      stageData,
      status: 'done',
      stage: 'croqui',
      result: usage ? { ...result, usage } : result,
      completedAt: new Date(),
    })
    if (!appliedCroqui) {
      console.warn(`[n8n-callback] ignorado: job ${body.jobId} já não estava ativo`)
      return { ok: true }
    }
    await publishJobEvent(useQueues().connection, body.jobId)
    return { ok: true }
  }

  // ─── Jobs de etapa única (kml, injection) ────────────────────────────────────
  const singleResult = body.result ?? {}
  const singleUsage = mergeUsage(
    (job.result as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined,
    body.usage,
    body.stage,
  )
  const appliedSingle = await transitionActiveJob(db, body.jobId, {
    status: 'done',
    result: singleUsage ? { ...singleResult, usage: singleUsage } : singleResult,
    completedAt: new Date(),
  })
  if (!appliedSingle) {
    console.warn(`[n8n-callback] ignorado: job ${body.jobId} já não estava ativo`)
    return { ok: true }
  }

  await softDeleteJobFile(db, body.jobId)

  await publishJobEvent(useQueues().connection, body.jobId)
  return { ok: true }
})
