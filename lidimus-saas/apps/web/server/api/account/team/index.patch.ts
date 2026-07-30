import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../lib/db'
import { requireAuth } from '../../../lib/requireAuth'
import { resolverOrgAtivaDoUsuario } from '../../../lib/orgAtiva'
import { exigirDonoDaOrg } from '../../../lib/orgSeats'
import { organizations } from '@lidimus/db'

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da organização.').max(120),
})

// Renomeia a organização. Existe porque o nome agora é público dentro do
// produto (cabeçalho, seletor, e-mail de convite) e as contas criadas antes do
// campo Empresa carregam o "Fulano's workspace" gerado automaticamente.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const { name } = bodySchema.parse(await readBody(event))

  const orgId = await resolverOrgAtivaDoUsuario(db, user.id, user.name)
  await exigirDonoDaOrg(db, orgId, user.id)

  await db.update(organizations).set({ name }).where(eq(organizations.id, orgId))

  return { ok: true, name }
})
