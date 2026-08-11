import { and, eq, gt, ne, sql } from 'drizzle-orm'
import type { Db, JobType } from '@lidimus/db'
import { creditTransactions, jobs, organizations, featuresDoPlano, planoLiberaDocx } from '@lidimus/db'

// A consulta do plano vigente e a lista de status que dão acesso moram em
// @lidimus/db (src/planos.ts): o script `pnpm chave:api` faz a mesma pergunta
// sobre entitlement, e um pacote não importa do app. Reexportados aqui porque
// este continua sendo o lugar de olhar quando se quer entender acesso.
// `planoLiberaDocx` também é importado acima, e não só reexportado: um
// `export { x } from '…'` reexporta sem trazer o nome ao escopo do módulo, e o
// exigirDocx aqui embaixo precisa chamá-lo.
export { STATUS_COM_ACESSO, planoLiberaApi } from '@lidimus/db'
export { planoLiberaDocx }

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

// ─── Análise de cortesia ─────────────────────────────────────────────────────
//
// A primeira análise de matrícula é por nossa conta. Ela não é crédito: é uma
// via de acesso, com teto de contagem próprio.
//
// Fora do crédito de propósito. Se a cortesia fosse um bônus de créditos, a
// promessa dependeria do tamanho do PDF — 150 créditos cobrem 8 páginas, e uma
// matrícula em cada sete passa disso —, e "sua análise grátis não coube" é uma
// falha logo na primeira tentativa, que é a que decide se a pessoa volta.
//
// Só matrícula. Croqui, memorial e detector continuam debitando os 150 créditos
// do cadastro, e usá-los antes não gasta a cortesia: quem começa pelo croqui
// chega na matrícula com a cortesia intacta.
export const CORTESIAS_POR_ORG = 1

// Concessões do suporte entram em organizations.cortesias_extra e somam a esse
// teto (ver o botão em /admin/clientes).

// Teto por IP, contra a criação de contas em série com e-mail descartável. Não é
// 1 porque escritório, coworking e operadora móvel compartilham endereço — três
// pessoas da mesma banca precisam poder experimentar. A janela é móvel: quem
// esbarrou no teto hoje volta a ter cortesia quando as antigas envelhecerem.
export const CORTESIAS_POR_IP = 3
export const JANELA_IP_DIAS = 30

// Jobs de matrícula que já deram baixa numa cortesia. Falha não conta — o
// pipeline quebrar não pode custar a análise grátis de ninguém, e é a mesma
// regra do avulso.
const jobDeCortesia = and(
  eq(jobs.type, 'matricula'),
  ne(jobs.status, 'error'),
  sql`${jobs.inputMeta}->>'viaCortesia' = 'true'`,
)

// Quantas análises de cortesia ainda cabem: o que resta para a organização,
// limitado pelo que resta para o IP.
//
// O IP é o de quem está enviando agora, e não o do cadastro: é no envio que a
// cortesia é gasta, e é lá que o endereço tem valor de sinal. Aceita a conexão
// ou uma transação em aberto, porque a revalidação sob o lock da organização
// roda dentro da transação do débito.
export async function cortesiasDisponiveis(
  db: Consulta,
  orgId: string,
  ip: string,
): Promise<number> {
  const [org] = await db
    .select({ extra: organizations.cortesiasExtra })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)
  const extra = org?.extra ?? 0

  const [naOrg] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), jobDeCortesia))

  const naConta = CORTESIAS_POR_ORG + extra - (naOrg?.n ?? 0)

  // Concessão do suporte passa por cima do teto por endereço. É justamente o
  // caso em que ele atrapalha: alguém do escritório ligou porque a quarta
  // pessoa da mesma sala foi recusada, e quem concede já sabe quem está do
  // outro lado da linha — o teto existe para o cadastro anônimo em série, não
  // para decisão tomada por gente.
  if (extra > 0) return Math.max(0, naConta)

  const [noIp] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(
      and(
        jobDeCortesia,
        sql`${jobs.inputMeta}->>'cortesiaIp' = ${ip}`,
        sql`${jobs.createdAt} > now() - ${`${JANELA_IP_DIAS} days`}::interval`,
      ),
    )

  return Math.max(0, Math.min(naConta, CORTESIAS_POR_IP - (noIp?.n ?? 0)))
}

// Barra a exportação em Word quando o plano não a inclui.
//
// 403 e não 402, pela mesma razão do exigirAcesso: não é falta de saldo, é
// falta de plano — a mensagem precisa oferecer upgrade, nunca "compre mais
// créditos". Exportar em si não consome crédito nenhum.
export async function exigirDocx(db: Db, orgId: string): Promise<void> {
  if (await planoLiberaDocx(db, orgId)) return
  throw createError({
    statusCode: 403,
    statusMessage:
      'A exportação em Word está disponível a partir do plano Profissional. ' +
      'O relatório continua acessível na tela e em PDF.',
  })
}

export type AcessoFerramenta =
  | { permitido: true; via: 'plano' }
  | { permitido: true; via: 'avulso' }
  | { permitido: true; via: 'cortesia' }
  | { permitido: false; via: null }

// Resolve o acesso a uma ferramenta: franquia do plano, depois avulso, depois
// cortesia. Só a matrícula tem os dois últimos caminhos — é o único produto
// vendido fora da assinatura, e o único que a casa oferece de graça.
//
// A ordem é o que protege a cortesia: quem tem plano ou avulso nunca a queima,
// então ela continua esperando o dia em que a assinatura acabar.
export async function resolverAcesso(
  db: Db,
  orgId: string,
  tool: JobType,
  ip?: string,
): Promise<AcessoFerramenta> {
  const doPlano = await ferramentasDoPlano(db, orgId)
  if (doPlano.includes(tool)) return { permitido: true, via: 'plano' }

  if (tool === 'matricula') {
    if ((await avulsosDisponiveis(db, orgId)) > 0) return { permitido: true, via: 'avulso' }

    // Sem IP não há como aplicar o teto por endereço, e conceder cortesia sem
    // esse teto é abrir a porta que ele fecha — some a via em vez de afrouxá-la.
    if (ip && (await cortesiasDisponiveis(db, orgId, ip)) > 0) {
      return { permitido: true, via: 'cortesia' }
    }
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
export async function exigirAcesso(
  db: Db,
  orgId: string,
  tool: JobType,
  ip?: string,
): Promise<AcessoFerramenta> {
  const acesso = await resolverAcesso(db, orgId, tool, ip)
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
