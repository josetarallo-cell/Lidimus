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
export * from './credits.ts'
export { schema }

export function createDb(connectionString: string) {
  // Atrás de PgBouncer em modo transaction, prepared statements quebram —
  // definir DB_DISABLE_PREPARE=true junto com o PgBouncer (ver 20-deploy.md)
  const prepare = process.env.DB_DISABLE_PREPARE === 'true' ? false : true
  const client = postgres(connectionString, { prepare })
  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof createDb>
