import { and, desc, eq, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from './schema.ts'
import { plans, subscriptions } from './schema.ts'

type Db = PostgresJsDatabase<typeof schema>

export type FeaturesDoPlano = NonNullable<typeof plans.$inferSelect.features>

// past_due entra na lista: enquanto o Stripe faz a cobrança de novo (dunning) a
// assinatura ainda vale. O acesso só cai quando ela é cancelada.
export const STATUS_COM_ACESSO: Array<'active' | 'trialing' | 'past_due'> = [
  'active',
  'trialing',
  'past_due',
]

// Vitrine + entitlement do plano vigente da organização, ou undefined para quem
// não tem assinatura em estado que dê acesso.
//
// Mora no pacote de banco (e não em apps/web/server/lib/planAccess.ts, onde
// estão as políticas de HTTP) porque o script `pnpm chave:api` precisa da mesma
// resposta que a API dá, e um pacote não importa do app. Duas implementações da
// pergunta "este plano libera a API?" é como um gate deixa de valer.
export async function featuresDoPlano(db: Db, orgId: string): Promise<FeaturesDoPlano | undefined> {
  const [row] = await db
    .select({ features: plans.features })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.orgId, orgId), inArray(subscriptions.status, STATUS_COM_ACESSO)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  return row?.features ?? undefined
}

// A organização pode usar a API pública? Falha fechada por construção: sem
// assinatura, com assinatura cancelada ou em plano sem a marca, `features?.api`
// é undefined ou false e a resposta é não.
//
// Quem chama isto a cada requisição é o requireApiKey — é o que faz rebaixar o
// plano cortar o acesso na hora, sem depender de alguém revogar a chave.
export async function planoLiberaApi(db: Db, orgId: string): Promise<boolean> {
  const features = await featuresDoPlano(db, orgId)
  return features?.api === true
}

// Nome do plano vigente, só para mensagem de erro ("está no plano X, que não
// inclui a API"). Nunca use isto para decidir acesso — quem decide é o dado.
export async function nomeDoPlano(db: Db, orgId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ name: plans.name })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.orgId, orgId), inArray(subscriptions.status, STATUS_COM_ACESSO)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  return row?.name
}
