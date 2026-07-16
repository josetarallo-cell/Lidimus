import { eq, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from './schema.ts'
import { creditTransactions } from './schema.ts'

type Db = PostgresJsDatabase<typeof schema>

export type JobType = 'matricula' | 'kml' | 'injection'

// Precificação em créditos por análise, calibrada sobre o custo real de tokens
// medido no painel Admin (aba Custos). A regressão das 9 matrículas de teste
// (70 páginas) dá um custo aproximadamente linear:
//   custo ≈ US$0,108 fixo + US$0,0104/página  (≈ R$0,591 + R$0,057/pág a US$1=R$5,45)
// O componente fixo domina — é a análise jurídica do Claude, praticamente
// constante por documento — então a precificação é base-pesada, não só por página.
//
// Sobre esse custo aplicamos margem composta de 1,69× (30% de lucro × 30% de
// imposto) e convertemos em créditos pelo crédito mais barato (Empresarial,
// R$0,012), garantindo margem positiva em todos os planos:
//   base    = 0,591 × 1,69 / 0,012 ≈ 83 créditos
//   perPage = 0,057 × 1,69 / 0,012 ≈ 8 créditos/página
// Verificado: 1, 8 e 60 páginas mantêm ~1,69× de receita/custo no Empresarial.
//
// injection (Detector de PDF): custo de tokens desprezível (~US$0,002/análise, não
// escala com páginas — só inspeciona trechos suspeitos), então base 3 + 0,5/pág já
// carrega >3× de margem. kml (Memorial) é gerado de coordenadas e ainda não emite
// usage; mantém custo fixo (perPage = 0) como estimativa até haver telemetria.
// Ajuste os coeficientes aqui — é o único ponto de calibragem.
export const CREDIT_PRICING: Record<JobType, { base: number; perPage: number; maxPages: number }> = {
  matricula: { base: 83, perPage: 8, maxPages: 60 },
  injection: { base: 3, perPage: 0.5, maxPages: 60 },
  kml: { base: 50, perPage: 0, maxPages: 1 },
}

// Custo em créditos de uma análise, dado o nº de páginas do documento (default 1).
// O nº de páginas é limitado por maxPages para proteger contra PDFs anômalos, e o
// resultado é arredondado para cima (créditos são inteiros).
export function creditCostFor(type: JobType, opts?: { pages?: number }): number {
  const p = CREDIT_PRICING[type]
  const pages = Math.max(1, Math.min(Math.floor(opts?.pages ?? 1), p.maxPages))
  return Math.ceil(p.base + p.perPage * pages)
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
