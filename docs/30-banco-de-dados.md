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
| `organizations`, `org_members` | organizações — todo `job` pertence a uma org |
| `jobs` | cada análise enviada: `type`, `status`, `stage`, `result` (JSONB), `error_message` |
| `job_files` | arquivo original no GCS (`gcs_path`) + `access_token` de download temporário |

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

Migrations existentes até agora: `0000_nervous_khan` (schema inicial), `0001_job_files_gcs`, `0002_job_stages`, `0003_add_is_platform_admin` (coluna `users.is_platform_admin`), `0004_email_verified_boolean` (`users.email_verified` de timestamp para boolean — o better-auth trata o campo como boolean e o tipo antigo quebrava o cadastro).

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
