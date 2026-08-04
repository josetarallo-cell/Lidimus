import { eq } from 'drizzle-orm'
import { useDb } from '../lib/db'
import { requireAuth } from '../lib/requireAuth'
import { vinculoDoUsuario } from '../lib/orgAtiva'
import { organizations, nomeDoPlano } from '@lidimus/db'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const vinculo = await vinculoDoUsuario(db, user.id, user.name)
  const [[org], planName] = await Promise.all([
    db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, vinculo.orgId))
      .limit(1),
    nomeDoPlano(db, vinculo.orgId),
  ])

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
    // Na conta individual o cabeçalho mostra a pessoa, não uma organização que
    // ela nunca nomeou. Sai do nome do perfil, e não de organizations.name, para
    // acompanhar quem trocar o próprio nome depois do cadastro.
    orgName: vinculo.orgPersonal ? user.name : (org?.name ?? null),
    orgPersonal: vinculo.orgPersonal,
    // Só rótulo, ao lado da empresa no cabeçalho: o plano explica por que uma
    // ferramenta aparece bloqueada antes de a pessoa tentar. Quem decide acesso
    // continua sendo /api/account/access (features), nunca este nome.
    planName: planName ?? null,
    // A interface usa estes dois para esconder o que a pessoa não pode fazer:
    // assinatura e compra de crédito são do dono; leitor não cria análise.
    role: vinculo.role,
    donoDaOrg: vinculo.ehDono,
    podeCriarAnalise: vinculo.podeCriarAnalise,
  }
})
