import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../lib/db'
import { requireAuth } from '../../../lib/requireAuth'
import { vinculoDoUsuario } from '../../../lib/orgAtiva'
import { exigirDonoDaOrg, exigirPlanoComEquipe } from '../../../lib/orgSeats'
import { organizations, users } from '@lidimus/db'

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da organização.').max(120),
})

// Converte a conta individual em equipe: a organização ganha nome próprio e
// deixa de ser pessoal, liberando a tela de membros e os convites.
//
// É endpoint separado do PATCH /api/account/team (que só renomeia) porque a
// conversão tem uma condição que a renomeação não tem: o plano precisa comportar
// mais de uma pessoa. Misturar as duas faria um rename inocente esbarrar no
// gate de plano.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const { name } = bodySchema.parse(await readBody(event))

  const vinculo = await vinculoDoUsuario(db, user.id, user.name)
  await exigirDonoDaOrg(db, vinculo.orgId, user.id)

  if (!vinculo.orgPersonal) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Esta conta já é uma organização. Use Renomear para mudar o nome.',
    })
  }

  await exigirPlanoComEquipe(db, vinculo.orgId)

  await db
    .update(organizations)
    .set({ name, isPersonal: false })
    .where(eq(organizations.id, vinculo.orgId))

  // Espelha em users.company para o campo "Empresa" do perfil não continuar
  // vazio depois que a conta virou uma organização com nome.
  await db.update(users).set({ company: name }).where(eq(users.id, user.id))

  return { ok: true, name }
})
