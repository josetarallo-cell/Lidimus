import { sql } from 'drizzle-orm'
import { useDb } from '../lib/db'
import { useQueues } from '../lib/queue'

// Endpoint público de healthcheck — usado pelo Docker/orquestrador, não expõe dados sensíveis.
export default defineEventHandler(async (event) => {
  try {
    const db = useDb()
    await db.execute(sql`select 1`)

    const { connection } = useQueues()
    await connection.ping()

    return { status: 'ok' }
  } catch (err) {
    setResponseStatus(event, 503)
    return { status: 'error', message: (err as Error).message }
  }
})
