import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { apiKeys, gerarChave, validadeDaChave, filtroChaveAtiva, MAX_CHAVES_ATIVAS } from '@lidimus/db'
import { useDb } from '../../../lib/db'
import { requireAuth } from '../../../lib/requireAuth'
import { exigirDono, vinculoDoUsuario } from '../../../lib/orgAtiva'
import { planoLiberaApi } from '../../../lib/planAccess'

const bodySchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Dê um nome à chave para saber depois qual integração ela atende.')
    .max(80, 'Use no máximo 80 caracteres no nome.'),
  // Confirmação explícita de que o dono entendeu que o consumo sai do saldo da
  // organização. Não é enfeite de tela: a chave vai ser compartilhada, e quem
  // assume a conta de crédito é quem a emite.
  cienteDoConsumo: z.literal(true, {
    errorMap: () => ({ message: 'Confirme que as análises feitas por esta chave debitam créditos do seu plano.' }),
  }),
})

// Emite uma chave de integração. Só o proprietário, e só em plano com API.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors[0]?.message ?? 'Dados inválidos.',
    })
  }

  const vinculo = await vinculoDoUsuario(db, user.id, user.name)
  // Quem paga a conta é quem emite credencial que gasta o saldo. Mesma barreira
  // de plano, assinatura e compra de crédito.
  const orgId = exigirDono(vinculo)

  if (!(await planoLiberaApi(db, orgId))) {
    throw createError({
      statusCode: 403,
      statusMessage: 'A API está disponível nos planos Escritório e Enterprise. Faça upgrade para emitir chaves de integração.',
    })
  }

  const [{ ativas }] = await db
    .select({ ativas: sql<number>`count(*)::int` })
    .from(apiKeys)
    .where(and(eq(apiKeys.orgId, orgId), filtroChaveAtiva()))

  if (ativas >= MAX_CHAVES_ATIVAS) {
    throw createError({
      statusCode: 409,
      statusMessage: `Você já tem ${MAX_CHAVES_ATIVAS} chaves ativas. Revogue uma que não esteja em uso antes de emitir outra.`,
    })
  }

  const { token, prefix, keyHash } = gerarChave()
  const expiresAt = validadeDaChave()

  const [criada] = await db
    .insert(apiKeys)
    .values({ orgId, createdBy: user.id, name: body.data.nome, prefix, keyHash, expiresAt })
    .returning({ id: apiKeys.id, createdAt: apiKeys.createdAt })

  return {
    id: criada.id,
    nome: body.data.nome,
    prefix,
    expiresAt,
    createdAt: criada.createdAt,
    // Única vez que o token existe em claro. O banco só tem o SHA-256 — se o
    // cliente perder, não há recuperação: emite outra e revoga esta.
    token,
  }
})
