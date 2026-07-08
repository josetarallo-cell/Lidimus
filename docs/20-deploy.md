# Deploy na VPS

Passo a passo para colocar (ou atualizar) o Lidimus em produção usando `docker-compose.prod.yml`.

Diferenças em relação ao ambiente local:

| | Local (`docker-compose.yml`) | Produção (`docker-compose.prod.yml`) |
|---|---|---|
| Imagens de `web`/`worker` | build local a cada `up --build` | imagens pré-construídas `lidimus-web:latest` / `lidimus-worker:latest` |
| Arquivo de env | `.env` | `.env.prod` |
| Redis | sem senha | `--requirepass ${REDIS_PASSWORD}` |
| Portas expostas | postgres/redis/web/n8n | só `web` na 3000 |
| n8n | serviço incluso | **não incluso** — usa o n8n externo definido em `N8N_BASE_URL` |

## 1. Preparar o servidor (primeira vez)

- Docker + Docker Compose instalados
- Clonar o repositório: `git clone https://github.com/josetarallo-cell/Lidimus.git`
- Criar `lidimus-saas/.env.prod` (não versionado — copie de `.env.example` e ajuste):
  - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (usados pelo `docker-compose.prod.yml` para o container `postgres`)
  - `REDIS_PASSWORD` (o compose de prod exige senha no Redis)
  - `DATABASE_URL=postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>`
  - `REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379`
  - `BETTER_AUTH_URL` e `PUBLIC_BASE_URL` apontando para o domínio público real (ex.: `https://app.lidimus.com`) — o n8n usa `PUBLIC_BASE_URL` para baixar arquivos e enviar o callback, então precisa ser alcançável pela internet
  - `N8N_BASE_URL` + os 5 `N8N_*_WEBHOOK_PATH` do n8n de produção
  - `N8N_CALLBACK_SECRET` — deve ser **idêntico** ao configurado nos workflows do n8n
  - `GOOGLE_CLOUD_SA_KEY_JSON`, `GOOGLE_CLOUD_PROJECT_ID`, `GCS_BUCKET_NAME`
- Configurar firewall e SSL — ver [50-seguranca.md](50-seguranca.md)

## 2. Build das imagens

As imagens não são construídas pelo `docker-compose.prod.yml` — precisam existir antes. Duas formas:

**A) Build direto na VPS** (mais simples, sem registry):

```bash
cd lidimus-saas
docker build -f apps/web/Dockerfile -t lidimus-web:latest .
docker build -f packages/workers/Dockerfile -t lidimus-worker:latest .
```

**B) Build local + push para um registry**, se preferir não compilar na VPS:

```bash
docker build -f apps/web/Dockerfile -t <seu-registry>/lidimus-web:latest .
docker push <seu-registry>/lidimus-web:latest
# repetir para o worker, e trocar a imagem no docker-compose.prod.yml
```

## 3. Subir os serviços

```bash
cd lidimus-saas
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Confira:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f worker
```

## 4. Rodar migrations em produção

O banco de produção também precisa das migrations do Drizzle. Rode a partir de uma máquina com acesso ao `DATABASE_URL` de produção (ou de dentro do container, se preferir empacotar o `packages/db`):

```bash
cd lidimus-saas
DATABASE_URL=<url de produção> pnpm --filter db migrate
```

Nunca edite uma migration já aplicada em produção — crie uma nova (`pnpm db:generate` após alterar `packages/db/src/schema.ts`). Ver [30-banco-de-dados.md](30-banco-de-dados.md).

## 5. Deploy de uma atualização (fluxo comum do dia a dia)

```bash
git pull
cd lidimus-saas
docker build -f apps/web/Dockerfile -t lidimus-web:latest .
docker build -f packages/workers/Dockerfile -t lidimus-worker:latest .
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d web worker
# se houve mudança de schema:
DATABASE_URL=<url de produção> pnpm --filter db migrate
```

`postgres` e `redis` normalmente não precisam ser recriados num deploy — só `web`/`worker` mudam de imagem.

## 6. Escalar (Fase 3)

**Workers:** BullMQ suporta múltiplos consumidores na mesma fila sem duplicar jobs. Em `.env.prod`:

```bash
WORKER_REPLICAS=3          # réplicas do serviço worker (deploy.replicas do compose)
WORKER_CONCURRENCY=5       # opcional: override global da concorrência por processo
                           # (defaults por fila: injection/kml 10, ocr/doc 5, juridico 3)
```

⚠️ Antes de aumentar a vazão total (réplicas × concorrência), confirme o throughput que o n8n
externo sustenta — o gargalo apenas muda de lugar.

**PgBouncer:** cada réplica de `web`/`worker` abre um pool próprio de 10 conexões no Postgres.
A partir de ~3 réplicas, ative o PgBouncer (já definido no compose de prod, modo transaction):

1. Em `.env.prod`, troque o host do banco e desligue prepared statements (obrigatório no modo
   transaction — o driver `postgres` os usa por padrão):
   ```bash
   DATABASE_URL=postgresql://<user>:<senha>@pgbouncer:5432/<db>
   DB_DISABLE_PREPARE=true
   ```
2. `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d pgbouncer web worker`

**Web (N réplicas):** as sessões vivem no Postgres (better-auth) — o `web` é stateless e pode
rodar com múltiplas réplicas atrás de um load balancer (nginx/Caddy/Traefik com `upstream` para
as portas de cada réplica). Nesse caso remova o mapeamento fixo `3000:3000` e deixe o proxy
resolver os containers pelo nome do serviço na rede do compose.

## 7. Reverter um deploy problemático

Como as imagens são taggeadas só como `:latest`, não há rollback automático por tag. Antes de sobrescrever `:latest`, marque a imagem atual:

```bash
docker tag lidimus-web:latest lidimus-web:antes-do-deploy
docker tag lidimus-worker:latest lidimus-worker:antes-do-deploy
```

Para reverter:

```bash
docker tag lidimus-web:antes-do-deploy lidimus-web:latest
docker tag lidimus-worker:antes-do-deploy lidimus-worker:latest
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d web worker
```

## Checklist de deploy

- [ ] `.env.prod` revisado (segredos não default, URLs de produção)
- [ ] Imagem anterior taggeada para rollback
- [ ] Build das novas imagens sem erros
- [ ] Migrations aplicadas, se houver
- [ ] `docker compose ps` — todos `Up`/`healthy`
- [ ] `docker compose logs worker --tail 30` sem erro de env var ou crash loop
- [ ] Testar upload de um documento e conferir se o job conclui (fluxo completo web → n8n → callback)
- [ ] `/admin/queues` sem jobs travados em `failed`
