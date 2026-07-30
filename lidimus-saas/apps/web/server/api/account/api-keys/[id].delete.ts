import { and, eq, isNull } from 'drizzle-orm'
import { apiKeys } from '@lidimus/db'
import { useDb } from '../../../lib/db'
import { requireAuth } from '../../../lib/requireAuth'
import { exigirDono, vinculoDoUsuario } from '../../../lib/orgAtiva'

// Revoga uma chave. Efeito imediato: a autenticação da API confere revokedAt em
// toda requisição, então a chamada seguinte da integração já falha.
//
// A linha não é apagada — o histórico de quem emitiu o que sobrevive à morte da
// chave, e é isso que permite investigar um gasto depois do fato.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Informe a chave a revogar.' })

  const vinculo = await vinculoDoUsuario(db, user.id, user.name)
  const orgId = exigirDono(vinculo)

  // O filtro por orgId é o que impede revogar chave de outra organização mesmo
  // conhecendo o id; `isNull(revokedAt)` torna a operação idempotente.
  const revogadas = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, orgId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id })

  // 404 e não 403 para chave de outra organização: não confirmamos que o id existe.
  if (!revogadas.length) {
    throw createError({ statusCode: 404, statusMessage: 'Chave não encontrada ou já revogada.' })
  }

  return { ok: true }
})
