import { Queue, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'

// ─── Tipos de payload por fila ────────────────────────────────────────────────

export type MatriculaJobPayload = {
  jobId: string
  fileAccessToken: string
  callbackUrl: string
  fileUrl: string
  params: {
    incluirMemorial?: boolean
    incluirCroqui?: boolean
    geocodificar?: boolean
  }
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
  MATRICULA: 'matricula',
  KML: 'kml',
  INJECTION: 'injection',
} as const

// ─── Factory de conexão Redis ─────────────────────────────────────────────────

export function createRedisConnection(url: string) {
  return new IORedis(url, { maxRetriesPerRequest: null })
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
    matriculaQueue: new Queue<MatriculaJobPayload>(QUEUE_NAMES.MATRICULA, {
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
