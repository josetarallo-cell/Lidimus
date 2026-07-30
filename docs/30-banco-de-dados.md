# Banco de dados

Postgres 16, acessado via Drizzle ORM (`packages/db`). Este documento cobre acesso, consultas, migrations, backup e restore.

## Acesso rápido

**Via psql dentro do container (dev, credenciais `lidimus`/`lidimus`/`lidimus`):**

```powershell
docker exec -it lidimus-saas-postgres-1 psql -U lidimus -d lidimus
```

**Via cliente externo (DBeaver, TablePlus, psql local):**

```
host: localhost
port: 5432
user: lidimus
password: lidimus
database: lidimus
```

Em produção, use as credenciais de `.env.prod` (`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`) — a porta do Postgres **não** é exposta publicamente pelo `docker-compose.prod.yml`, então o acesso externo exige túnel SSH:

```bash
ssh -L 5433:localhost:5432 usuario@servidor
# depois conectar seu cliente em localhost:5433
```

**Drizzle Studio** (navegador visual no schema, mais amigável que psql):

```powershell
cd lidimus-saas
pnpm db:studio
```

## Tabelas (visão rápida)

Schema completo em `packages/db/src/schema.ts`.

| Tabela | Papel |
|---|---|
| `users`, `sessions`, `accounts`, `verifications` | autenticação (better-auth) |
| `organizations`, `org_members` | organizações — todo `job` pertence a uma org. **Uma pessoa pertence a exatamente uma organização**: o aceite de convite dissolve a organização pessoal do convidado, migrando análises e créditos. `role` ∈ owner (paga a conta) / member (cria análises) / reader (só consulta); `title` é o cargo em texto livre que o dono escolhe ("escrevente", "corretor") e não afeta permissão |
| `org_invitations` | convites de equipe: `token_hash` (SHA-256 do token do link), `expires_at`, `accepted_at`; índice parcial garante um convite aberto por e-mail em cada org |
| `jobs` | cada análise enviada: `type`, `status`, `stage`, `result` (JSONB), `error_message` |
| `job_files` | arquivo original no GCS (`gcs_path`) + `access_token` de download temporário |
| `plans` | catálogo de planos (preço mensal/anual em centavos, créditos por ciclo, `max_users`) — seed na migration 0005; `max_users` é aplicado em `server/lib/orgSeats.ts` (convite e troca de plano). `features.sobContrato` marca planos negociados (Enterprise): preço 0, recusados pelo checkout e pela troca de plano, aplicados só por `POST /api/admin/clients/[orgId]/plan` |
| `subscriptions` | assinatura por org: status, `provider_customer_id`/`provider_subscription_id` (Stripe), fim do período |
| `credit_transactions` | ledger append-only de créditos — saldo = `SUM(delta)` por org; `reason` ∈ signup_grant/purchase/consumption/refund/admin_adjustment |

## Créditos: consultas úteis

Saldo por organização:

```sql
select o.name, coalesce(sum(ct.delta), 0) as saldo
from organizations o
left join credit_transactions ct on ct.org_id = o.id
group by o.id, o.name
order by saldo;
```

Jobs consumidos sem estorno apesar de erro (não deveria retornar nada — o estorno é automático):

```sql
select j.id, j.type, j.status
from jobs j
join credit_transactions c on c.job_id = j.id and c.reason = 'consumption'
where j.status = 'error'
  and not exists (select 1 from credit_transactions r where r.job_id = j.id and r.reason = 'refund');
```

## Consultas úteis

Análises que falharam nas últimas 24h:

```sql
select id, type, status, error_message, created_at
from jobs
where status = 'error' and created_at > now() - interval '24 hours'
order by created_at desc;
```

Jobs travados em processamento há mais de 30 minutos (candidatos a investigar filas presas):

```sql
select id, type, stage, created_at
from jobs
where status in ('queued', 'processing')
  and created_at < now() - interval '30 minutes'
order by created_at;
```

Arquivos ainda não limpos (não soft-deletados) de jobs já concluídos:

```sql
select jf.id, jf.gcs_path, j.status
from job_files jf
join jobs j on j.id = jf.job_id
where jf.deleted_at is null and j.status in ('done', 'error');
```

## Migrations (Drizzle)

Fluxo para alterar o schema:

1. Edite `packages/db/src/schema.ts`.
2. Gere a migration:
   ```powershell
   cd lidimus-saas
   pnpm db:generate
   ```
   Isso cria um novo arquivo SQL em `packages/db/drizzle/` (ex.: `0003_algo.sql`) e atualiza `drizzle/meta/_journal.json`.
3. Revise o SQL gerado antes de aplicar — o Drizzle às vezes propõe `DROP`/`RENAME` quando a intenção era outra.
4. Aplique:
   ```powershell
   pnpm db:migrate
   ```
   Isso roda `packages/db/src/migrate.ts` contra o `DATABASE_URL` do `.env` (ou da env atual do processo).

**Regra de ouro:** nunca edite manualmente uma migration já aplicada em qualquer ambiente (nem local, nem produção) — o Drizzle rastreia migrations aplicadas por nome de arquivo e hash; editar depois do fato causa dessincronia. Se errou algo, gere uma nova migration corretiva.

Migrations existentes até agora: `0000_nervous_khan` (schema inicial), `0001_job_files_gcs`, `0002_job_stages`, `0003_add_is_platform_admin` (coluna `users.is_platform_admin`), `0004_email_verified_boolean` (`users.email_verified` de timestamp para boolean — o better-auth trata o campo como boolean e o tipo antigo quebrava o cadastro), `0005_billing_credits` (tabelas `plans`/`subscriptions`/`credit_transactions` + seed dos 3 planos), `0006_wealthy_shotgun` (índice único parcial — no máximo um estorno por job), `0007_eager_sue_storm` (`credit_transactions.provider_ref` UNIQUE — idempotência do webhook do Stripe), `0008_productive_rumiko_fujikawa` (tabela `operational_costs`), `0009_croqui_job_type` (valor `croqui` nos enums `job_type`/`job_stage`), `0010_dashing_mantis` (`jobs.updated_at` + índice único de um owner por usuário em `org_members`), `0011_magical_obadiah_stane` (`users.welcomed` — boas-vindas do primeiro acesso já vistas), `0012_planos_landing_2026` (tabela de planos Croqui/Essencial/Profissional/Escritório), `0013_niveis_acesso_planos` (`plans.features.ferramentas` como fonte do nível de acesso), `0014_convites_equipe` (tabela `org_invitations` + `users.company` — multiusuário nos planos Profissional e Escritório), `0015_papeis_equipe` (papel `reader`, `org_members.title` para o cargo livre, remoção de `users.active_org_id` e consolidação das organizações duplicadas do modelo anterior), `0016_plano_enterprise` (quinto plano, sob contrato — sem preço de tabela e fora do autoatendimento).

> **Assinatura de contrato não renova sozinha.** O Enterprise entra sem `provider_subscription_id`, então o webhook do Stripe — que é quem credita a franquia a cada ciclo — nunca é disparado para ele. Os créditos do ciclo seguinte precisam ser lançados pelo painel admin (Plano de contrato ou Conceder créditos).

> Ao escrever migration à mão, confira o campo `when` em `drizzle/meta/_journal.json`: o migrator só aplica migrations com `when` **maior** que o da última já aplicada. Uma migration gerada depois de outra escrita com data futura é pulada em silêncio.

## Promover um administrador da plataforma

As telas `/admin/*` e a API `/api/admin/*` exigem `users.is_platform_admin = true`. Ainda não há UI de gestão de admins, então a promoção do primeiro admin é manual, via SQL:

```sql
update users set is_platform_admin = true where email = '<email>';
```

Vale a partir da requisição seguinte — o middleware de auth relê o usuário do banco a cada requisição, sem cache de sessão.

## Backup

**Dump completo (formato custom, recomendado — permite restore seletivo):**

```bash
docker exec lidimus-saas-postgres-1 pg_dump -U lidimus -d lidimus -F c -f /tmp/lidimus.dump
docker cp lidimus-saas-postgres-1:/tmp/lidimus.dump ./backup-$(date +%Y%m%d).dump
```

Em produção, troque `lidimus-saas-postgres-1` pelo nome real do container (`docker compose -f docker-compose.prod.yml ps`) e as credenciais de `.env.prod`.

**Dump simples em SQL (mais portátil, menos flexível no restore):**

```bash
docker exec lidimus-saas-postgres-1 pg_dump -U lidimus -d lidimus > backup-$(date +%Y%m%d).sql
```

**Automatizar backup diário (produção):** agende via cron na VPS chamando o comando de dump acima e enviando o arquivo para armazenamento externo (não deixe backups só no disco da própria VPS).

## Restore

**A partir do dump custom:**

```bash
docker cp backup-20260706.dump lidimus-saas-postgres-1:/tmp/restore.dump
docker exec lidimus-saas-postgres-1 pg_restore -U lidimus -d lidimus --clean --if-exists /tmp/restore.dump
```

**A partir do dump SQL:**

```bash
cat backup-20260706.sql | docker exec -i lidimus-saas-postgres-1 psql -U lidimus -d lidimus
```

⚠️ `--clean` remove os objetos existentes antes de recriar — rodar isso em produção apaga os dados atuais. Sempre confirme em qual ambiente está conectado antes de rodar um restore, e faça um dump do estado atual antes, por segurança.

## Resetar o banco local do zero

```powershell
cd lidimus-saas
docker compose down -v   # apaga o volume pgdata — só em dev!
docker compose up -d postgres redis
pnpm db:migrate
```
