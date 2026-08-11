# Troubleshooting

Erros já vistos neste projeto e como resolver. Adicione uma entrada nova sempre que resolver algo que valha a pena não re-investigar do zero.

> Antes de diagnosticar, saiba em qual ambiente está: **3000 / 5432 / 6379 são produção**; 3100 / 5433 / 6380 são o sandbox ([15-sandbox.md](15-sandbox.md)). Containers `lidimus-saas-*` vs. `lidimus-sandbox-*`.

---

### `localhost:3000` não responde, mas o Docker parece normal

**Sintoma:** navegador não conecta na porta 3000; `docker ps` mostra `postgres` e `redis` `Up`/`healthy`, mas `web` e `worker` não aparecem na lista (ou aparecem parados).

**Causa:** `web` e `worker` usam `restart: unless-stopped`. Se foram parados manualmente em algum momento, não voltam sozinhos quando o Docker Desktop reinicia — só os serviços que não foram parados manualmente (`postgres`/`redis`) voltam.

**Solução:**
```powershell
cd lidimus-saas
docker compose up -d web worker
```

---

### Worker entra em loop de crash com `Error: Missing env var: ...`

**Sintoma:** `docker compose ps` mostra `lidimus-saas-worker-1` como `Restarting`. Logs mostram `Error: Missing env var: N8N_..._WEBHOOK_PATH` (ou similar) apontando para uma variável que não existe mais no `.env` atual.

**Causa comum:** a imagem do container está desatualizada — foi construída a partir de uma versão anterior do código que exigia uma variável diferente da atual. Rebuild resolve porque sincroniza o código validado dentro da imagem com o `.env` atual.

**Diagnóstico:**
```powershell
docker logs lidimus-saas-worker-1 --tail 30
```

**Solução:**
```powershell
cd lidimus-saas
docker compose up -d --build web worker
```

---

### Mudei o código (CSS, Vue, etc.) mas o Docker continua mostrando a versão antiga

**Causa:** as imagens de `web`/`worker` são construídas com uma cópia do código — não montam a pasta local como volume. Editar o arquivo local não afeta o container em execução.

**Solução:** rebuild:
```powershell
docker compose up -d --build web worker
```

**Alternativa mais rápida ao iterar em front-end:** rode o Nuxt em modo dev fora do Docker (hot-reload) e só publique no container quando terminar — `pnpm dev:sandbox` ([15-sandbox.md](15-sandbox.md)) para desenvolver, `pnpm dev:local` ([10-ambiente-local.md](10-ambiente-local.md)) só quando precisar ver o dado de produção.

---

### Container `web` sobe, mas todo endpoint devolve 500 com `DATABASE_URL not configured`

**Sintoma:** o container está `Up`, `docker exec ... env` mostra `DATABASE_URL` presente e correta, e mesmo assim o log repete `Error: DATABASE_URL not configured` (ou o app usa um valor antigo de outra variável).

**Causa:** o container roda o Nuxt **buildado**. O `nuxt.config.ts` foi executado no build, e cada `process.env.X` do `runtimeConfig` já virou valor fixo dentro do bundle. Em runtime, só `NUXT_<CHAVE>` sobrescreve — o nome sem prefixo é simplesmente ignorado. É por isso que o `docker-compose.yml` tem um bloco `environment:` remapeando `NUXT_DATABASE_URL`, `NUXT_REDIS_URL`, `NUXT_BETTER_AUTH_SECRET` e companhia.

**Solução:** garanta o par `NUXT_<CHAVE>` para toda variável que o `web` lê via `useRuntimeConfig()`. No sandbox esses pares moram no próprio `.env.sandbox`, e `pnpm sandbox:up` recusa subir se um deles divergir do valor sem prefixo.

**Não vale para o worker:** ele lê `process.env` direto (`packages/workers/src/index.ts`), pelos nomes sem prefixo. Os dois formatos coexistem porque servem a consumidores diferentes.

---

### Upload responde "Server Error" e o log mostra `The specified bucket does not exist` (404)

**Causa:** o `GCS_BUCKET_NAME` do ambiente aponta para um bucket que não existe. Visto em 07/08/2026 no sandbox, antes de `lidimus-sandbox-files` ser criado.

**Diagnóstico:** o log do `web` traz a URL completa da chamada ao Google, com o nome do bucket. Compare com `GCS_BUCKET_NAME` no `.env` do ambiente correspondente.

**Solução:** criar o bucket (a service account do `GOOGLE_CLOUD_SA_KEY_JSON` tem permissão), espelhando o de produção: multi-região `US`, `STANDARD`, acesso uniforme, lifecycle de 7 dias.

**Sobre os créditos:** o débito acontece **antes** do upload (`server/api/injection/index.post.ts` e equivalentes: transação de crédito → `storeJobFile` → enfileira). Falhando o upload, o job fica `pending` com os créditos já consumidos. Não é perda definitiva: o watchdog varre `pending`/`queued`/`processing` e, passado `STUCK_JOB_TIMEOUT_MINUTES`, marca como erro e estorna (`packages/workers/src/watchdog.ts`). São 60 min em produção e 180 no sandbox — o crédito volta, só não na hora.

---

### `pnpm dev:sandbox` falha com `getaddrinfo ENOTFOUND postgres`

**Causa:** alguma variável ainda carrega o hostname da rede do Docker (`postgres`, `redis`), que só resolve dentro do compose. Atenção ao par com prefixo: `NUXT_DATABASE_URL` vence `DATABASE_URL` no `runtimeConfig`, então traduzir só a versão sem prefixo não adianta.

**Solução:** `scripts/sandbox-env.mjs` traduz `@postgres:5432` → `@127.0.0.1:5433` e `//redis:6379` → `//127.0.0.1:6380` em **todas** as chaves antes de repassar ao Nuxt. Se o erro voltar, é sinal de que uma variável nova escapou dessa tradução.

---

### Um script do `rag/` recusa rodar pedindo `--confirmar-producao`

**Não é bug.** `push-workflow-rag.cjs`, `fix-analise-v2.cjs` e `index-manual.cjs` escrevem no workflow `lidimus-Juridico` ao vivo e na coleção Qdrant que ele consulta — a alteração vale na hora, inclusive para os jobs dos clientes. A trava está em `rag/guarda-producao.cjs`.

**Se é isso mesmo:** repita com `--confirmar-producao`.
**Se quer outro alvo:** `N8N_HOST`, `N8N_WORKFLOW_ID` ou `QDRANT_COLLECTION` — alvo diferente do padrão dispensa a confirmação. O `--dry-run` do `index-manual.cjs` continua passando sem nada disso (não escreve).

---

### Screenshot/verificação visual mostra a página "antiga" mesmo após rebuild

**Causa:** ao tirar screenshots com `chrome.exe --headless --screenshot` reaproveitando o mesmo `--user-data-dir` entre capturas, o Chrome pode servir um bundle Vite em cache de disco daquele profile.

**Solução:** use um profile limpo por captura, ou prefira `playwright-core` com `chromium.launch({ channel: 'chrome' })` (não sofre esse problema e permite `fullPage: true` e `page.evaluate` para caçar overflow horizontal).

---

### `/admin/queues` fica travado em "Carregando..." indefinidamente

**Causa mais provável:** a API `/api/admin/queue-stats` depende do Redis; se `REDIS_URL` no `.env` apontar para um hostname que não resolve no contexto em que o Nuxt está rodando (ex.: `redis` quando o Nuxt está rodando fora do Docker, em `pnpm dev`, em vez de dentro do compose), a chamada trava sem nunca resolver.

**Diagnóstico:** confirme onde o processo Nuxt está rodando (dentro do container `web` vs. `pnpm dev` local) e se o `REDIS_URL` correspondente aponta para `redis:6379` (dentro do compose) ou `localhost:6379` (fora do compose, com a porta publicada).

**Solução:** ajustar `REDIS_URL` no `.env` para o hostname certo do contexto atual, ou garantir que a chamada não trave o SSR inicial (a página já usa `server: false` no `useFetch` para não bloquear a renderização do lado do servidor enquanto o Redis está inacessível).

---

### Callback do n8n retorna 401 (`Invalid signature`)

**Causa:** `N8N_CALLBACK_SECRET` do `.env`/`.env.prod` está diferente do configurado nos workflows do n8n — geralmente depois de uma rotação de segredo feita só de um lado.

**Diagnóstico:** o endpoint `server/api/webhooks/n8n-callback.post.ts` aceita `X-Lidimus-Signature` (HMAC) ou `X-Lidimus-Secret` (estático); confira qual o workflow do n8n está enviando e se bate com o valor atual da variável.

**Solução:** sincronizar o segredo nos dois lados (`.env`/`.env.prod` do Lidimus **e** a configuração correspondente no n8n) e reiniciar o container `web` para carregar o novo valor.

---

### Job fica parado em `queued`/`processing` indefinidamente

**Diagnóstico, nesta ordem:**
1. `/admin/queues` — a fila correspondente tem itens em `waiting`/`failed`?
2. `docker logs lidimus-saas-worker-1 -f` — o worker está processando ou crashou?
3. Consulta na tabela `jobs` (ver [30-banco-de-dados.md](30-banco-de-dados.md)) — `stage` e `error_message` indicam em qual etapa do pipeline travou.
4. Se o job passou do worker para o n8n, o problema pode estar do lado do n8n (workflow desativado, erro na chamada externa) — confira o log de execuções do n8n para aquele webhook.

**Causas comuns:** n8n indisponível ou workflow desativado; `PUBLIC_BASE_URL` incorreto/inacessível (o n8n não consegue baixar o arquivo nem enviar o callback de volta); `N8N_CALLBACK_SECRET` dessincronizado (ver item acima).

---

### `docker ps` e `docker inspect` travam, mas o site continua no ar

**Sintoma:** qualquer comando sobre containers fica pendurado indefinidamente, enquanto `docker version` e `docker volume ls` respondem normal. Visto em 07/08/2026, logo após um `docker compose down -v` no projeto do sandbox (que remove a rede do projeto).

**Não é queda do serviço.** Os containers seguem rodando — é a API de gerenciamento do daemon que emperra. Confirme por HTTP, que é a medida que importa:

```powershell
curl -s -o /dev/null -w "%{http_code}" https://lidimus.gvlar.com/
curl -s http://localhost:3000/api/health     # consulta Postgres e Redis
```

Se ambos respondem (`200`, `{"status":"ok"}`), produção está inteira e não há urgência.

**Solução:** normalmente destrava sozinho. O desempate é reiniciar o Docker Desktop — o que **reinicia também os containers de produção** (voltam sozinhos, têm `restart: unless-stopped`, com alguns segundos fora do ar). Decisão consciente, não reflexo.

---

### Migration não aplica / erro de "relation already exists"

**Causa comum:** alguém rodou SQL manual em produção que já criou o que a migration tentaria criar, ou a migration já foi aplicada mas o histórico local (`drizzle/meta/_journal.json`) está desatualizado.

**Solução:** nunca editar uma migration já aplicada — investigar o estado real do schema no banco (`\d nome_tabela` no psql) antes de decidir se a migration precisa ser marcada como já aplicada ou se precisa ser corrigida com uma nova migration. Ver [30-banco-de-dados.md](30-banco-de-dados.md).
