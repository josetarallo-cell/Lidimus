import { eq } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { users } from '@lidimus/db'

// Marca as boas-vindas do primeiro acesso como vistas — a tela não volta a
// aparecer para este usuário, em nenhum dispositivo.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  await db.update(users).set({ welcomed: true }).where(eq(users.id, user.id))

  return { welcomed: true }
})
