import { desc, eq } from 'drizzle-orm'
import { apiKeys } from '@lidimus/db'
import { useDb } from '../../../lib/db'
import { requireAuth } from '../../../lib/requireAuth'
import { exigirDono, vinculoDoUsuario } from '../../../lib/orgAtiva'
import { planoLiberaApi } from '../../../lib/planAccess'

// Chaves de integração da organização. Nunca devolve token: depois da emissão só
// existe o prefixo, e nem o servidor sabe o valor completo (guarda o SHA-256).
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const vinculo = await vinculoDoUsuario(db, user.id, user.name)
  const orgId = exigirDono(vinculo)

  const linhas = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.orgId, orgId))
    .orderBy(desc(apiKeys.createdAt))
    .limit(50)

  const agora = Date.now()

  return {
    // A tela precisa saber se ainda dá para emitir: quem perdeu a API por
    // rebaixamento de plano continua vendo as chaves (e podendo revogá-las), mas
    // não emite mais — e elas já não autenticam nada.
    planoLiberaApi: await planoLiberaApi(db, orgId),
    chaves: linhas.map((chave) => ({
      ...chave,
      situacao: chave.revokedAt
        ? ('revogada' as const)
        : chave.expiresAt.getTime() <= agora
          ? ('expirada' as const)
          : ('ativa' as const),
    })),
  }
})
