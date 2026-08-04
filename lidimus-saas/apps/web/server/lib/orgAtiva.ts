import { and, asc, eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { organizations, orgMembers, creditTransactions, users, SIGNUP_GRANT_CREDITS } from '@lidimus/db'

// Código de erro do Postgres para violação de unicidade (unique_violation).
const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION
}

// Organização em que o usuário é dono. O índice parcial
// org_members_one_owner_per_user_idx garante que existe no máximo uma.
export async function findOwnedOrg(db: Db, userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: orgMembers.orgId })
    .from(orgMembers)
    .where(and(eq(orgMembers.userId, userId), eq(orgMembers.role, 'owner')))
    .limit(1)
  return row?.id
}

// Vínculo mais antigo — desempate estável para quem só foi convidado.
async function findMembership(db: Db, userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
    .orderBy(asc(orgMembers.joinedAt))
    .limit(1)
  return row?.id
}

type Usuario = { id: string; name: string; company?: string | null }

// Cria a organização do usuário junto com o bônus de boas-vindas. O nome sai da
// empresa informada no cadastro; sem empresa é conta individual — a organização
// continua existindo, porque é ela que segura jobs, créditos e assinatura, mas
// leva o nome da própria pessoa e a interface não a apresenta como escritório.
async function criarOrgDoUsuario(db: Db, user: Usuario): Promise<string> {
  const empresa = user.company?.trim()
  const nome = empresa || user.name.trim() || 'Conta individual'

  try {
    return await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: nome, ownerId: user.id, isPersonal: !empresa })
        .returning({ id: organizations.id })

      // org_members_one_owner_per_user_idx rejeita esta linha se outra
      // requisição concorrente já criou a organização do usuário — o catch
      // abaixo trata a corrida sem duplicar org nem bônus de créditos.
      await tx.insert(orgMembers).values({ orgId: org.id, userId: user.id, role: 'owner' })

      await tx.insert(creditTransactions).values({
        orgId: org.id,
        delta: SIGNUP_GRANT_CREDITS,
        reason: 'signup_grant',
      })

      return org.id
    })
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    // Perdemos a corrida do primeiro login: a transação inteira (incluindo a
    // organização recém-criada) foi revertida — usa a org que já venceu.
    const winner = await findOwnedOrg(db, user.id)
    if (!winner) throw err
    return winner
  }
}

// A organização do usuário. Uma pessoa pertence a exatamente uma: ou é dona da
// própria, ou foi convidada para a de outra — e o aceite do convite dissolve a
// organização pessoal justamente para que não exista escolha a fazer aqui.
export async function resolverOrgAtiva(db: Db, user: Usuario): Promise<string> {
  const propria = await findOwnedOrg(db, user.id)
  if (propria) return propria

  const convidada = await findMembership(db, user.id)
  if (convidada) return convidada

  return criarOrgDoUsuario(db, user)
}

// Versão para os handlers, que recebem o usuário da sessão. Busca a empresa
// informada no cadastro antes de resolver — ela vira o nome da organização
// quando é o primeiro acesso.
export async function resolverOrgAtivaDoUsuario(db: Db, userId: string, userName: string) {
  const [row] = await db
    .select({ company: users.company })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return resolverOrgAtiva(db, { id: userId, name: userName, company: row?.company })
}

export type Vinculo = {
  orgId: string
  role: 'owner' | 'member' | 'reader'
  ehDono: boolean
  podeCriarAnalise: boolean
  // Conta individual: quem nunca informou empresa. Muda o que a interface
  // mostra — nome da pessoa no cabeçalho, "criar equipe" no lugar de
  // administrá-la —, nunca o que ela pode fazer: permissão sai sempre do `role`.
  orgPersonal: boolean
}

// Organização + papel de uma vez, para as rotas que precisam decidir permissão:
// criar análise, ver assinatura, administrar a equipe.
export async function vinculoDoUsuario(db: Db, userId: string, userName: string): Promise<Vinculo> {
  const orgId = await resolverOrgAtivaDoUsuario(db, userId, userName)

  const [row] = await db
    .select({ role: orgMembers.role, isPersonal: organizations.isPersonal })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1)

  const role = row?.role ?? 'member'
  return {
    orgId,
    role,
    ehDono: role === 'owner',
    // Leitor consulta o histórico da equipe, mas não gasta crédito da empresa.
    podeCriarAnalise: role !== 'reader',
    orgPersonal: row?.isPersonal ?? false,
  }
}

// Assinatura, planos e compra de crédito são do proprietário. Quem paga a conta
// é uma pessoa só; membro e leitor veem o saldo e o extrato, mas não mexem na
// cobrança. Devolve o orgId para o handler seguir em uma linha.
export function exigirDono(vinculo: Vinculo): string {
  if (!vinculo.ehDono) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Apenas o proprietário da conta administra planos e assinatura.',
    })
  }
  return vinculo.orgId
}

// Barra o leitor na criação de análises. 403 e não 402: não é saldo, é papel.
export function exigirPermissaoDeCriar(vinculo: Vinculo): void {
  if (!vinculo.podeCriarAnalise) {
    throw createError({
      statusCode: 403,
      statusMessage:
        'Seu acesso é somente de consulta. Peça a quem administra a conta para alterar seu papel na equipe.',
    })
  }
}
