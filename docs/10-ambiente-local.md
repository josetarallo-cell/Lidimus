# Ambiente local

Como subir o Lidimus do zero nesta máquina (Windows + Docker Desktop).

## Pré-requisitos

- Docker Desktop rodando
- Node.js ≥ 20 e pnpm ≥ 9 (só necessário se for rodar o `web` fora do Docker, em modo dev)
- Um n8n acessível com os 5 workflows publicados (externo — ver [00-arquitetura.md](00-arquitetura.md)), **ou** aceitar que os fluxos de análise não vão completar

## 1. Configurar variáveis de ambiente

```powershell
cd lidimus-saas
copy .env.example .env
```

Edite `.env` e preencha pelo menos:

- `N8N_BASE_URL` e os `N8N_*_WEBHOOK_PATH` (endereço do seu n8n)
- `N8N_CALLBACK_SECRET` (qualquer string — precisa bater com o que os workflows do n8n usam)
- `GOOGLE_CLOUD_SA_KEY_JSON` e `GOOGLE_CLOUD_PROJECT_ID` (necessários para o worker subir — ver `packages/workers/src/index.ts`)
- `BETTER_AUTH_SECRET` — qualquer string de 32+ caracteres

`DATABASE_URL` e `REDIS_URL` já vêm certos para rodar tudo dentro do Docker (hostnames `postgres` e `redis`).

## 2. Subir os containers

```powershell
cd lidimus-saas
docker compose up -d --build
```

Isso sobe `postgres`, `redis`, `web` (porta 3000) e `worker`. Confira:

```powershell
docker compose ps
```

Todos devem estar `Up`/`healthy`. Se `worker` estiver em `Restarting`, veja os logs — normalmente é uma env var faltando:

```powershell
docker logs lidimus-saas-worker-1 --tail 30
```

## 3. Rodar as migrations

Na primeira subida, o banco está vazio. Rode as migrations do Drizzle:

```powershell
cd lidimus-saas
pnpm install
pnpm db:migrate
```

Isso executa `packages/db/src/migrate.ts` contra o `DATABASE_URL` do `.env`. Detalhes em [30-banco-de-dados.md](30-banco-de-dados.md).

## 4. Acessar

- App: http://localhost:3000
- Studio do Drizzle (navegador no banco): `pnpm db:studio` (a partir de `lidimus-saas/`)
- Filas: http://localhost:3000/admin/queues

## Comandos do dia a dia

| O que você quer | Comando |
|---|---|
| Ver status dos containers | `docker compose ps` (dentro de `lidimus-saas/`) |
| Ver logs do web | `docker logs lidimus-saas-web-1 -f` |
| Ver logs do worker | `docker logs lidimus-saas-worker-1 -f` |
| Reiniciar só o web | `docker compose restart web` |
| Aplicar mudança de código | `docker compose up -d --build web worker` (rebuild obrigatório — ver nota abaixo) |
| Parar tudo | `docker compose down` (mantém os volumes/dados) |
| Apagar tudo incluindo dados | `docker compose down -v` ⚠️ apaga o Postgres e o Redis |

### Gotcha: containers não sobem sozinhos após reiniciar o Docker Desktop

`web` e `worker` usam `restart: unless-stopped`. Se alguém parar esses containers manualmente (`docker stop` / `docker compose stop`), o Docker **não** os religa automaticamente quando o Docker Desktop reinicia — só `postgres` e `redis` voltam (eles não foram parados manualmente). Sintoma: `localhost:3000` não responde, mas Postgres/Redis parecem normais. Solução:

```powershell
cd lidimus-saas
docker compose up -d web worker
```

### Gotcha: código mudou mas o container não reflete

As imagens de `web` e `worker` são **construídas** a partir de uma cópia do código no momento do build — não montam a pasta local como volume. Qualquer alteração em `apps/web`, `packages/db`, `packages/queue` ou `packages/workers` exige rebuild:

```powershell
docker compose up -d --build web worker
```

## Modo de desenvolvimento com hot-reload (iterar em front-end)

Rebuildar a cada mudança de CSS/Vue é lento. Para iterar rápido, mantenha `postgres`/`redis` no Docker e rode o Nuxt fora, em modo dev:

```powershell
cd lidimus-saas
docker compose stop web      # libera a porta 3000
pnpm dev                     # dev server com hot reload, usa .env
```

Ao terminar, volte ao container publicando a versão final:

```powershell
docker compose up -d --build web
```

## Verificação visual sem MCP Playwright

Se precisar tirar screenshots do app para conferir UI e o MCP do Playwright não estiver configurado, instale `playwright-core` num diretório temporário e use `chromium.launch({ channel: 'chrome' })` — reaproveita o Chrome já instalado, sem precisar baixar browsers. Evite `chrome.exe --headless --screenshot` reutilizando o mesmo `--user-data-dir` entre capturas: ele pode servir um bundle Vite em cache e a mudança "não aparece".
