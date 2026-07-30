import { and, eq, ne } from 'drizzle-orm'
import { useDb } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/requireAuth'
import { resolverOrgAtivaDoUsuario } from '../../../../lib/orgAtiva'
import { exigirDonoDaOrg } from '../../../../lib/orgSeats'
import { orgMembers } from '@lidimus/db'

// Remove alguém da equipe. O histórico produzido pela pessoa continua na
// organização — os jobs pertencem ao org_id, não ao autor.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const userId = getRouterParam(event, 'userId')
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'Usuário não informado.' })

  const orgId = await resolverOrgAtivaDoUsuario(db, user.id, user.name)
  await exigirDonoDaOrg(db, orgId, user.id)

  if (userId === user.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'O proprietário não pode sair da própria organização.',
    })
  }

  const removidos = await db
    .delete(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId), ne(orgMembers.role, 'owner')))
    .returning({ id: orgMembers.id })

  if (!removidos.length) {
    throw createError({ statusCode: 404, statusMessage: 'Membro não encontrado nesta organização.' })
  }

  // A pessoa removida fica sem organização nenhuma. Não recriamos aqui: a
  // próxima chamada de API dela passa por resolverOrgAtiva, que cria a
  // organização própria de novo (com o bônus de boas-vindas) — o mesmo caminho
  // de quem acabou de se cadastrar.
  return { ok: true }
})
