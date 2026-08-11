# Alterações pontuais

Mapa de "onde fica cada coisa" e como fazer um hotfix com segurança.

## Onde fica cada coisa

```
lidimus-saas/
├── apps/web/
│   ├── pages/                    # rotas (Nuxt file-based routing)
│   │   ├── index.vue             # landing pública
│   │   ├── auth/login.vue, register.vue
│   │   ├── dashboard.vue         # painel de análises do usuário
│   │   ├── matriculas/           # index.vue = upload (1 a 10 PDFs); [id].vue = parecer (a "prancha")
│   │   │   └── lote/[id].vue     # acompanhamento de um envio em lote
│   │   ├── kml/                  # index.vue = upload; [id].vue = memorial
│   │   ├── injection/            # index.vue = upload; [id].vue = laudo
│   │   └── admin/queues.vue      # monitoramento de filas
│   ├── components/
│   │   ├── UploadCard.vue        # dropzone genérica; `multiple` liga o modo lote
│   │   └── JobStatus.vue         # (legado — ver nota abaixo)
│   ├── composables/useJobPoller.ts  # polling de /api/jobs/:id a cada 3s
│   ├── composables/useJobApresentacao.ts  # selos de status/risco da listagem (painel + lote)
│   ├── server/api/                # endpoints internos (upload, jobs, admin, webhook do n8n)
│   ├── server/lib/                # db, gcs, queue, auth — helpers do backend
│   ├── assets/css/lidimus.css     # tokens e primitivas do design system (fonte: DESIGN.md)
│   ├── DESIGN.md                  # design system "A Prancha Viva" — normativo para qualquer UI nova
│   └── PRODUCT.md                 # personas, princípios de produto, anti-referências
├── packages/db/src/schema.ts      # schema Drizzle — única fonte de verdade do banco
├── packages/queue/src/index.ts    # nomes de filas e tipos de payload (compartilhado web/worker)
├── packages/workers/src/index.ts  # ponto de entrada dos workers, valida env vars obrigatórias
├── docker-compose.yml             # PRODUÇÃO (inclui cloudflared → lidimus.gvlar.com)
├── docker-compose.sandbox.yml     # sandbox de desenvolvimento — ver docs/15-sandbox.md
├── scripts/sandbox-*.mjs          # up/migrate/seed do sandbox + validação do .env.sandbox
├── scripts/dev-local.mjs          # hot reload contra PRODUÇÃO (hotfix); dev-sandbox.mjs é o isolado
├── rag/                           # scripts de manutenção do RAG e dos workflows do n8n
│   └── guarda-producao.cjs        # exige --confirmar-producao antes de escrever no n8n/Qdrant
└── n8n (externo, fora do repo)    # workflows publicados no n8n; exports de referência em /n8n na raiz
```

> `JobStatus.vue` não é mais referenciado pelas páginas atuais (as páginas de resultado passaram a ter layout próprio de "prancha" com bloco-carimbo). Antes de reutilizá-lo, confirme se ainda faz sentido ou se deveria ser removido.

## Fazer um hotfix

1. **Identifique a camada certa** antes de editar:
   - Bug visual/UX → `apps/web/pages` ou `components`, seguindo `DESIGN.md`.
   - Bug de dado incorreto salvo/lido → `apps/web/server/api` ou `packages/db/src/schema.ts`.
   - Job não avança/trava → `packages/workers/src/index.ts` e a fila correspondente em `packages/queue`.
   - Callback do n8n rejeitado → `apps/web/server/api/webhooks/n8n-callback.post.ts` (valida `N8N_CALLBACK_SECRET`).

2. **Reproduza no sandbox** ([15-sandbox.md](15-sandbox.md)) — banco, fila e bucket próprios, nada que você faça ali chega ao site no ar:
   ```powershell
   cd lidimus-saas
   pnpm sandbox:up postgres redis worker
   pnpm dev:sandbox                       # hot reload em http://localhost:3100
   ```
   `pnpm dev` e `pnpm dev:local` **não** servem para isso: os dois carregam o `.env` de produção.

3. **Se o bug só aparece com dado real**, aí sim use `pnpm dev:local` (porta 3001, banco de produção) — para *observar*. Voltar a editar com ele no ar é como errar de banco sem perceber.

4. **Se mexeu no schema do banco**, gere a migration, revise o SQL e aplique primeiro com `pnpm sandbox:migrate` — ver [30-banco-de-dados.md](30-banco-de-dados.md).

5. **Valide no modo container do sandbox** antes de dar por pronto:
   ```powershell
   pnpm sandbox:up                        # web em container, porta 3100
   ```
   O Dockerfile roda `nuxt build`; erro de SSR, de tipo ou de variável só aparece aí — não no dev server.

6. **Rebuilde a imagem de produção** para o fix valer no site:
   ```powershell
   docker compose up -d --build web      # ou worker, ou ambos
   ```
   Dois lembretes: as imagens não montam a pasta local (sem rebuild o container segue com o código antigo), e o build usa a **árvore de trabalho** — confira o `git status` para não publicar junto o que ainda está pela metade.

7. **Se e quando existir VPS**, siga [20-deploy.md](20-deploy.md) — não pule o passo de taggear a imagem anterior para poder reverter.

## Alterações comuns e onde mexer

| Preciso... | Arquivo(s) |
|---|---|
| Mudar texto/copy de uma página | o `.vue` da página em `pages/` |
| Mudar cor, fonte, espaçamento do sistema visual | `assets/css/lidimus.css` (tokens `--ld-*`) — **e** atualizar `DESIGN.md` se for uma decisão de design, não um ajuste isolado |
| Adicionar um campo num relatório (parecer/memorial/laudo) | o `[id].vue` da ferramenta em questão, mais o schema JSON que o n8n retorna (`result`) |
| Adicionar um novo tipo de análise | `packages/db/src/schema.ts` (`jobTypeEnum`), `packages/queue/src/index.ts` (nova fila + payload), `packages/workers/src/index.ts`, endpoint novo em `server/api/`, página de upload e de resultado |
| Trocar o endpoint/URL de um workflow do n8n | variáveis `N8N_*_WEBHOOK_PATH` no `.env` / `.env.prod` / `.env.sandbox` — não precisa rebuild de imagem, só reiniciar o container com o novo env |
| Mudar uma variável de ambiente que o `web` lê | além do nome sem prefixo, acerte o par `NUXT_<CHAVE>` — no container o Nuxt é buildado e só o prefixado sobrescreve o `runtimeConfig` (em produção o remapeamento está no bloco `environment:` do compose; no sandbox, dentro do `.env.sandbox`) |
| Alterar um workflow do n8n pelos scripts do `rag/` | eles agora exigem `--confirmar-producao`; para apontar a outro alvo, `N8N_HOST` / `N8N_WORKFLOW_ID` / `QDRANT_COLLECTION` |
| Mudar regra de autenticação/sessão | `apps/web/server/lib/auth.ts`, `server/middleware/auth.ts` |
| Investigar por que um job não conclui | `/admin/queues` no app, depois `docker logs lidimus-saas-worker-1`, depois a tabela `jobs` (`stage`, `error_message`) — ver [90-troubleshooting.md](90-troubleshooting.md) |

## O que NÃO fazer

- Não editar uma migration já aplicada (crie uma nova).
- Não editar diretamente o schema do banco via SQL manual em produção sem refletir a mudança em `packages/db/src/schema.ts` — a próxima migration vai tentar desfazer o que foi feito na mão.
- Não commitar `.env` / `.env.prod` / `.env.sandbox` (já estão fora do controle de versão — confirme com `git status` antes de um commit amplo).
- Não usar `docker compose down -v` no `docker-compose.yml`: **aquele é o compose de produção**, e o `-v` apaga `lidimus-saas_pgdata`. O equivalente descartável é `pnpm sandbox:reset`.
- Não desenvolver com `pnpm dev` nem `pnpm dev:local`: ambos carregam o `.env` de produção — conta criada ali é conta no site, job enviado ali debita crédito de cliente. Use `pnpm dev:sandbox`.
