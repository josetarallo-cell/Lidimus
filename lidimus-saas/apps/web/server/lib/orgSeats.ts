import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { orgInvitations, orgMembers, organizations, plans, subscriptions } from '@lidimus/db'
import { STATUS_COM_ACESSO } from './planAccess'

// Teto de usuários de quem não tem assinatura: só o dono. Igual ao Croqui e ao
// Essencial (max_users = 1), pelo mesmo motivo do FERRAMENTAS_SEM_PLANO — se o
// piso fosse maior, cancelar o plano viraria upgrade.
const LIMITE_SEM_PLANO = 1

export type Assentos = {
  limite: number
  ocupados: number
  membros: number
  convitesPendentes: number
  planName: string | null
}

// Quantos usuários o plano da organização comporta.
export async function limiteDeUsuarios(db: Db, orgId: string): Promise<{ limite: number; planName: string | null }> {
  const [row] = await db
    .select({ maxUsers: plans.maxUsers, planName: plans.name })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.orgId, orgId), inArray(subscriptions.status, STATUS_COM_ACESSO)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  return { limite: row?.maxUsers ?? LIMITE_SEM_PLANO, planName: row?.planName ?? null }
}

// Convites pendentes contam como assento ocupado: sem isso o dono convidaria 10
// pessoas de uma vez num plano de 3 e o estouro só apareceria no aceite, quando
// já é tarde para explicar.
export async function contarAssentos(db: Db, orgId: string): Promise<Assentos> {
  const [{ limite, planName }, [membros], [convites]] = await Promise.all([
    limiteDeUsuarios(db, orgId),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orgMembers)
      .where(eq(orgMembers.orgId, orgId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orgInvitations)
      .where(
        and(
          eq(orgInvitations.orgId, orgId),
          isNull(orgInvitations.acceptedAt),
          gt(orgInvitations.expiresAt, new Date()),
        ),
      ),
  ])

  const nMembros = membros?.n ?? 0
  const nConvites = convites?.n ?? 0

  return {
    limite,
    planName,
    membros: nMembros,
    convitesPendentes: nConvites,
    ocupados: nMembros + nConvites,
  }
}

// Barra o convite quando o plano já está lotado. 403 e não 402: não é falta de
// saldo, é limite do plano — a tela precisa oferecer upgrade.
export async function exigirAssentoLivre(db: Db, orgId: string): Promise<Assentos> {
  const assentos = await contarAssentos(db, orgId)
  if (assentos.ocupados >= assentos.limite) {
    throw createError({
      statusCode: 403,
      statusMessage:
        assentos.limite === 1
          ? 'Seu plano atual permite apenas 1 usuário. Assine o Profissional (até 3) ou o Escritório (até 10) para convidar sua equipe.'
          : `Seu plano permite até ${assentos.limite} usuários e todos os lugares já estão ocupados. Faça upgrade ou remova um membro para convidar outra pessoa.`,
    })
  }
  return assentos
}

// O Enterprise não tem preço de tabela: os `price_cents` da linha são 0, e um
// checkout com esse planId sairia com assinatura gratuita e franquia cheia.
// Quem coloca um cliente num plano sob contrato é o admin da plataforma.
export function exigirPlanoDeAutoatendimento(plano: {
  name: string
  features: { sobContrato?: boolean } | null
}): void {
  if (plano.features?.sobContrato) {
    throw createError({
      statusCode: 403,
      statusMessage: `O plano ${plano.name} é negociado caso a caso. Fale com o comercial para contratá-lo.`,
    })
  }
}

// Impede assinar (ou migrar para) um plano que comporta menos gente do que a
// organização já tem. O caminho contrário — rebaixar e "congelar" os
// excedentes — exigiria um estado de membro suspenso que nem a tela nem o
// controle de acesso modelam; bloquear é a regra que o usuário consegue
// resolver sozinho.
export async function exigirPlanoComportaEquipe(
  db: Db,
  orgId: string,
  novoPlano: { name: string; maxUsers: number },
): Promise<void> {
  const [membros] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId))

  const n = membros?.n ?? 0
  if (n > novoPlano.maxUsers) {
    const excedente = n - novoPlano.maxUsers
    throw createError({
      statusCode: 400,
      statusMessage:
        `Sua organização tem ${n} usuários e o plano ${novoPlano.name} permite ${novoPlano.maxUsers}. ` +
        `Remova ${excedente} ${excedente === 1 ? 'membro' : 'membros'} em Conta → Equipe antes de mudar de plano.`,
    })
  }
}

// Só o dono administra a equipe. Membro comum enxerga o histórico e usa as
// ferramentas, mas não convida, não remove e não renomeia a organização.
export async function exigirDonoDaOrg(db: Db, orgId: string, userId: string): Promise<void> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, orgId), eq(organizations.ownerId, userId)))
    .limit(1)

  if (!row) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Apenas o proprietário da organização pode gerenciar a equipe.',
    })
  }
}
