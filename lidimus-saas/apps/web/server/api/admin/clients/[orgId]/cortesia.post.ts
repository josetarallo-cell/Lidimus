import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { useDb } from '../../../../lib/db'
import { requirePlatformAdmin } from '../../../../lib/requirePlatformAdmin'
import { organizations } from '@lidimus/db'

// Concede (ou retira) análises de matrícula de cortesia.
//
// Endpoint separado do de créditos porque a cortesia não é crédito: ela não tem
// preço, não entra no extrato e não é debitada por página. O que muda aqui é o
// teto de quantas análises gratuitas a organização pode abrir — ver
// cortesiasDisponiveis em server/lib/planAccess.ts.
const bodySchema = z.object({
  // Negativo permitido, pelo mesmo motivo do ajuste de créditos: quem concede
  // por engano precisa poder desfazer. O piso de zero é aplicado no UPDATE.
  delta: z.number().int().refine((n) => n !== 0, 'delta não pode ser zero').default(1),
})

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const db = useDb()

  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400 })

  const { delta } = bodySchema.parse((await readBody(event)) ?? {})

  // greatest(0, …) no próprio UPDATE: o contador nunca fica negativo, e a soma
  // acontece no banco — dois cliques simultâneos no botão somam dois, em vez de
  // um sobrescrever o outro.
  const [org] = await db
    .update(organizations)
    .set({
      cortesiasExtra: sql`greatest(0, ${organizations.cortesiasExtra} + ${delta})`,
    })
    .where(eq(organizations.id, orgId))
    .returning({ cortesiasExtra: organizations.cortesiasExtra })

  if (!org) throw createError({ statusCode: 404, statusMessage: 'Organização não encontrada.' })

  return { ok: true, cortesiasExtra: org.cortesiasExtra }
})
