import { and, eq, gt, ne, sql } from 'drizzle-orm'
import type { Db, JobType } from '@lidimus/db'
import { creditTransactions, jobs, featuresDoPlano } from '@lidimus/db'

// A consulta do plano vigente e a lista de status que dão acesso moram em
// @lidimus/db (src/planos.ts): o script `pnpm chave:api` faz a mesma pergunta
// sobre entitlement, e um pacote não importa do app. Reexportados aqui porque
// este continua sendo o lugar de olhar quando se quer entender acesso.
export { STATUS_COM_ACESSO, planoLiberaApi } from '@lidimus/db'

// Nível de acesso de quem não tem assinatura ativa. É idêntico ao do plano de
// entrada (Croqui) de propósito: se o piso fosse mais alto, cancelar o plano
// viraria upgrade de acesso.
export const FERRAMENTAS_SEM_PLANO: JobType[] = ['croqui', 'kml', 'injection']

// Ferramentas liberadas pela assinatura da organização (fora o caminho avulso).
export async function ferramentasDoPlano(db: Db, orgId: string): Promise<JobType[]> {
  const features = await featuresDoPlano(db, orgId)

  const declaradas = features?.ferramentas
  return declaradas?.length ? (declaradas as JobType[]) : FERRAMENTAS_SEM_PLANO
}

// Saldo de análises avulsas: cada compra avulsa vale uma análise de matrícula.
//
// A compra chega hoje como ajuste positivo do admin (o Pix de R$ 89 é conferido
// à mão) ou, quando houver checkout próprio, como uma transação com
// provider_ref 'avulso_*'. O consumo não tem linha própria: a própria análise
// feita por essa via fica marcada com `inputMeta.viaAvulso`, e jobs que falharam
// não contam — o crédito é estornado, o avulso também.
// Aceita a conexão ou uma transação em aberto (drizzle não unifica os dois
// tipos): a revalidação sob o lock da org acontece dentro da transação do débito.
type Consulta = Pick<Db, 'select'>

export async function avulsosDisponiveis(db: Consulta, orgId: string): Promise<number> {
  const [compras] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.orgId, orgId),
        gt(creditTransactions.delta, 0),
        sql`(${creditTransactions.reason} = 'admin_adjustment' or ${creditTransactions.providerRef} like 'avulso\\_%')`,
      ),
    )

  const [usados] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(
      and(
        eq(jobs.orgId, orgId),
        eq(jobs.type, 'matricula'),
        ne(jobs.status, 'error'),
        sql`${jobs.inputMeta}->>'viaAvulso' = 'true'`,
      ),
    )

  return Math.max(0, (compras?.n ?? 0) - (usados?.n ?? 0))
}

export type AcessoFerramenta =
  | { permitido: true; via: 'plano' }
  | { permitido: true; via: 'avulso' }
  | { permitido: false; via: null }

// Resolve o acesso a uma ferramenta: primeiro pela franquia do plano, depois
// pelo avulso. Só a matrícula tem caminho avulso — é o único produto vendido
// fora da assinatura.
export async function resolverAcesso(db: Db, orgId: string, tool: JobType): Promise<AcessoFerramenta> {
  const doPlano = await ferramentasDoPlano(db, orgId)
  if (doPlano.includes(tool)) return { permitido: true, via: 'plano' }

  if (tool === 'matricula' && (await avulsosDisponiveis(db, orgId)) > 0) {
    return { permitido: true, via: 'avulso' }
  }

  return { permitido: false, via: null }
}

const NOME_FERRAMENTA: Record<JobType, string> = {
  matricula: 'A análise de matrícula',
  croqui: 'O croqui',
  kml: 'O memorial descritivo',
  injection: 'O detector de conteúdo oculto',
}

// Barra a criação do job quando a ferramenta não está no nível de acesso da org.
// 403 (e não 402): não é falta de saldo, é falta de plano — a tela precisa
// oferecer assinatura ou avulso, nunca "compre mais créditos".
export async function exigirAcesso(db: Db, orgId: string, tool: JobType): Promise<AcessoFerramenta> {
  const acesso = await resolverAcesso(db, orgId, tool)
  if (!acesso.permitido) {
    throw createError({
      statusCode: 403,
      statusMessage:
        tool === 'matricula'
          ? 'A análise de matrícula não está incluída no seu plano. Assine o Essencial ou compre uma análise avulsa.'
          : `${NOME_FERRAMENTA[tool]} não está incluído no seu plano.`,
    })
  }
  return acesso
}
