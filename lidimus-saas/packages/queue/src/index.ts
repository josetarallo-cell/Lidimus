import { Queue, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'

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

export type KmlJobPayload = {
  jobId: string
  fileAccessToken: string
  callbackUrl: string
  fileUrl: string
  params: {
    nomeImovel?: string
    municipio?: string
    estado?: string
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
  MATRICULA_JURIDICO: 'matricula-juridico',
  MATRICULA_DOC: 'matricula-doc',
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
    matriculaJuridicoQueue: new Queue<MatriculaJuridicoJobPayload>(QUEUE_NAMES.MATRICULA_JURIDICO, {
      connection,
      defaultJobOptions,
    }),
    matriculaDocQueue: new Queue<MatriculaDocJobPayload>(QUEUE_NAMES.MATRICULA_DOC, {
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
