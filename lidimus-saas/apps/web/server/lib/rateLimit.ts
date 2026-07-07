import type { Redis } from 'ioredis'

// Token bucket simples via INCR/EXPIRE — suficiente para limitar uploads por organização.
export async function checkRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, windowSeconds)
  }
  if (count > limit) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Muitas análises em pouco tempo. Tente novamente em instantes.',
    })
  }
}
