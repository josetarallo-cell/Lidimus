-- API pública v1: credencial de integração e o entitlement que a libera.
--
-- Duas coisas, porque uma não serve sem a outra: a tabela onde as chaves vivem
-- e a marca no plano que autoriza emitir chave. Os cards do Escritório e do
-- Enterprise vendem "Acesso à API" desde a 0012, mas isso era copy de vitrine —
-- não existia rota, nem credencial, nem forma de dizer "este plano tem API".
--
-- `features.api` é entitlement, no mesmo espírito de `features.ferramentas` da
-- 0013: quem decide acesso é o dado, nunca uma comparação por nome de plano no
-- código. Ausência da chave vale como false — planos que não a têm ficam de fora
-- sem precisar de linha explícita, e um plano novo nasce sem API por padrão.
--
-- Sobre a chave em si: o banco guarda apenas o SHA-256 do token, então um
-- vazamento desta tabela não autentica ninguém. `expires_at` é NOT NULL de
-- propósito — chave sem prazo é chave que nunca é rotacionada. A revogação
-- preenche `revoked_at` em vez de apagar a linha, para o histórico de quem
-- emitiu o que sobreviver à morte da chave.
--
-- `created_by` é ON DELETE restrict: a análise criada pela API é atribuída a
-- quem emitiu a credencial (jobs.user_id é NOT NULL), então excluir esse usuário
-- exige antes decidir o que fazer com as chaves dele.
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("org_id");--> statement-breakpoint

-- Liga a API nos dois planos que a anunciam. Pelos ids fixos, nunca por nome:
-- `name` é editável no painel e um rename de vitrine não pode desligar o acesso
-- de quem paga por ele.
UPDATE "plans"
	SET "features" = jsonb_set(COALESCE("features", '{}'::jsonb), '{api}', 'true')
	WHERE "id" IN (
		'a1000000-0000-4000-8000-000000000003',  -- Escritório
		'a1000000-0000-4000-8000-000000000005'   -- Enterprise
	);
