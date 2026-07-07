# Troubleshooting

Erros já vistos neste projeto e como resolver. Adicione uma entrada nova sempre que resolver algo que valha a pena não re-investigar do zero.

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

**Alternativa mais rápida ao iterar em front-end:** rode o Nuxt em modo dev fora do Docker (hot-reload) e só publique no container quando terminar — ver [10-ambiente-local.md](10-ambiente-local.md#modo-de-desenvolvimento-com-hot-reload-iterar-em-front-end).

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

### Migration não aplica / erro de "relation already exists"

**Causa comum:** alguém rodou SQL manual em produção que já criou o que a migration tentaria criar, ou a migration já foi aplicada mas o histórico local (`drizzle/meta/_journal.json`) está desatualizado.

**Solução:** nunca editar uma migration já aplicada — investigar o estado real do schema no banco (`\d nome_tabela` no psql) antes de decidir se a migration precisa ser marcada como já aplicada ou se precisa ser corrigida com uma nova migration. Ver [30-banco-de-dados.md](30-banco-de-dados.md).
