import type { Redis } from 'ioredis'

// Checagem e incremento num script Lua — atômico no Redis. Com dois comandos
// separados, um crash do processo entre eles deixa a chave sem TTL (bloqueio
// permanente até intervenção manual); o script elimina essa janela.
//
// Checa *antes* de incrementar (e não INCR seguido de comparação) porque um lote
// recusado não pode consumir os tokens que ele mesmo não chegou a usar: quem
// manda 10 matrículas com 4 vagas restantes leva 429 e continua com as 4.
const CHECAR_E_INCREMENTAR = `
local atual = tonumber(redis.call('GET', KEYS[1]) or '0')
local incremento = tonumber(ARGV[2])
if atual + incremento > tonumber(ARGV[3]) then
  return -1
end
local novo = redis.call('INCRBY', KEYS[1], incremento)
if novo == incremento then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return novo
`

// Token bucket simples via INCRBY/EXPIRE — suficiente para limitar uploads por
// organização. `incremento` é quantas análises esta chamada representa: 1 no
// envio unitário, o tamanho do lote no envio múltiplo.
export async function checkRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
  mensagem = 'Muitas análises em pouco tempo. Tente novamente em instantes.',
  incremento = 1,
): Promise<void> {
  const resultado = (await redis.eval(
    CHECAR_E_INCREMENTAR,
    1,
    key,
    windowSeconds,
    incremento,
    limit,
  )) as number

  if (resultado === -1) {
    throw createError({ statusCode: 429, statusMessage: mensagem })
  }
}

// Quantas análises ainda cabem na janela. Só para compor a mensagem de recusa —
// entre esta leitura e a próxima tentativa o número pode mudar, e não há lock a
// tomar por causa disso.
export async function vagasRestantes(redis: Redis, key: string, limit: number): Promise<number> {
  const atual = Number((await redis.get(key)) ?? 0)
  return Math.max(0, limit - atual)
}
