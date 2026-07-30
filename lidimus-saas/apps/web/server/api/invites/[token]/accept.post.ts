import { and, eq, inArray, ne } from 'drizzle-orm'
import { useDb } from '../../../lib/db'
import { requireAuth } from '../../../lib/requireAuth'
import { hashDoToken } from '../../../lib/inviteToken'
import { contarAssentos } from '../../../lib/orgSeats'
import { findOwnedOrg } from '../../../lib/orgAtiva'
import { STATUS_COM_ACESSO } from '../../../lib/planAccess'
import {
  creditTransactions,
  jobs,
  orgInvitations,
  orgMembers,
  organizations,
  subscriptions,
} from '@lidimus/db'

// Aceite do convite. Exige sessão: quem ainda não tem conta passa antes pelo
// cadastro e volta para cá.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const token = getRouterParam(event, 'token') ?? ''
  if (token.length !== 64) {
    throw createError({ statusCode: 404, statusMessage: 'Convite não encontrado.' })
  }

  const [convite] = await db
    .select()
    .from(orgInvitations)
    .where(eq(orgInvitations.tokenHash, hashDoToken(token)))
    .limit(1)

  if (!convite) {
    throw createError({ statusCode: 404, statusMessage: 'Convite não encontrado.' })
  }
  if (convite.acceptedAt) {
    throw createError({ statusCode: 410, statusMessage: 'Este convite já foi usado.' })
  }
  if (convite.expiresAt.getTime() < Date.now()) {
    throw createError({
      statusCode: 410,
      statusMessage: 'Este convite expirou. Peça um novo para quem administra a organização.',
    })
  }

  // O convite é nominal. Sem esta conferência, encaminhar o e-mail daria acesso
  // à organização a qualquer pessoa com uma conta Lidimus.
  if (convite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw createError({
      statusCode: 403,
      statusMessage: `Este convite é para ${convite.email}. Entre com essa conta para aceitá-lo.`,
    })
  }

  // Uma pessoa, uma organização. Quem já foi convidado por outra empresa
  // precisa sair de lá primeiro — do contrário voltaríamos ao seletor de
  // organizações, que é exatamente o que este modelo elimina.
  const [outroVinculo] = await db
    .select({ nome: organizations.name })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(
      and(
        eq(orgMembers.userId, user.id),
        ne(orgMembers.orgId, convite.orgId),
        ne(orgMembers.role, 'owner'),
      ),
    )
    .limit(1)

  if (outroVinculo) {
    throw createError({
      statusCode: 409,
      statusMessage: `Você já faz parte da equipe de ${outroVinculo.nome}. Peça para ser removido de lá antes de entrar nesta.`,
    })
  }

  // Revalida o limite no aceite: entre o convite e o clique o plano pode ter
  // sido rebaixado ou os lugares ocupados por outros convidados.
  const assentos = await contarAssentos(db, convite.orgId)
  if (assentos.membros >= assentos.limite) {
    throw createError({
      statusCode: 403,
      statusMessage:
        'A organização já atingiu o limite de usuários do plano. Peça a quem administra para liberar um lugar.',
    })
  }

  // A organização pessoal do convidado (criada no cadastro) é dissolvida: as
  // análises e o saldo passam para a empresa que convidou. É o que o convite
  // significa — a pessoa deixa de ter conta própria e passa a trabalhar na conta
  // do escritório.
  const orgPessoal = await findOwnedOrg(db, user.id)

  if (orgPessoal) {
    // Assinatura própria é o único caso em que não dá para simplesmente
    // dissolver: haveria duas cobranças ativas e nenhuma regra óbvia sobre qual
    // encerrar. O cancelamento é decisão do titular, não deste endpoint.
    const [assinaturaPropria] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(eq(subscriptions.orgId, orgPessoal), inArray(subscriptions.status, STATUS_COM_ACESSO)),
      )
      .limit(1)

    if (assinaturaPropria) {
      throw createError({
        statusCode: 409,
        statusMessage:
          'Você tem uma assinatura ativa na sua própria conta. Cancele-a em Conta → Assinatura antes de entrar na equipe.',
      })
    }
  }

  await db.transaction(async (tx) => {
    if (orgPessoal) {
      // Ordem importa: jobs e lançamentos saem antes da organização, senão o
      // DELETE esbarraria nas chaves estrangeiras.
      await tx.update(jobs).set({ orgId: convite.orgId }).where(eq(jobs.orgId, orgPessoal))
      await tx
        .update(creditTransactions)
        .set({ orgId: convite.orgId })
        .where(eq(creditTransactions.orgId, orgPessoal))
      await tx.delete(orgMembers).where(eq(orgMembers.orgId, orgPessoal))
      await tx.delete(organizations).where(eq(organizations.id, orgPessoal))
    }

    await tx
      .insert(orgMembers)
      .values({ orgId: convite.orgId, userId: user.id, role: convite.role })
      .onConflictDoNothing()

    await tx
      .update(orgInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(orgInvitations.id, convite.id))
  })

  return { ok: true, orgId: convite.orgId }
})
