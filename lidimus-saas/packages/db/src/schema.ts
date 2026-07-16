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

export const orgRoleEnum = pgEnum('org_role', ['owner', 'member'])

export const jobTypeEnum = pgEnum('job_type', ['matricula', 'kml', 'injection'])

export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'queued',
  'processing',
  'done',
  'error',
])

// Etapas do pipeline de matrícula (jobs de outros tipos não usam stage)
export const jobStageEnum = pgEnum('job_stage', ['ocr', 'juridico', 'doc'])

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
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

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
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
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
  features: jsonb('features').$type<Record<string, unknown>>(),
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
}))

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  members: many(orgMembers),
  jobs: many(jobs),
  owner: one(users, { fields: [organizations.ownerId], references: [users.id] }),
  subscriptions: many(subscriptions),
  creditTransactions: many(creditTransactions),
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
