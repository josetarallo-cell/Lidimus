import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
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

    // Renomeia a organização só enquanto ela ainda carrega o nome sintético e
    // só se o usuário for o dono: quem já batizou a organização em Conta →
    // Equipe não perde o nome por causa de uma tela de boas-vindas atrasada, e
    // um convidado nunca renomeia a organização de quem o convidou.
    const orgId = await resolverOrgAtivaDoUsuario(db, user.id, user.name)
    await db
      .update(organizations)
      .set({ name: company })
      .where(
        and(
          eq(organizations.id, orgId),
          eq(organizations.ownerId, user.id),
          eq(organizations.name, `${user.name}'s workspace`),
        ),
      )
  } else {
    await db.update(users).set({ welcomed: true }).where(eq(users.id, user.id))
  }

  return { welcomed: true }
})
