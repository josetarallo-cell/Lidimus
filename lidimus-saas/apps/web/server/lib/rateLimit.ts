import type { Redis } from 'ioredis'

// INCR e EXPIRE num script Lua — atômico no Redis. Com dois comandos separados,
// um crash do processo entre eles deixa a chave sem TTL (bloqueio permanente
// até intervenção manual); o script elimina essa janela.
const INCR_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`

// Token bucket simples via INCR/EXPIRE — suficiente para limitar uploads por organização.
export async function checkRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const count = (await redis.eval(INCR_WITH_TTL, 1, key, windowSeconds)) as number
  if (count > limit) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Muitas análises em pouco tempo. Tente novamente em instantes.',
    })
  }
}
