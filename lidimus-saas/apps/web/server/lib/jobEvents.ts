import type { Redis } from 'ioredis'

// Canal Redis por job — o payload não importa (o assinante relê o job no banco),
// só o sinal de "algo mudou". Publicado a cada transição de status no callback.
export function jobEventsChannel(jobId: string): string {
  return `job-events:${jobId}`
}

export async function publishJobEvent(redis: Redis, jobId: string): Promise<void> {
  try {
    await redis.publish(jobEventsChannel(jobId), '1')
  } catch {
    // push é otimização — o fallback de polling/reconsulta cobre falha aqui
  }
}
