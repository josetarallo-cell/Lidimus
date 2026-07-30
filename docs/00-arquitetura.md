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
  │   (SSE /api/jobs/:id/stream via Redis pub/sub; │               │              ├── consome ───▶│                     │
  │    fallback: polling 3s)                       │               │              │               │                     │
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

## API pública (v1)

`server/api/v1/matriculas` — enviar e consultar análises de matrícula a partir de
outro sistema. Autenticação por chave de integração (`Authorization: Bearer`),
escopada por organização, liberada apenas em plano com `features.api` (Escritório
e Enterprise). Detalhes de contrato, erros e limites em
[70-api-publica.md](70-api-publica.md).

Duas decisões estruturais valem registrar aqui:

- **A identidade da API é paralela à da sessão.** `server/middleware/auth.ts`
  continua servindo só o cookie; a v1 usa `server/lib/requireApiKey.ts`. Os dois
  mundos são estanques — a v1 não aceita cookie (logo não tem CSRF) e as rotas de
  sessão não aceitam chave (o raio de dano de uma chave vazada é só a v1).
- **A criação da análise é uma função, não uma rota.** Painel e API chamam
  `server/lib/criarAnaliseMatricula.ts`, onde vivem validação do arquivo,
  entitlement, limite de uso, débito de crédito e enfileiramento. A transação que
  cobra o cliente existe num lugar só; o que difere entre os dois caminhos é como
  se descobre a organização e qual limite se aplica.

## Banco de dados (tabelas principais)

- `users`, `sessions`, `accounts`, `verifications` — better-auth (login por e-mail/senha); `users.is_platform_admin` controla acesso às telas `/admin/*` (promoção manual — ver [30-banco-de-dados.md](30-banco-de-dados.md))
- `organizations`, `org_members`, `org_invitations` — multi-tenant (todo job pertence a uma org; a equipe entra por convite, com teto de usuários vindo de `plans.max_users`)
- `jobs` — uma análise: `type` (matricula/kml/injection), `status` (pending/queued/processing/done/error), `stage`, `result` (JSONB), `error_message`
- `job_files` — ponteiro para o arquivo no GCS + `access_token` de download
- `api_keys` — chaves da API pública, por organização: só o SHA-256 do token, mais `prefix` visível, `expires_at` (1 ano), `revoked_at` e `last_used_at`
- `plans`, `subscriptions`, `credit_transactions` — monetização (Fase 2): planos com preço/créditos por ciclo, assinatura Stripe por org, e ledger de créditos (saldo = SUM(delta); upload debita, erro estorna, webhook do Stripe credita a renovação)

## Créditos e assinaturas (Fase 2)

- Custo por análise: `base + perPage × páginas`, calibrado em `packages/db/src/credits.ts` — matrícula 83+8, croqui 12+3, verificação de PDF 3+0,5, memorial KML 50 fixo. Cadastro concede 150 créditos (`SIGNUP_GRANT_CREDITS`).
- Upload sem saldo → 402, sem criar job. O débito (`consumption`) entra na mesma transação que cria o job; job que termina em `error` recebe `refund` automático e idempotente (índice único parcial), tanto pelo callback do n8n quanto pelo handler `failed` dos workers.
- Stripe (checkout de assinatura, Customer Portal e webhook em `/api/webhooks/stripe`): preços enviados inline a partir da tabela `plans` — não é preciso cadastrar produtos no dashboard. `invoice.paid` credita `credits_per_cycle` (×12 no ciclo anual) com `provider_ref` único para reenvios não creditarem duas vezes.
- Páginas: `/conta` (perfil/senha/orgs), `/conta/creditos` (saldo + histórico), `/conta/assinatura` (planos/portal/migração); admin: `/admin/clientes` (saldo, conceder créditos, suspender) e `/admin/faturamento` (MRR, distribuição).
- **Migração de plano** (`/api/billing/change-plan`, botão "Alterar plano" em `/conta/assinatura`):
  **upgrade** vale na hora — cobra a diferença proporcional do ciclo (`proration_behavior:
  always_invoice`) e credita imediatamente a diferença de créditos (novo − atual, ×12 no anual);
  **downgrade** vale na próxima renovação — `proration_behavior: none`, sem cobrança/estorno, o
  usuário mantém preço e créditos do ciclo pago. O ciclo (mensal/anual) é preservado na troca.
  Antiabuso: o webhook só credita faturas `subscription_create`/`subscription_cycle` — a fatura
  proporcional do upgrade (`subscription_update`) não credita ciclo cheio (senão upgrade no fim do
  ciclo pagaria centavos por milhares de créditos); a diferença é creditada pelo próprio endpoint,
  com `provider_ref` idempotente. Assinatura cancelada volta a ver a grade de planos para assinar
  de novo.

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
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | pagamentos (Fase 2) — chaves de teste `sk_test_...`/`whsec_...` até existir conta definitiva; sem elas o app funciona e só o checkout responde 503 |
| `WORKER_CONCURRENCY`, `WORKER_REPLICAS` | escala dos workers (Fase 3) — ver [20-deploy.md](20-deploy.md) |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | rastreamento de erros em web e workers (Fase 3) — inativo se vazio |
| `DB_DISABLE_PREPARE` | `true` quando atrás de PgBouncer em modo transaction |
| `RESEND_API_KEY`, `EMAIL_FROM` | e-mail transacional (Fase 4 — recuperação de senha); sem chave, o link é logado no console |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | login com Google (Fase 4) — botão só aparece quando configurados |

## Healthchecks

- `web`: endpoint `GET /api/health` (checa Postgres com `select 1` e Redis com `ping`), usado pelo `healthcheck` do compose e pelo `HEALTHCHECK` do Dockerfile.
- `worker`: sem porta HTTP — o processo toca um arquivo de heartbeat a cada 15 s (`WORKER_HEARTBEAT_PATH`, padrão `/tmp/worker-heartbeat`) e `packages/workers/healthcheck.js` valida que o arquivo foi tocado há menos de 60 s.
- `docker compose ps` deve mostrar `healthy` para `postgres`, `redis`, `web` e `worker`.

## Observabilidade — rastreamento de erros (Sentry)

**Propósito.** Healthcheck diz se o processo está vivo; o Sentry diz **o que quebrou e por quê**.
Sem ele, um erro 500 no callback do n8n ou um worker falhando em silêncio só é percebido quando um
cliente reclama — caso real: o bug do `` no callback (jobs presos em `processing`) só foi
descoberto olhando manualmente uma execução no n8n; com o Sentry ativo, teria virado alerta por
e-mail com stack trace no instante da primeira ocorrência.

**Como funciona no Lidimus.** Integração via `@sentry/node`, ativada apenas quando `SENTRY_DSN`
existe no ambiente (sem a variável, nada é inicializado e nenhum dado sai da máquina):

- `web` (`apps/web/server/plugins/sentry.ts`): captura erros do servidor via hook `error` do Nitro.
  Erros 4xx são ignorados de propósito — 401/402/413/429 são regras de negócio funcionando, não
  defeitos; só falha real (5xx/exceção) vira evento.
- `workers` (`packages/workers/src/index.ts`): captura jobs que falharam com os retries esgotados
  (com nome da fila e `jobId` no contexto), erros de infraestrutura dos workers (ex.: Redis fora)
  e `unhandledRejection`/`uncaughtException` do processo.
- Cada evento carrega stack trace, rota/método (web) ou fila/job (worker) e o ambiente
  (`SENTRY_ENVIRONMENT`, padrão `NODE_ENV`).

**Plano em uso:** conta gratuita do sentry.io (~5 mil eventos/mês, 1 usuário) — suficiente até o
produto ter volume real. O plano pago (~US$ 26/mês) só se justifica com mais eventos ou mais
membros no time.

### Substituição por GlitchTip (ou Bugsink)

O GlitchTip é open-source e **fala o protocolo do Sentry** — o `@sentry/node` já instalado funciona
sem mudar uma linha de código; migrar é trocar o valor de `SENTRY_DSN` no `.env` e recriar os
containers. O mesmo vale para o Bugsink (self-hosted minimalista, 1 container).

| | Sentry.io (atual) | GlitchTip self-hosted |
|---|---|---|
| Custo | R$ 0 até ~5k eventos/mês; ~US$ 26/mês acima | só recursos da VPS (~1 GB RAM: web + worker + Postgres próprios) |
| Setup/manutenção | zero — SaaS | instalar, atualizar, fazer backup e monitorar você mesmo |
| Dados | nos servidores do Sentry (EUA) | na sua VPS — relevante se stack traces puderem conter dado sensível |
| Recursos | mais completo (release tracking, performance, replays) | essencial de captura de erros e alertas — suficiente para o caso do Lidimus |
| Risco | mudança de preço/limites do SaaS | você é o responsável pela disponibilidade da ferramenta que vigia as outras |

**Quando migrar:** se o tier gratuito estourar com frequência, se surgir exigência de manter dados
de erro em infraestrutura própria, ou se o custo do plano pago não se justificar. Até lá, o SaaS
gratuito é a opção de menor atrito.
