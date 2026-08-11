# Sandbox — desenvolver sem tocar em produção

O `docker-compose.yml` **não é um compose de dev**: ele inclui o serviço `cloudflared`, que publica o container `web` em `https://lidimus.gvlar.com`. O `.env` ao lado dele é o de produção. Consequência: `pnpm dev`, `pnpm dev:local` e qualquer `docker compose up` naquele arquivo mexem no site no ar — mesmo banco, mesma fila, mesmo bucket, mesmo Resend.

Este documento descreve o ambiente paralelo, isolado, para trabalhar em alterações de código.

## O que é isolado, o que é compartilhado

| | Produção | Sandbox |
|---|---|---|
| Projeto Compose | `lidimus-saas` | `lidimus-sandbox` |
| Arquivo | `docker-compose.yml` | `docker-compose.sandbox.yml` |
| Ambiente | `.env` | `.env.sandbox` |
| Postgres | 5432 (`lidimus-saas_pgdata`) | **5433** (`lidimus-sandbox_pgdata`) |
| Redis | 6379 | **6380** |
| Web | 3000 → `lidimus.gvlar.com` | **3100**, só localhost |
| Túnel Cloudflare | sim | **não existe** |
| Bucket GCS | `lidimus-job-files` | `lidimus-sandbox-files` |
| Resend / Stripe / Google OAuth / Sentry | ligados | **chaves vazias** — degradam para console/503/oculto |
| n8n | `n8n.gvlar.com` | **o mesmo** (ver abaixo) |

**O n8n é compartilhado de propósito.** Os workflows recebem `callbackUrl` e `fileUrl` pelo payload do webhook, então atendem o sandbox sem duplicação: o worker manda `http://host.docker.internal:3100/...` e o n8n — que roda em container nesta mesma máquina — alcança o processo local por esse endereço. O `N8N_CALLBACK_SECRET` do sandbox é diferente do de produção, então um callback que chegasse ao ambiente errado seria rejeitado.

A contrapartida: **cada teste ponta a ponta consome APIs pagas de verdade** (Document AI, Anthropic, Mistral, OpenAI, Google Maps). Iterar com PDFs de 1-2 páginas.

## Preparar (uma vez)

**1. Bucket GCS.** ✅ Já criado em 07/08/2026: `lidimus-sandbox-files` no projeto `gvlarproject`, espelhando o de produção — multi-região `US`, classe `STANDARD`, acesso uniforme no nível do bucket, lifecycle de exclusão em 7 dias.

Nada a fazer aqui, a menos que o bucket seja apagado. Se precisar recriá-lo, a própria service account do `GOOGLE_CLOUD_SA_KEY_JSON` tem permissão para isso — ela também assina as URLs v4 localmente, com a chave privada do JSON, então **não** é necessário o papel `Service Account Token Creator`.

**2. Ambiente.**

```powershell
cd lidimus-saas
copy .env.sandbox.example .env.sandbox
```

Preencher: `BETTER_AUTH_SECRET` e `N8N_CALLBACK_SECRET` (valores novos, não os de produção), `GOOGLE_CLOUD_PROJECT_ID` e `GOOGLE_CLOUD_SA_KEY_JSON` (copiar do `.env` — mesma service account). Deixar `RESEND_API_KEY`, `STRIPE_*`, `GOOGLE_CLIENT_*` e `SENTRY_DSN` **vazias**; é o que mantém o sandbox mudo para o mundo.

`.env.sandbox` está no `.gitignore`.

**3. Subir e migrar.**

```powershell
pnpm sandbox:up
pnpm sandbox:migrate
```

O banco nasce vazio; as migrations trazem os planos e o catálogo. Cadastre-se em <http://localhost:3100> (a verificação de e-mail está desligada) e, se quiser acesso a `/admin/*` e saldo folgado para testes:

```powershell
pnpm sandbox:seed voce@sandbox.local 5000
```

## Dois modos de trabalho

Os dois usam a **porta 3100**, então o `PUBLIC_BASE_URL` serve aos dois sem edição — só não podem estar de pé ao mesmo tempo.

**Iteração rápida (hot reload).** O padrão do dia a dia:

```powershell
pnpm sandbox:up postgres redis worker
pnpm dev:sandbox
```

**Validação de build.** Antes de considerar uma mudança pronta — o Dockerfile roda `nuxt build`, e erro de SSR/tipo só aparece aí:

```powershell
pnpm sandbox:up
pnpm sandbox:logs
```

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm sandbox:up` | Sobe (e rebuilda) tudo. Aceita nomes de serviço: `pnpm sandbox:up postgres redis worker` |
| `pnpm sandbox:down` | Para os containers, preserva os dados |
| `pnpm sandbox:reset` | Para **e apaga os volumes** — banco e fila do zero |
| `pnpm sandbox:logs` | `logs -f` de `web` e `worker` |
| `pnpm sandbox:migrate` | Migrations no banco do sandbox (127.0.0.1:5433) |
| `pnpm sandbox:seed <email> [créditos]` | Marca admin de plataforma e credita a organização |
| `pnpm dev:sandbox` | Nuxt com hot reload na 3100, contra o sandbox |

Todos passam `--env-file .env.sandbox` ou leem esse arquivo explicitamente. Os scripts em `scripts/sandbox-*.mjs` recusam rodar se a `DATABASE_URL` não apontar para a 5433, ou se algum valor de produção aparecer no `.env.sandbox`.

Acesso direto ao banco do sandbox:

```powershell
docker compose -f docker-compose.sandbox.yml --env-file .env.sandbox exec postgres psql -U lidimus -d lidimus
```

## O que o sandbox NÃO isola

1. **Custo das APIs do n8n** — os workflows são os de produção, com as credenciais de produção.
2. **Editar um workflow no n8n afeta produção na hora.** Duplicar/exportar antes. Os scripts em `rag/` que faziam `PUT` direto no workflow agora exigem `--confirmar-producao`, e aceitam `N8N_HOST` / `N8N_WORKFLOW_ID` / `QDRANT_COLLECTION` para apontar a outro alvo.
3. **Rebuild acidental de produção.** `docker compose up -d --build` no `docker-compose.yml` constrói a partir da árvore de trabalho — código não finalizado iria para o ar. Rebuildar produção só com a branch limpa.
4. **A service account do GCS é a mesma** nos dois ambientes; o isolamento é por bucket.

## Ainda preciso de acesso a produção

`pnpm dev:local` (porta 3001) continua existindo para isso: hot reload **contra o banco e a fila de produção**, sem derrubar o container que serve o domínio. É ferramenta de hotfix e diagnóstico, não de desenvolvimento — ver [10-ambiente-local.md](10-ambiente-local.md).

## Ver também

- [40-alteracoes-pontuais.md](40-alteracoes-pontuais.md) — o roteiro de hotfix, que passa por aqui antes de tocar produção
- [30-banco-de-dados.md](30-banco-de-dados.md) — os dois bancos (5432 vs. 5433), migrations e reset
- [90-troubleshooting.md](90-troubleshooting.md) — o prefixo `NUXT_`, o `ENOTFOUND postgres` e as travas dos scripts do `rag/`
- [20-deploy.md](20-deploy.md) — comparativo dos três composes e como publicar de verdade
