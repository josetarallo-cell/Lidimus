import { eq, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from './schema.ts'
import { creditTransactions } from './schema.ts'

type Db = PostgresJsDatabase<typeof schema>

export type JobType = 'matricula' | 'kml' | 'injection' | 'croqui'

// Precificação em créditos por análise, calibrada sobre o custo real de tokens
// medido no painel Admin (aba Custos). A regressão das 9 matrículas de teste
// (70 páginas) dá um custo aproximadamente linear:
//   custo ≈ US$0,108 fixo + US$0,0104/página  (≈ R$0,591 + R$0,057/pág a US$1=R$5,45)
// O componente fixo domina — é a análise jurídica do Claude, praticamente
// constante por documento — então a precificação é base-pesada, não só por página.
//
// Sobre esse custo aplicamos margem composta de 1,69× (30% de lucro × 30% de
// imposto) e convertemos em créditos pelo crédito mais barato da tabela vigente
// à época (R$0,012), garantindo margem positiva em todos os planos:
//   base    = 0,591 × 1,69 / 0,012 ≈ 83 créditos
//   perPage = 0,057 × 1,69 / 0,012 ≈ 8 créditos/página
// Os coeficientes seguem valendo: eles são custo, não preço. Na tabela de planos
// de jul/2026 (migration 0012) o crédito mais barato passou a ser R$0,026 (plano
// Croqui) e o mais caro R$0,092 (Profissional) — a folga sobre o custo subiu para
// ~3,6× no pior plano, então a calibragem continua conservadora.
//
// injection (Detector de PDF): custo de tokens desprezível (~US$0,002/análise, não
// escala com páginas — só inspeciona trechos suspeitos), então base 3 + 0,5/pág já
// carrega >3× de margem. kml (Memorial) é gerado de coordenadas e ainda não emite
// usage; mantém custo fixo (perPage = 0) como estimativa até haver telemetria.
// croqui: uma extração Mistral sobre o trecho do perímetro + desenho por código
// (zero token). Estimativa até haver telemetria: base cobre a extração; perPage
// cobre o OCR no modo de upload avulso. Reaproveitando matrícula já lida, cobra
// pages=1 (não há OCR novo).
// Ajuste os coeficientes aqui — é o único ponto de calibragem.
export const CREDIT_PRICING: Record<JobType, { base: number; perPage: number; maxPages: number }> = {
  matricula: { base: 83, perPage: 8, maxPages: 60 },
  injection: { base: 3, perPage: 0.5, maxPages: 60 },
  kml: { base: 50, perPage: 0, maxPages: 1 },
  croqui: { base: 12, perPage: 3, maxPages: 60 },
}

// Custo em créditos de uma análise, dado o nº de páginas do documento (default 1).
// O nº de páginas é limitado por maxPages para proteger contra PDFs anômalos, e o
// resultado é arredondado para cima (créditos são inteiros).
export function creditCostFor(type: JobType, opts?: { pages?: number }): number {
  const p = CREDIT_PRICING[type]
  const pages = Math.max(1, Math.min(Math.floor(opts?.pages ?? 1), p.maxPages))
  return Math.ceil(p.base + p.perPage * pages)
}

// Créditos concedidos na criação da organização ("Comece com 150 créditos
// gratuitos"). Ao mexer neste número, acerte junto a landing, a tela de cadastro
// e as boas-vindas — os três anunciam o valor em texto.
export const SIGNUP_GRANT_CREDITS = 150

export async function getOrgCreditBalance(db: Db, orgId: string): Promise<number> {
  const [row] = await db
    .select({ balance: sql<number>`coalesce(sum(${creditTransactions.delta}), 0)::int` })
    .from(creditTransactions)
    .where(eq(creditTransactions.orgId, orgId))
  return row.balance
}

// Aceita tanto a conexão quanto uma transação em aberto (drizzle-orm não
// unifica os dois tipos, e essa função precisa rodar dentro de transações).
type QueryRunner = Pick<Db, 'select' | 'execute'>

// Lê o saldo da org travando a linha correspondente em `organizations`
// (SELECT ... FOR UPDATE). Chamada dentro de uma transação, serializa
// checagens concorrentes de saldo: a segunda chamada só prossegue depois que
// a primeira commita seu débito, eliminando a corrida de saldo (TOCTOU) em
// uploads simultâneos da mesma org.
export async function lockOrgCreditBalance(tx: QueryRunner, orgId: string): Promise<number> {
  await tx.execute(sql`select id from organizations where id = ${orgId} for update`)
  const [row] = await tx
    .select({ balance: sql<number>`coalesce(sum(${creditTransactions.delta}), 0)::int` })
    .from(creditTransactions)
    .where(eq(creditTransactions.orgId, orgId))
  return row?.balance ?? 0
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
