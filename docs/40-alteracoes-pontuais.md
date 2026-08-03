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
└── n8n (externo, fora do repo)    # workflows publicados no n8n; exports de referência em /n8n na raiz
```

> `JobStatus.vue` não é mais referenciado pelas páginas atuais (as páginas de resultado passaram a ter layout próprio de "prancha" com bloco-carimbo). Antes de reutilizá-lo, confirme se ainda faz sentido ou se deveria ser removido.

## Fazer um hotfix

1. **Identifique a camada certa** antes de editar:
   - Bug visual/UX → `apps/web/pages` ou `components`, seguindo `DESIGN.md`.
   - Bug de dado incorreto salvo/lido → `apps/web/server/api` ou `packages/db/src/schema.ts`.
   - Job não avança/trava → `packages/workers/src/index.ts` e a fila correspondente em `packages/queue`.
   - Callback do n8n rejeitado → `apps/web/server/api/webhooks/n8n-callback.post.ts` (valida `N8N_CALLBACK_SECRET`).

2. **Reproduza localmente** antes de mexer em produção — suba o ambiente local ([10-ambiente-local.md](10-ambiente-local.md)) e confirme o bug.

3. **Edite e teste em modo dev** (`pnpm dev`, com `postgres`/`redis` do Docker já no ar) para hot-reload rápido.

4. **Se mexeu no schema do banco**, gere e revise a migration antes de aplicar em qualquer lugar — ver [30-banco-de-dados.md](30-banco-de-dados.md).

5. **Rebuilde a imagem afetada** antes de considerar o fix "aplicado" no Docker:
   ```powershell
   cd lidimus-saas
   docker compose up -d --build web      # ou worker, ou ambos
   ```
   Lembrete: as imagens não montam a pasta local — sem rebuild, o container continua rodando o código antigo mesmo após salvar o arquivo.

6. **Suba para produção** seguindo [20-deploy.md](20-deploy.md) — não pule o passo de taggear a imagem anterior para poder reverter.

## Alterações comuns e onde mexer

| Preciso... | Arquivo(s) |
|---|---|
| Mudar texto/copy de uma página | o `.vue` da página em `pages/` |
| Mudar cor, fonte, espaçamento do sistema visual | `assets/css/lidimus.css` (tokens `--ld-*`) — **e** atualizar `DESIGN.md` se for uma decisão de design, não um ajuste isolado |
| Adicionar um campo num relatório (parecer/memorial/laudo) | o `[id].vue` da ferramenta em questão, mais o schema JSON que o n8n retorna (`result`) |
| Adicionar um novo tipo de análise | `packages/db/src/schema.ts` (`jobTypeEnum`), `packages/queue/src/index.ts` (nova fila + payload), `packages/workers/src/index.ts`, endpoint novo em `server/api/`, página de upload e de resultado |
| Trocar o endpoint/URL de um workflow do n8n | variáveis `N8N_*_WEBHOOK_PATH` no `.env` / `.env.prod` — não precisa rebuild de imagem, só reiniciar o container com o novo env |
| Mudar regra de autenticação/sessão | `apps/web/server/lib/auth.ts`, `server/middleware/auth.ts` |
| Investigar por que um job não conclui | `/admin/queues` no app, depois `docker logs lidimus-saas-worker-1`, depois a tabela `jobs` (`stage`, `error_message`) — ver [90-troubleshooting.md](90-troubleshooting.md) |

## O que NÃO fazer

- Não editar uma migration já aplicada (crie uma nova).
- Não editar diretamente o schema do banco via SQL manual em produção sem refletir a mudança em `packages/db/src/schema.ts` — a próxima migration vai tentar desfazer o que foi feito na mão.
- Não commitar `.env` / `.env.prod` (já estão fora do controle de versão — confirme com `git status` antes de um commit amplo).
- Não usar `docker compose down -v` em produção (apaga os volumes de dados).
