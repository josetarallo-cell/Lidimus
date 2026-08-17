import { Queue, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'
import type { Candidato } from '@lidimus/revisao'

// ─── Tipos de payload por fila ────────────────────────────────────────────────

export type MatriculaParams = {
  incluirMemorial?: boolean
  incluirCroqui?: boolean
  geocodificar?: boolean
}

// Etapa 1: OCR — n8n baixa o PDF via fileUrl e devolve texto_ocr
export type MatriculaOcrJobPayload = {
  jobId: string
  fileAccessToken: string
  callbackUrl: string
  fileUrl: string
  params: MatriculaParams
}

// Etapa 1.5: corretor de leitura — só existe quando o filtro encontrou trechos
// que valem conferência humana. O worker recorta da página a imagem de cada
// trecho, apaga o PDF e deixa o job em `awaiting_review` esperando o usuário.
//
// Os candidatos já vêm prontos (o levantamento roda no callback, onde o índice
// de tokens chega): o que trafega aqui são no máximo oito itens, e não o índice
// inteiro do documento.
export type MatriculaRevisaoJobPayload = {
  jobId: string
  callbackUrl: string
  candidatos: Candidato[]
  textoOcr: string
  totalPaginas?: number
  params: MatriculaParams
}

// Etapa 2: análise jurídica — recebe o texto extraído (sem PDF)
export type MatriculaJuridicoJobPayload = {
  jobId: string
  callbackUrl: string
  textoOcr: string
  totalPaginas?: number
  params: MatriculaParams
}

// Etapa 3: montagem do documento — recebe os dados consolidados das etapas anteriores
export type MatriculaDocJobPayload = {
  jobId: string
  callbackUrl: string
  dadosConsolidados: Record<string, unknown>
}

// Croqui: extração do perímetro pelo n8n (lidimus-croqui) — recebe o texto OCR,
// vindo da etapa de OCR (upload avulso) ou reaproveitado de uma matrícula já lida
export type CroquiJobPayload = {
  jobId: string
  callbackUrl: string
  textoOcr: string
  totalPaginas?: number
  params: Record<string, unknown>
}

export type KmlJobPayload = {
  jobId: string
  fileAccessToken: string
  callbackUrl: string
  fileUrl: string
  params: {
    nomeImovel?: string
    municipio?: string
    estado?: string
    rua?: string
  }
}

export type InjectionJobPayload = {
  jobId: string
  fileAccessToken: string
  callbackUrl: string
  fileUrl: string
  params: Record<string, unknown>
}

// ─── Nomes de filas ───────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  MATRICULA_OCR: 'matricula-ocr',
  MATRICULA_REVISAO: 'matricula-revisao',
  MATRICULA_JURIDICO: 'matricula-juridico',
  MATRICULA_DOC: 'matricula-doc',
  CROQUI: 'croqui',
  KML: 'kml',
  INJECTION: 'injection',
} as const

// ─── Factory de conexão Redis ─────────────────────────────────────────────────

export function createRedisConnection(url: string) {
  return new IORedis(url, { maxRetriesPerRequest: null })
}

// ─── Eventos de job (pub/sub) ─────────────────────────────────────────────────

// Canal Redis por job — o payload não importa (o assinante relê o job no banco),
// só o sinal de "algo mudou". Publicado a cada transição de status.
export function jobEventsChannel(jobId: string): string {
  return `job-events:${jobId}`
}

export async function publishJobEvent(redis: IORedis, jobId: string): Promise<void> {
  try {
    await redis.publish(jobEventsChannel(jobId), '1')
  } catch {
    // push é otimização — o fallback de polling/reconsulta cobre falha aqui
  }
}

// ─── Factory de filas ─────────────────────────────────────────────────────────

export function createQueues(redisUrl: string) {
  const connection = createRedisConnection(redisUrl)

  const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  }

  return {
    connection,
    matriculaOcrQueue: new Queue<MatriculaOcrJobPayload>(QUEUE_NAMES.MATRICULA_OCR, {
      connection,
      defaultJobOptions,
    }),
    matriculaRevisaoQueue: new Queue<MatriculaRevisaoJobPayload>(QUEUE_NAMES.MATRICULA_REVISAO, {
      connection,
      defaultJobOptions,
    }),
    matriculaJuridicoQueue: new Queue<MatriculaJuridicoJobPayload>(QUEUE_NAMES.MATRICULA_JURIDICO, {
      connection,
      defaultJobOptions,
    }),
    matriculaDocQueue: new Queue<MatriculaDocJobPayload>(QUEUE_NAMES.MATRICULA_DOC, {
      connection,
      defaultJobOptions,
    }),
    croquiQueue: new Queue<CroquiJobPayload>(QUEUE_NAMES.CROQUI, {
      connection,
      defaultJobOptions,
    }),
    kmlQueue: new Queue<KmlJobPayload>(QUEUE_NAMES.KML, {
      connection,
      defaultJobOptions,
    }),
    injectionQueue: new Queue<InjectionJobPayload>(QUEUE_NAMES.INJECTION, {
      connection,
      defaultJobOptions,
    }),
  }
}

export type Queues = ReturnType<typeof createQueues>
