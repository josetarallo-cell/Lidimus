CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."credit_reason" AS ENUM('signup_grant', 'purchase', 'consumption', 'refund', 'admin_adjustment');--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"monthly_price_cents" integer NOT NULL,
	"annual_price_cents" integer NOT NULL,
	"credits_per_cycle" integer NOT NULL,
	"max_users" integer DEFAULT 1 NOT NULL,
	"features" jsonb,
	CONSTRAINT "plans_name_unique" UNIQUE("name")
);--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"current_period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "credit_reason" NOT NULL,
	"job_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_org_id_idx" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "credit_tx_org_id_idx" ON "credit_transactions" USING btree ("org_id");--> statement-breakpoint
INSERT INTO "plans" ("id", "name", "monthly_price_cents", "annual_price_cents", "credits_per_cycle", "max_users", "features") VALUES
	('a1000000-0000-4000-8000-000000000001', 'Amador', 2900, 29000, 500, 1, '{"historicoDias": 30, "suporte": "email"}'),
	('a1000000-0000-4000-8000-000000000002', 'Profissional', 14900, 149000, 5000, 1, '{"historicoDias": null, "suporte": "email", "processamentoPrioritario": true}'),
	('a1000000-0000-4000-8000-000000000003', 'Empresarial', 59900, 599000, 50000, 5, '{"historicoDias": null, "suporte": "dedicado", "processamentoPrioritario": true, "api": true}')
ON CONFLICT ("id") DO NOTHING;
