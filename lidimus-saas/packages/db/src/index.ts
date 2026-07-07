import { setDefaultResultOrder } from 'node:dns'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.ts'

// Node 18+ mudou o default de resolução de DNS para 'verbatim', o que pode causar
// ENOTFOUND intermitente para hostnames internos do Docker Compose (só têm registro A,
// não AAAA). Forçar 'ipv4first' evita essa falha ao conectar em postgres/redis por nome
// de serviço dentro do compose.
setDefaultResultOrder('ipv4first')

export * from './schema.ts'
export { schema }

export function createDb(connectionString: string) {
  const client = postgres(connectionString)
  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof createDb>
