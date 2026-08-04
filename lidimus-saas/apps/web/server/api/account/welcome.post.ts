import { z } from 'zod'
import { and, eq, or } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { resolverOrgAtivaDoUsuario } from '../../lib/orgAtiva'
import { organizations, users } from '@lidimus/db'

const bodySchema = z.object({
  // Opcional: a tela de boas-vindas é cortesia, não etapa obrigatória — quem
  // fecha no Esc ou no X continua entrando, só fica com o nome sintético.
  company: z.string().trim().min(1).max(120).optional(),
})

// Marca as boas-vindas do primeiro acesso como vistas — a tela não volta a
// aparecer para este usuário, em nenhum dispositivo. É também onde quem entrou
// pelo Google informa a empresa, já que o cadastro social não passa por
// formulário.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const { company } = bodySchema.parse((await readBody(event).catch(() => ({}))) ?? {})

  if (company) {
    await db.update(users).set({ company, welcomed: true }).where(eq(users.id, user.id))

    // Identificar a conta com uma empresa deixa de ser individual — mas isso
    // não é "criar equipe": convidar alguém continua exigindo um plano que
    // comporte mais de uma pessoa (POST /api/account/team/criar).
    //
    // Só renomeia enquanto a organização ainda não foi batizada pelo dono e só
    // se o usuário for o dono: quem já nomeou a organização em Conta → Equipe
    // não perde o nome por causa de uma tela de boas-vindas atrasada, e um
    // convidado nunca renomeia a organização de quem o convidou. A comparação
    // com o nome sintético cobre as contas anteriores ao is_personal.
    const orgId = await resolverOrgAtivaDoUsuario(db, user.id, user.name)
    await db
      .update(organizations)
      .set({ name: company, isPersonal: false })
      .where(
        and(
          eq(organizations.id, orgId),
          eq(organizations.ownerId, user.id),
          or(
            eq(organizations.isPersonal, true),
            eq(organizations.name, `${user.name}'s workspace`),
          ),
        ),
      )
  } else {
    await db.update(users).set({ welcomed: true }).where(eq(users.id, user.id))
  }

  return { welcomed: true }
})
