# Arquitetura

Visão geral do sistema Lidimus: o que roda onde, como os dados fluem e o que cada peça faz.

## Componentes

O código vive no monorepo pnpm em `lidimus-saas/`:

| Pacote | O que é |
|---|---|
| `apps/web` | App Nuxt 3 (SSR): landing, autenticação (better-auth), upload, páginas de resultado e API interna (`server/api/`) |
| `packages/db` | Schema Drizzle ORM (Postgres) + migrations |
| `packages/queue` | Definições das filas BullMQ e tipos de payload (compartilhado entre web e workers) |
| `packages/workers` | Consumidores das filas: pegam o job e disparam o webhook correspondente no n8n |

Fora do monorepo, na raiz do repositório:

- `n8n/` — exportações em JSON dos workflows do n8n (ex.: `lidimus-OCR`)
- `.claude/skills/` — skills de apoio ao desenvolvimento (não fazem parte do runtime)
- `lidimus-saas/apps/web/DESIGN.md` e `PRODUCT.md` — design system "A Prancha Viva" e definição de produto (fonte normativa do front-end)

## Containers e portas (desenvolvimento — `docker-compose.yml`)

| Serviço | Imagem | Porta | Volume | Observações |
|---|---|---|---|---|
| `postgres` | postgres:16-alpine | 5432 | `pgdata` | user/senha/db: `lidimus` |
| `redis` | redis:7-alpine | 6379 | `redisdata` | sem senha em dev |
| `web` | build local (`apps/web/Dockerfile`) | **3000** | — | Nuxt em produção (`node .output/server/index.mjs`) |
| `worker` | build local (`packages/workers/Dockerfile`) | — | — | consumidores BullMQ |
| `n8n` | n8nio/n8n | 5678 | `n8ndata` | opcional — ver nota abaixo |

**Nota sobre o n8n:** o compose define um serviço n8n, mas na prática o ambiente atual usa um **n8n externo** apontado por `N8N_BASE_URL` no `.env` (ex.: `https://n8n.gvlar.com`). Nesta máquina de desenvolvimento existem também containers `n8n` e `cloudflared` que pertencem a **outros projetos** (`PromptDetect` e `git\gvlar\n8n`) — não são gerenciados pelo compose do Lidimus.

Em produção (`docker-compose.prod.yml`): mesmos serviços, sem n8n, sem portas expostas para Postgres/Redis, Redis com senha, imagens pré-construídas `lidimus-web:latest` e `lidimus-worker:latest`, env em `.env.prod`. Ver [20-deploy.md](20-deploy.md).

## Fluxo de dados de uma análise

```
Usuário                Web (Nuxt)                 GCS          Postgres      Redis/BullMQ      Worker              n8n (externo)
  │  upload PDF/KML       │                        │               │              │               │                     │
  ├──────────────────────▶│ POST /api/matriculas   │               │              │               │                     │
  │                       ├─ salva arquivo ───────▶│               │              │               │                     │
  │                       ├─ cria job + job_file ─────────────────▶│              │               │                     │
  │                       ├─ enfileira ───────────────────────────────────────────▶               │                     │
  │◀── redireciona p/ página do job                │               │              │               │                     │
  │   (polling 3s em /api/jobs/:id)                │               │              ├── consome ───▶│                     │
  │                       │                        │               │              │               ├─ POST webhook ─────▶│
  │                       │                        │               │              │               │  (fileUrl,          │
  │                       │                        │◀── n8n baixa o arquivo via fileUrl ──────────────  callbackUrl)    │
  │                       │◀── POST /api/webhooks/n8n-callback (X-Lidimus-Secret ou HMAC) ─────────────────────────────┤
  │                       ├─ atualiza job (result/stage/erro) ────▶│              │               │                     │
```

Detalhes importantes:

- **Arquivos**: o binário vai para o bucket GCS (`GCS_BUCKET_NAME`, padrão `lidimus-job-files`). O n8n baixa via `PUBLIC_BASE_URL/api/jobs/:id/file?token=<accessToken>` — por isso o `PUBLIC_BASE_URL` precisa ser alcançável pelo n8n. Após o uso o arquivo é soft-deletado (`job_files.deleted_at`).
- **Matrícula é um pipeline de 3 etapas encadeadas** — `ocr` → `juridico` → `doc`. Cada callback do n8n conclui uma etapa e o sistema enfileira a próxima; o progresso fica em `jobs.stage` / `jobs.stage_data`.
- **Callback autenticado**: o n8n envia `X-Lidimus-Secret` (ou `X-Lidimus-Signature` HMAC-SHA256) validado contra `N8N_CALLBACK_SECRET`.

## Filas BullMQ

`matricula-ocr`, `matricula-juridico`, `matricula-doc`, `kml`, `injection`.
Configuração padrão: 3 tentativas, backoff exponencial de 5 s, guarda 100 concluídos / 50 falhos.
Monitoramento: página `/admin/queues` no app web.

## Banco de dados (tabelas principais)

- `users`, `sessions`, `accounts`, `verifications` — better-auth (login por e-mail/senha); `users.is_platform_admin` controla acesso às telas `/admin/*` (promoção manual — ver [30-banco-de-dados.md](30-banco-de-dados.md))
- `organizations`, `org_members` — multi-tenant (todo job pertence a uma org)
- `jobs` — uma análise: `type` (matricula/kml/injection), `status` (pending/queued/processing/done/error), `stage`, `result` (JSONB), `error_message`
- `job_files` — ponteiro para o arquivo no GCS + `access_token` de download

## Variáveis de ambiente (resumo)

Ver `lidimus-saas/.env.example` para a lista completa. As críticas:

| Variável | Para quê |
|---|---|
| `DATABASE_URL`, `REDIS_URL` | conexões (hostnames `postgres`/`redis` dentro do compose; `localhost` para dev fora do Docker) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | autenticação |
| `N8N_BASE_URL` + `N8N_*_WEBHOOK_PATH` (5) | endereço dos workflows no n8n |
| `N8N_CALLBACK_SECRET` | segredo compartilhado web ↔ n8n |
| `PUBLIC_BASE_URL` | URL pública do web (n8n usa para baixar arquivo e responder) |
| `GOOGLE_CLOUD_SA_KEY_JSON`, `GCS_BUCKET_NAME` | armazenamento de arquivos |
| `UPLOAD_RATE_LIMIT_PER_HOUR` (padrão 20), `MAX_UPLOAD_SIZE_MB` (padrão 25) | limites por organização nos endpoints de upload (429/413) |

## Healthchecks

- `web`: endpoint `GET /api/health` (checa Postgres com `select 1` e Redis com `ping`), usado pelo `healthcheck` do compose e pelo `HEALTHCHECK` do Dockerfile.
- `worker`: sem porta HTTP — o processo toca um arquivo de heartbeat a cada 15 s (`WORKER_HEARTBEAT_PATH`, padrão `/tmp/worker-heartbeat`) e `packages/workers/healthcheck.js` valida que o arquivo foi tocado há menos de 60 s.
- `docker compose ps` deve mostrar `healthy` para `postgres`, `redis`, `web` e `worker`.
