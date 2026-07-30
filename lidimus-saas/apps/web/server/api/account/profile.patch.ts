import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { users } from '@lidimus/db'

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.').max(120),
})

// O próprio nome. Qualquer usuário muda o seu — é dado pessoal, não permissão,
// e é o nome que aparece como autor das análises para o resto da equipe.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const { name } = bodySchema.parse(await readBody(event))

  await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, user.id))

  return { ok: true, name }
})
