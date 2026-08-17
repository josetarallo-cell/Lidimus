import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
  boolean,
  integer,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// ─── Enums ───────────────────────────────────────────────────────────────────

// Papéis internos. O rótulo que a equipe enxerga é livre (org_members.title):
// cada escritório chama seu pessoal de escrevente, secretário, corretor. Aqui
// ficam só as duas permissões que o sistema precisa distinguir — quem cria
// análises e quem apenas consulta — mais o dono.
export const orgRoleEnum = pgEnum('org_role', ['owner', 'member', 'reader'])

export const jobTypeEnum = pgEnum('job_type', ['matricula', 'kml', 'injection', 'croqui'])

// `awaiting_review` é o único estado em que o pipeline para por vontade própria:
// o corretor de leitura encontrou trechos que precisam de olho humano e espera a
// resposta. Não é terminal (o job volta a 'queued' quando a revisão fecha) e não
// é ativo (o watchdog de jobs presos não deve expirá-lo, porque a demora aqui é
// do usuário, não do sistema) — daí precisar de valor próprio.
export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'queued',
  'processing',
  'awaiting_review',
  'done',
  'error',
])

// Etapas dos pipelines de matrícula (ocr → revisao → juridico → doc) e de croqui
// (ocr → croqui; jobs de croqui reaproveitando OCR pulam direto para 'croqui').
// A etapa 'revisao' só existe quando o corretor tem o que perguntar; sem
// candidatos, o OCR emenda direto no jurídico como sempre fez.
export const jobStageEnum = pgEnum('job_stage', ['ocr', 'revisao', 'juridico', 'doc', 'croqui'])

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
])

export const creditReasonEnum = pgEnum('credit_reason', [
  'signup_grant',
  'purchase',
  'consumption',
  'refund',
  'admin_adjustment',
])

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  // better-auth trata emailVerified como boolean, não timestamp — manter timestamp
  // quebra o sign-up (o adapter tenta .toISOString() em `false`)
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Acesso às telas /admin/* — distinto do org_role, que é por organização
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  // Boas-vindas do primeiro acesso já vistas — a tela aparece uma única vez
  welcomed: boolean('welcomed').notNull().default(false),
  // Empresa informada no cadastro. É a ponte até a organização existir: ela só
  // nasce na primeira chamada de API que precisa dela, e é daqui que sai o
  // organizations.name (ver resolverOrgAtiva).
  company: text('company'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── Aceite dos termos ────────────────────────────────────────────────────────

// Registro do clickwrap do cadastro: uma linha por aceite, escrita uma vez e
// nunca atualizada. O que ela prova é que alguém, em determinada data e vindo de
// determinado IP, declarou ter lido uma versão específica dos Termos — por isso
// a versão fica gravada aqui em cópia, e não como referência ao texto vigente,
// que muda. Sem isso, uma alteração futura reescreveria retroativamente aquilo
// que todo mundo aceitou.
export const termsAcceptances = pgTable(
  'terms_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    // Por onde a conta nasceu — 'email' ou 'google'. O aceite é o mesmo; o
    // caminho muda como ele chegou até aqui, e vale saber qual foi.
    via: text('via').notNull(),
    // IP inteiro, não o prefixo /64 com que o resto do servidor conta limites:
    // ali ele é chave de agrupamento, aqui é evidência, e evidência truncada
    // vale menos.
    ip: text('ip'),
    userAgent: text('user_agent'),
    acceptedAt: timestamp('accepted_at').notNull().defaultNow(),
  },
  (t) => [index('terms_acceptances_user_idx').on(t.userId)],
)

// ─── Better Auth tables ───────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
})

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── Organizations ────────────────────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  // Conta individual: a pessoa se cadastrou sem informar empresa. A organização
  // existe do mesmo jeito — é ela que segura jobs, créditos e assinatura —, mas
  // não é apresentada como uma: o cabeçalho mostra o nome da pessoa e Conta →
  // Equipe oferece criar a equipe em vez de administrá-la.
  isPersonal: boolean('is_personal').notNull().default(false),
  // Análises de matrícula de cortesia concedidas à mão pelo suporte, além da
  // primeira que toda organização ganha. Contador e não booleano: o suporte
  // pode precisar dar a segunda depois de já ter dado a primeira. Some-se ao
  // teto padrão em server/lib/planAccess.ts.
  cortesiasExtra: integer('cortesias_extra').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const orgMembers = pgTable(
  'org_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRoleEnum('role').notNull().default('member'),
    // Cargo escolhido pelo dono, em texto livre ("escrevente", "corretor").
    // É rótulo, não permissão — quem manda no acesso é sempre `role`.
    title: text('title'),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  (t) => [
    // No máximo uma organização própria (owner) por usuário — dá ao
    // resolverOrgAtiva um alvo de ON CONFLICT para resolver a corrida do
    // primeiro login sem duplicar org/bônus de créditos quando duas requisições
    // chegam juntas, e torna a "organização própria" uma busca sem ambiguidade
    // mesmo quando o usuário também é membro da equipe de outra pessoa.
    uniqueIndex('org_members_one_owner_per_user_idx')
      .on(t.userId)
      .where(sql`${t.role} = 'owner'`),
  ],
)

export const orgInvitations = pgTable(
  'org_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: orgRoleEnum('role').notNull().default('member'),
    // SHA-256 do token que vai no link. O token em claro só existe no e-mail —
    // um vazamento desta tabela não permite entrar em organização nenhuma.
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    // Um único convite em aberto por e-mail em cada organização: reconvidar
    // alguém que já foi convidado atualiza o convite existente em vez de
    // empilhar tokens válidos.
    uniqueIndex('org_invitations_pending_email_idx')
      .on(t.orgId, sql`lower(${t.email})`)
      .where(sql`${t.acceptedAt} is null`),
    index('org_invitations_org_idx').on(t.orgId),
  ],
)

// ─── Chaves da API pública ────────────────────────────────────────────────────
// Credencial de integração da organização (server/api/v1/*). É da empresa, não
// da pessoa: o proprietário emite e compartilha com a equipe ou com o TI do
// cliente, e todo consumo debita o saldo de créditos da organização.
//
// Só o proprietário emite (exigirDono), e só em plano cujo features.api é true.
// O plano é revalidado a cada requisição — a chave não é um passe permanente.
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Proprietário que emitiu a chave. jobs.user_id é NOT NULL, então toda
    // análise criada pela API é atribuída a ele — o extrato continua tendo um
    // responsável mesmo quando a chave está compartilhada com a equipe inteira.
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Rótulo escolhido pelo cliente ("ERP do cartório"), para ele saber qual
    // integração revogar sem ter de adivinhar pelo prefixo.
    name: text('name').notNull(),
    // Os primeiros caracteres do token. É o único pedaço que a tela mostra
    // depois da emissão, e o identificador usado para revogar pelo terminal.
    prefix: text('prefix').notNull(),
    // SHA-256 do token inteiro. O token em claro existe uma única vez, na
    // resposta da criação: um vazamento desta tabela não autentica ninguém.
    keyHash: text('key_hash').notNull().unique(),
    // Precisão de minuto basta (ver requireApiKey): serve para o dono saber se
    // a integração está viva, não para auditar chamada por chamada.
    lastUsedAt: timestamp('last_used_at'),
    // NOT NULL de propósito: chave sem prazo é chave que nunca é rotacionada.
    expiresAt: timestamp('expires_at').notNull(),
    // Revogação preenche a data em vez de apagar a linha — o histórico de quem
    // emitiu o que continua existindo depois de a chave morrer.
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  // O teto de chaves ativas por organização é regra de aplicação, não de banco:
  // a contagem depende de revoked_at e expires_at, que mudam com o tempo.
  (t) => [index('api_keys_org_idx').on(t.orgId)],
)

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: jobTypeEnum('type').notNull(),
    status: jobStatusEnum('status').notNull().default('pending'),
    stage: jobStageEnum('stage'),
    stageData: jsonb('stage_data').$type<Record<string, unknown>>(),
    inputMeta: jsonb('input_meta').$type<Record<string, unknown>>(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    // Atualizado automaticamente ($onUpdate) a cada UPDATE — o watchdog usa
    // esta coluna (não createdAt) para medir jobs presos, já que um pipeline
    // de matrícula legitimamente em andamento segue avançando de etapa.
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
    completedAt: timestamp('completed_at'),
  },
  (t) => [index('jobs_org_id_idx').on(t.orgId), index('jobs_status_idx').on(t.status)],
)

// ─── Job Files (armazenamento temporário do binário) ──────────────────────────

export const jobFiles = pgTable('job_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  gcsPath: text('gcs_path').notNull(),
  mimeType: text('mime_type').notNull(),
  originalName: text('original_name').notNull(),
  accessToken: text('access_token').notNull().unique(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ─── Planos, assinaturas e créditos ───────────────────────────────────────────

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  monthlyPriceCents: integer('monthly_price_cents').notNull(),
  annualPriceCents: integer('annual_price_cents').notNull(),
  creditsPerCycle: integer('credits_per_cycle').notNull(),
  maxUsers: integer('max_users').notNull().default(1),
  // Vitrine do plano, na mesma linguagem da página pública: `specs` é a lista de
  // franquia (matrículas, croquis, usuários, valor do excedente) e `destaque`
  // marca o plano recomendado. A conversão da franquia em `creditsPerCycle` está
  // documentada na migration 0012.
  //
  // `ferramentas` é entitlement, não vitrine: é a lista de tipos de job que o
  // plano libera (migration 0013). Quem resolve o acesso é
  // apps/web/server/lib/planAccess.ts — nenhuma tela deve decidir sozinha.
  features: jsonb('features').$type<{
    resumo?: string
    specs?: string[]
    destaque?: boolean
    ferramentas?: (typeof jobTypeEnum.enumValues)[number][]
    // Plano negociado caso a caso (Enterprise): não tem preço de tabela e não
    // pode ser assinado pelo autoatendimento. Preço, franquia e teto de usuários
    // valem como referência do contrato-padrão; quem coloca um cliente nele é o
    // admin da plataforma, não o checkout.
    sobContrato?: boolean
    // Libera a API pública (server/api/v1/*). É entitlement, não vitrine: a
    // string "Acesso à API" que aparece em `specs` é copy da landing e não
    // decide nada. Quem resolve é planoLiberaApi() em server/lib/planAccess.ts,
    // consultado a cada requisição da API — assim rebaixar o plano corta o
    // acesso na hora, sem depender de revogar chave (migration 0019).
    api?: boolean
    // Libera exportar o parecer em Word (/api/jobs/:id/docx e o lote). Mesma
    // natureza do `api`: a string "White-label e DOCX" que aparece em `specs`
    // é copy da landing desde a 0018 e não decide nada. Quem resolve é
    // planoLiberaDocx(), consultado a cada exportação — rebaixar o plano corta
    // o acesso na hora (migration 0020). Ausência vale como false, então plano
    // novo nasce sem DOCX.
    docx?: boolean
  }>(),
})

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  status: subscriptionStatusEnum('status').notNull().default('trialing'),
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('subscriptions_org_id_idx').on(t.orgId)])

// Ledger append-only: o saldo de uma organização é SUM(delta) das suas linhas
export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  reason: creditReasonEnum('reason').notNull(),
  jobId: uuid('job_id').references(() => jobs.id),
  // Referência externa (ex.: id do invoice no Stripe) — o UNIQUE torna o webhook
  // idempotente: reenvio do mesmo evento não credita duas vezes
  providerRef: text('provider_ref').unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('credit_tx_org_id_idx').on(t.orgId),
  // No máximo um estorno por job — torna refundJobCredits idempotente mesmo sob corrida
  uniqueIndex('credit_tx_one_refund_per_job_idx').on(t.jobId).where(sql`${t.reason} = 'refund'`),
])

// ─── Custos operacionais (para o painel de custos do admin) ───────────────────
// Linhas de custo além do consumo de modelos: hospedagem, impostos, salários,
// ferramentas, etc. `category` e `period` são texto livre de propósito — a
// interface é aberta a novos tipos de custo sem exigir migração de enum.
export const operationalCosts = pgTable('operational_costs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: text('category').notNull().default('outros'),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('BRL'),
  // 'mensal' | 'anual' | 'unico' — livre; a UI normaliza para custo mensal
  period: text('period').notNull().default('mensal'),
  active: boolean('active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  orgMembers: many(orgMembers),
  jobs: many(jobs),
  termsAcceptances: many(termsAcceptances),
}))

export const termsAcceptancesRelations = relations(termsAcceptances, ({ one }) => ({
  user: one(users, { fields: [termsAcceptances.userId], references: [users.id] }),
}))

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  members: many(orgMembers),
  invitations: many(orgInvitations),
  jobs: many(jobs),
  owner: one(users, { fields: [organizations.ownerId], references: [users.id] }),
  subscriptions: many(subscriptions),
  creditTransactions: many(creditTransactions),
  apiKeys: many(apiKeys),
}))

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  org: one(organizations, { fields: [apiKeys.orgId], references: [organizations.id] }),
  creator: one(users, { fields: [apiKeys.createdBy], references: [users.id] }),
}))

export const orgInvitationsRelations = relations(orgInvitations, ({ one }) => ({
  org: one(organizations, { fields: [orgInvitations.orgId], references: [organizations.id] }),
  inviter: one(users, { fields: [orgInvitations.invitedBy], references: [users.id] }),
}))

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  org: one(organizations, { fields: [subscriptions.orgId], references: [organizations.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
}))

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  org: one(organizations, { fields: [creditTransactions.orgId], references: [organizations.id] }),
  job: one(jobs, { fields: [creditTransactions.jobId], references: [jobs.id] }),
}))

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  org: one(organizations, { fields: [jobs.orgId], references: [organizations.id] }),
  user: one(users, { fields: [jobs.userId], references: [users.id] }),
  files: many(jobFiles),
}))

export const jobFilesRelations = relations(jobFiles, ({ one }) => ({
  job: one(jobs, { fields: [jobFiles.jobId], references: [jobs.id] }),
}))
