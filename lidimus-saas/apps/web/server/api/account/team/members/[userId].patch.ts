import { z } from 'zod'
import { and, eq, ne } from 'drizzle-orm'
import { useDb } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/requireAuth'
import { resolverOrgAtivaDoUsuario } from '../../../../lib/orgAtiva'
import { exigirDonoDaOrg } from '../../../../lib/orgSeats'
import { orgMembers } from '@lidimus/db'

const bodySchema = z.object({
  // Só existem dois níveis para a equipe: quem cria análises e quem consulta.
  // 'owner' não entra — a propriedade da conta acompanha a assinatura.
  role: z.enum(['member', 'reader']).optional(),
  // Cargo em texto livre, do jeito que o escritório chama: escrevente,
  // secretário, corretor. String vazia limpa o cargo e volta ao rótulo padrão.
  title: z.string().trim().max(60).optional(),
})

// Papel e cargo de um membro. Só o proprietário mexe.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const userId = getRouterParam(event, 'userId')
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'Usuário não informado.' })

  const { role, title } = bodySchema.parse(await readBody(event))
  if (role === undefined && title === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Nada a alterar.' })
  }

  const orgId = await resolverOrgAtivaDoUsuario(db, user.id, user.name)
  await exigirDonoDaOrg(db, orgId, user.id)

  // O ne('owner') protege o próprio dono: sem ele, o proprietário conseguiria
  // se rebaixar a leitor e a organização ficaria sem ninguém para administrar.
  const alterados = await db
    .update(orgMembers)
    .set({
      ...(role !== undefined ? { role } : {}),
      ...(title !== undefined ? { title: title || null } : {}),
    })
    .where(
      and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId), ne(orgMembers.role, 'owner')),
    )
    .returning({ role: orgMembers.role, title: orgMembers.title })

  if (!alterados.length) {
    throw createError({ statusCode: 404, statusMessage: 'Membro não encontrado nesta organização.' })
  }

  return { ok: true, ...alterados[0] }
})
