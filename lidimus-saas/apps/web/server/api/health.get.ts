import { sql } from 'drizzle-orm'
import { jobs, plans } from '@lidimus/db'
import { useDb } from '../lib/db'
import { useQueues } from '../lib/queue'

// Endpoint público de healthcheck — usado pelo Docker/orquestrador. Não expõe
// dados sensíveis: o detalhe do erro (que pode incluir host/porta de
// infra) fica só no log do servidor, nunca na resposta a um chamador anônimo.
export default defineEventHandler(async (event) => {
  const profundo = getQuery(event).profundo === '1'

  try {
    const db = useDb()
    await db.execute(sql`select 1`)

    const { connection } = useQueues()
    await connection.ping()

    if (!profundo) return { status: 'ok' }

    // Modo profundo, usado pelo smoke test do Lidimus Update.
    //
    // O `select 1` acima passa mesmo com o schema defasado — é literal, não
    // toca em tabela nenhuma. Depois de um deploy com migration pendente o
    // healthcheck raso devolve 200 com o site quebrado para quem está logado.
    //
    // Estes selects são montados a partir do schema do Drizzle, então nomeiam
    // cada coluna que o CÓDIGO acredita existir: se o banco estiver atrás, o
    // Postgres devolve "column does not exist" e o deploy sabe reverter.
    //
    // `users` fica de fora de propósito (a linha traria hash de senha para a
    // memória do processo). `plans` e `jobs` cobrem o caminho crítico e são
    // limitados a uma linha — barato o bastante para continuar anônimo.
    await db.select().from(plans).limit(1)
    await db.select().from(jobs).limit(1)

    return { status: 'ok', profundo: true }
  } catch (err) {
    console.error('[health] falhou:', err)
    setResponseStatus(event, 503)
    return { status: 'error' }
  }
})
