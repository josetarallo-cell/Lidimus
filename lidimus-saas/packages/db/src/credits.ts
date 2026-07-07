import { eq, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from './schema.ts'
import { creditTransactions } from './schema.ts'

type Db = PostgresJsDatabase<typeof schema>

// Custo em créditos de cada tipo de análise — espelha o "custo médio" anunciado na landing
export const CREDIT_COST: Record<'matricula' | 'kml' | 'injection', number> = {
  matricula: 20,
  kml: 50,
  injection: 5,
}

// Créditos concedidos na criação da organização pessoal ("Comece com 100 créditos gratuitos")
export const SIGNUP_GRANT_CREDITS = 100

export async function getOrgCreditBalance(db: Db, orgId: string): Promise<number> {
  const [row] = await db
    .select({ balance: sql<number>`coalesce(sum(${creditTransactions.delta}), 0)::int` })
    .from(creditTransactions)
    .where(eq(creditTransactions.orgId, orgId))
  return row.balance
}

// Estorna o consumo de um job que terminou em erro. Idempotente: o índice único
// parcial (um refund por job) garante no máximo um estorno mesmo se chamado de
// mais de um lugar (callback do n8n e handler 'failed' do worker).
export async function refundJobCredits(db: Db, jobId: string): Promise<void> {
  await db.execute(sql`
    insert into credit_transactions (org_id, delta, reason, job_id)
    select ct.org_id, -ct.delta, 'refund', ct.job_id
    from credit_transactions ct
    where ct.job_id = ${jobId} and ct.reason = 'consumption'
    on conflict do nothing
  `)
}
