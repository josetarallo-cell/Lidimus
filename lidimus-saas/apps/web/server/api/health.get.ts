import { sql } from 'drizzle-orm'
import { useDb } from '../lib/db'
import { useQueues } from '../lib/queue'

// Endpoint público de healthcheck — usado pelo Docker/orquestrador. Não expõe
// dados sensíveis: o detalhe do erro (que pode incluir host/porta de
// infra) fica só no log do servidor, nunca na resposta a um chamador anônimo.
export default defineEventHandler(async (event) => {
  try {
    const db = useDb()
    await db.execute(sql`select 1`)

    const { connection } = useQueues()
    await connection.ping()

    return { status: 'ok' }
  } catch (err) {
    console.error('[health] falhou:', err)
    setResponseStatus(event, 503)
    return { status: 'error' }
  }
})
