import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { useDb } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/requireAuth'
import { resolverOrgAtivaDoUsuario } from '../../../../lib/orgAtiva'
import { exigirDonoDaOrg } from '../../../../lib/orgSeats'
import { orgInvitations } from '@lidimus/db'

// Cancela um convite ainda não aceito, devolvendo o assento à organização.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const id = z.string().uuid().parse(getRouterParam(event, 'id'))

  const orgId = await resolverOrgAtivaDoUsuario(db, user.id, user.name)
  await exigirDonoDaOrg(db, orgId, user.id)

  // O filtro por orgId é o que impede cancelar convite de outra organização
  // conhecendo só o id.
  const apagados = await db
    .delete(orgInvitations)
    .where(
      and(
        eq(orgInvitations.id, id),
        eq(orgInvitations.orgId, orgId),
        isNull(orgInvitations.acceptedAt),
      ),
    )
    .returning({ id: orgInvitations.id })

  if (!apagados.length) {
    throw createError({ statusCode: 404, statusMessage: 'Convite não encontrado ou já aceito.' })
  }

  return { ok: true }
})
