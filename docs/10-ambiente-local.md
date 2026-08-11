# Ambiente local

Como subir o Lidimus do zero nesta máquina (Windows + Docker Desktop).

> **Este documento descreve o ambiente de PRODUÇÃO.** O `docker-compose.yml` e o `.env` tratados aqui são os que servem `https://lidimus.gvlar.com` — o compose inclui o `cloudflared`, que publica o container `web` na internet. Para desenvolver sem tocar no site no ar, use o ambiente paralelo descrito em **[15-sandbox.md](15-sandbox.md)**.

## Pré-requisitos

- Docker Desktop rodando
- Node.js ≥ 20 e pnpm ≥ 9 (só necessário se for rodar o `web` fora do Docker, em modo dev)
- Um n8n acessível com os 6 workflows publicados (externo — ver [00-arquitetura.md](00-arquitetura.md)), **ou** aceitar que os fluxos de análise não vão completar

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

Se `PUBLIC_BASE_URL` for um domínio público (é o caso aqui: o `cloudflared` publica o container em `https://lidimus.gvlar.com`), mantenha também `BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000`. O Better Auth deriva as origens confiáveis do `PUBLIC_BASE_URL`, e sem essa linha login e cadastro em `http://localhost:3000` respondem 403 `Invalid origin` antes mesmo de checar a senha.

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

## Modo hot-reload contra produção (`dev:local`)

> Para **desenvolver**, o modo certo é `pnpm dev:sandbox` ([15-sandbox.md](15-sandbox.md)): banco, fila e bucket próprios. O `dev:local` abaixo aponta para produção e existe para hotfix e diagnóstico — quando você precisa ver o dado real.

Rebuildar a cada mudança de CSS/Vue é lento. Para iterar rápido:

```powershell
cd lidimus-saas
pnpm dev:local
```

Sobe o Nuxt em modo dev **na porta 3001**, em paralelo com os containers — o `web` continua no ar servindo o domínio público pelo túnel. Salvou o arquivo, a página reflete; nada de rebuild.

O que o `scripts/dev-local.mjs` ajusta em cima do `.env` (o resto — segredos, chave do GCS, `PUBLIC_BASE_URL` — continua vindo de lá, sem cópia paralela para sair de sincronia):

| Variável | Por quê |
|---|---|
| `DATABASE_URL`, `REDIS_URL` | O `.env` usa os hostnames da rede do Docker (`postgres`, `redis`), que não resolvem no host — viram `127.0.0.1`, nas portas publicadas pelo compose |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Sem a origem `http://localhost:3001` na lista, login e cadastro respondem 403 `Invalid origin` |
| `NUXT_PORT` | 3001, para não brigar com o container |

Funciona porque o c12 (carregador de `.env` do Nuxt) não sobrescreve variável que já existe no `process.env`.

**O dev server compartilha o banco, o Redis e o GCS com a produção.** Não é um sandbox: conta criada ali é conta no site público, e job enviado ali é processado pelo mesmo `worker`. O n8n consegue baixar o arquivo e devolver o callback porque `PUBLIC_BASE_URL` continua apontando para o domínio. Um sandbox de verdade — banco, fila e bucket próprios, sem túnel — é o de [15-sandbox.md](15-sandbox.md).

Duas coisas que só funcionam na 3000/domínio, porque o `baseURL` do Better Auth é o domínio público: **login com Google** (o redirect volta para o domínio) e o Nitro em modo produção. Login por e-mail/senha funciona normalmente na 3001.

Terminou de iterar? `Ctrl+C` no dev server e publique de fato:

```powershell
docker compose up -d --build web
```

## Verificação visual sem MCP Playwright

Se precisar tirar screenshots do app para conferir UI e o MCP do Playwright não estiver configurado, instale `playwright-core` num diretório temporário e use `chromium.launch({ channel: 'chrome' })` — reaproveita o Chrome já instalado, sem precisar baixar browsers. Evite `chrome.exe --headless --screenshot` reutilizando o mesmo `--user-data-dir` entre capturas: ele pode servir um bundle Vite em cache e a mudança "não aparece".
