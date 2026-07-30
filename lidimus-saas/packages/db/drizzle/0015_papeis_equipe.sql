ALTER TYPE "public"."org_role" ADD VALUE 'reader';--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "title" text;--> statement-breakpoint
-- Consolida quem ficou com duas organizações no modelo antigo (a própria, criada
-- no cadastro, mais a da equipe que o convidou). Tudo que era da organização
-- pessoal passa para a organização em que a pessoa é membro, e a pessoal é
-- apagada — a mesma regra que o aceite de convite passa a aplicar.
--
-- Restrito a quem NÃO tem assinatura própria: mover uma organização que paga
-- exigiria decidir o que fazer com a cobrança, e isso não é trabalho de migration.
WITH duplicados AS (
  SELECT proprio.org_id AS org_pessoal, equipe.org_id AS org_equipe
  FROM org_members proprio
  JOIN org_members equipe
    ON equipe.user_id = proprio.user_id
   AND equipe.org_id <> proprio.org_id
   AND equipe.role <> 'owner'
  WHERE proprio.role = 'owner'
    AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.org_id = proprio.org_id)
),
jobs_movidos AS (
  UPDATE jobs j SET org_id = d.org_equipe FROM duplicados d WHERE j.org_id = d.org_pessoal RETURNING 1
),
creditos_movidos AS (
  UPDATE credit_transactions c SET org_id = d.org_equipe FROM duplicados d WHERE c.org_id = d.org_pessoal RETURNING 1
),
membros_removidos AS (
  DELETE FROM org_members m USING duplicados d WHERE m.org_id = d.org_pessoal RETURNING 1
)
DELETE FROM organizations o USING duplicados d WHERE o.id = d.org_pessoal;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "active_org_id";
