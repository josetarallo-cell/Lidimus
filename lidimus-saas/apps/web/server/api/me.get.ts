import { eq } from 'drizzle-orm'
import { useDb } from '../lib/db'
import { requireAuth } from '../lib/requireAuth'
import { vinculoDoUsuario } from '../lib/orgAtiva'
import { organizations } from '@lidimus/db'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const vinculo = await vinculoDoUsuario(db, user.id, user.name)
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, vinculo.orgId))
    .limit(1)

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isPlatformAdmin: user.isPlatformAdmin,
    welcomed: user.welcomed,
    // Quem entrou pelo Google (e as contas anteriores ao campo) chega sem
    // empresa — as boas-vindas perguntam, mas só a quem manda na organização.
    company: user.company ?? null,
    orgId: vinculo.orgId,
    orgName: org?.name ?? null,
    // A interface usa estes dois para esconder o que a pessoa não pode fazer:
    // assinatura e compra de crédito são do dono; leitor não cria análise.
    role: vinculo.role,
    donoDaOrg: vinculo.ehDono,
    podeCriarAnalise: vinculo.podeCriarAnalise,
  }
})
