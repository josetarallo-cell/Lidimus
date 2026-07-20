# Análise do Lidimus — julho/2026

Revisão técnica do SaaS Lidimus (`lidimus.gvlar.com`) cobrindo **Segurança, Funcional/QA,
UX/Design e Performance/Técnica**. Entregável de análise — nenhum código foi alterado.

## Como esta análise foi feita (e uma limitação)

A revisão foi conduzida **sobre o código do monorepo `lidimus-saas/`**, inferindo o comportamento
de produção a partir dos handlers, do schema e das páginas.

> **Verificação ao vivo pendente.** O acesso ao site em produção estava **bloqueado pela política de
> egresso desta sessão** (o proxy nega CONNECT a `lidimus.gvlar.com` — 403). O bloqueio é no nível do
> egresso, então vale para curl e para o navegador; não foi contornado. Por isso **não houve
> walkthrough logado** com as credenciais fornecidas. Os achados de segurança/funcional abaixo vêm de
> leitura de código (com arquivo\:linha) e são reproduzíveis; os de UX foram avaliados no markup/CSS,
> não no render. O [Apêndice A](#apêndice-a--checklist-da-verificação-ao-vivo-pendente) lista o que
> confirmar quando a rede for liberada.

Severidade: **Crítico** (ação imediata) · **Alto** · **Médio** · **Baixo** · **Info/positivo**.

---

## Sumário executivo

O Lidimus é um projeto **maduro e bem construído**: proteção contra IDOR consistente, comparação de
segredos com `timingSafeEqual`, webhooks do Stripe/n8n autenticados e idempotentes, e um design
system (`DESIGN.md`) excepcionalmente rigoroso. Os achados não são falhas grosseiras — são
**condições de corrida no ledger de créditos** e **lacunas de ordenação/estado no pipeline
assíncrono**, ambas com impacto financeiro real (cada análise custa Document AI + LLM).

Top prioridades:

| # | Severidade | Achado | Onde |
|---|---|---|---|
| S1 | **Alto** | Checagem de saldo fora da transação (TOCTOU) → uploads concorrentes furam o saldo | `*/index.post.ts` |
| S2 | **Médio** | Callback do n8n sem guarda de estado + watchdog por `createdAt` → estorno **e** resultado | `n8n-callback.post.ts`, `watchdog.ts` |
| S3 | **Médio** | `getOrCreatePersonalOrg` check-then-insert → org e bônus de 100 créditos em dobro | `getOrCreateOrg.ts` |
| S4 | **Médio** | `drizzle-orm < 0.45.2` — CVE alto (SQLi por identificadores); baixa exploração aqui | `pnpm audit` |
| S5 | **Baixo** | Tipo do arquivo enviado não é validado (todos os uploads) | `*/index.post.ts` |
| S6 | **Baixo** | `/api/health` vaza `err.message` cru para chamador anônimo no 503 | `health.get.ts` |

---

## 1. Segurança

### S1 — [Alto] Checagem de saldo de créditos é TOCTOU (não atômica com o débito)

`apps/web/server/api/matriculas/index.post.ts:46-74` (idêntico em `kml/index.post.ts` e
`injection/index.post.ts`).

O saldo é lido **fora** da transação e o débito é inserido **depois**, em outra transação, sem trava
de linha nem restrição que impeça saldo negativo:

```
const saldo = await getOrgCreditBalance(db, orgId)   // lê SUM(delta) — fora da tx
if (saldo < custo) throw 402
const job = await db.transaction(...)                // insere consumption -custo
```

`getOrgCreditBalance` é `SUM(delta)` (`packages/db/src/credits.ts:18`) — não há lock nem
`check constraint`.

**Cenário de falha (concreto):** org com 20 créditos; usuário dispara **N uploads concorrentes**.
Todas as N requisições leem `saldo = 20 ≥ custo` **antes** de qualquer commit, todas passam, todas
debitam → saldo fica negativo e N análises pagas são executadas com crédito para uma só. O
rate-limit padrão (20/hora, `UPLOAD_RATE_LIMIT_PER_HOUR`) **não** protege: dá margem para muitas
análises concorrentes dentro da janela.

**Recomendação:** mover a checagem para **dentro** da transação com `SELECT ... FOR UPDATE` na
org/ledger, ou debitar condicionalmente (`INSERT ... WHERE (SELECT SUM(delta) ...) >= custo`) e
tratar 0 linhas como 402, ou manter um saldo materializado por org com `CHECK (balance >= 0)`.

### S2 — [Médio] Callback do n8n sem guarda de estado, combinado com watchdog por `createdAt`

`apps/web/server/api/webhooks/n8n-callback.post.ts` e `packages/workers/src/watchdog.ts`.

O callback autentica o segredo, mas **não valida o estado atual do job** antes de transicioná-lo: um
callback de `stage: 'doc'` seta `status='done'` + `result` (`n8n-callback.post.ts:151-163`)
independentemente do job já estar em `error`.

O watchdog expira jobs por **`jobs.createdAt < cutoff`** (`watchdog.ts`), não pela última atividade —
para uma matrícula (pipeline de 3 etapas, potencialmente longo) um job **legitimamente em
andamento** criado antes do cutoff é marcado `error` **e estornado**.

**Cenário de falha:** matrícula demora além do `timeoutMinutes`; watchdog marca `error` + estorna os
20 créditos; minutos depois o callback `doc` (atrasado, porém autêntico) chega, passa na auth e seta
`status='done'` com o parecer pronto — **sem re-cobrar**. Resultado: usuário fica com o estorno **e**
o laudo. Também vale para reenvio/replay de um callback capturado (o `X-Lidimus-Secret` é um bearer
estático, sem nonce/timestamp).

**Recomendação:** (a) no callback, só transicionar a partir de estados esperados
(`WHERE status IN ('queued','processing')` / etapa esperada) e ignorar callbacks para jobs já
terminais; (b) no watchdog, medir por atividade da etapa (um `updatedAt`/timestamp de estágio) em vez
de `createdAt`; (c) preferir o esquema HMAC (`X-Lidimus-Signature`) ao segredo estático.

### S3 — [Médio] `getOrCreatePersonalOrg`: check-then-insert sem atomicidade

`apps/web/server/lib/getOrCreateOrg.ts:7-31`. O "existe org?" e o insert (org + membro +
`SIGNUP_GRANT_CREDITS`) não são atômicos nem protegidos por unicidade.

**Cenário:** duas requisições concorrentes no **primeiro** uso (ex.: dois uploads simultâneos logo
após o cadastro) — ambas não acham org, ambas criam org + concedem **100 créditos** → 200 créditos e
duas orgs; uploads seguintes escolhem `.limit(1)` e podem se espalhar entre as orgs.

**Recomendação:** unicidade de "org pessoal por usuário" (índice único em `org_members.userId` para
papel `owner`, ou uma coluna `personal_org_id` em `users`) + `ON CONFLICT DO NOTHING`, resolvendo a
corrida no banco.

### S4 — [Médio] Dependências com CVE (`pnpm audit`)

`pnpm audit --prod`: **1 alto, 2 moderados, 1 baixo**.

| Pacote | Sev. | Nota de exploração no Lidimus |
|---|---|---|
| `drizzle-orm < 0.45.2` (SQLi por identificadores mal escapados) | **Alto** | Baixa na prática — nenhum **identificador** (tabela/coluna) vem de input do usuário; todos são referências estáticas do schema. Ainda assim é advisory alto: **subir para ≥ 0.45.2**. |
| `@nuxt/ui ≤ 4.7.1` (UForm/UAuthForm omitem `method` no SSR → credencial via GET antes da hidratação) | Moderado | **Não exercido**: as telas de auth são `<form @submit.prevent>` nativas com POST via `$fetch` (`pages/auth/login.vue:58`), não usam UForm. Confirmar que nenhuma outra tela envia credencial via `UForm`. |
| `uuid < 11.1.1` (bounds check com `buf`) | Moderado | Sem uso do parâmetro `buf`; impacto real desprezível. Atualizar no próximo bump. |
| `esbuild` (leitura de arquivo no dev server, Windows) | Baixo | Só afeta dev server em Windows; irrelevante para o prod Linux. |

### S5 — [Baixo] Tipo/conteúdo do arquivo enviado não é validado

Nos três uploads o MIME vem do cliente e cai num default
(`filePart.type ?? 'application/pdf'`, `matriculas/index.post.ts:32`; idem `kml` → `.kml+xml`,
`injection`). Não há checagem de magic bytes nem de extensão — qualquer binário é armazenado no GCS e
encaminhado ao n8n/Document AI. Impacto limitado (o processamento a jusante tende a falhar → estorno),
mas gera custo e ruído. **Recomendação:** validar assinatura (PDF `%PDF-`, KML como XML) e rejeitar
com 415 antes de debitar/enfileirar.

### S6 — [Baixo] `/api/health` vaza mensagem de erro crua

`apps/web/server/api/health.get.ts:15-18`: no 503 retorna `message: (err as Error).message` para um
chamador **não autenticado** — pode expor host/detalhe de infra (Postgres/Redis). O comentário diz
"não expõe dados sensíveis", mas o ramo de erro expõe. **Recomendação:** logar o detalhe e responder
`{ status: 'error' }` genérico.

### Segurança — o que está bem feito (positivos)

- **IDOR**: todo acesso a job passa por `getJobForUser`/join de `org_members` (`jobs/[id].get.ts`,
  `stream.get.ts`, `jobs/index.get.ts`) — sem confiança em id do cliente.
- **Segredos** comparados com `timingSafeEqual` em todos os pontos (callback n8n, token de arquivo).
- **Stripe**: `constructEvent` valida assinatura; crédito idempotente por `provider_ref` UNIQUE +
  `onConflictDoNothing`; só `subscription_create`/`subscription_cycle` creditam ciclo cheio.
- **Estorno** idempotente por índice único parcial `credit_tx_one_refund_per_job_idx` (schema:214).
- **Admin** gated por `requirePlatformAdmin`; `isPlatformAdmin` com `input:false` (não setável no
  cadastro) e checagem que **falha fechada** se o campo vier `undefined`.
- **Skills** servidas por **whitelist fixa** (`skills/[name].get.ts`) — sem path traversal/LFI.
- **Token de arquivo**: 32 bytes aleatórios, uso único, soft-delete pós-consumo. (Nota menor: viaja
  como query `?token=` e pode cair em log de proxy — o curto TTL mitiga.)

---

## 2. Funcional / QA

- **Máquina de estados robusta.** `pending → queued → processing → done/error`; pipeline de matrícula
  encadeado etapa a etapa no callback; OCR vazio vira `error` + estorno (`n8n-callback.post.ts:99`).
- **Entrega de status resiliente.** SSE via Redis pub/sub com *safety re-query* de 15 s para
  transições que não publicam evento, e **fallback de polling** no cliente (`stream.get.ts`,
  `useJobPoller.ts`).
- **Watchdog** de jobs presos com estorno (`watchdog.ts`) — boa rede de segurança. **Ressalva:** usa
  `createdAt` em vez de atividade da etapa (ver **S2**) — pode expirar prematuramente jobs longos.
- **[Médio] `change-plan` sem guarda de concorrência/idempotência de entrada**
  (`billing/change-plan.post.ts`): duplo clique em "Alterar plano" dispara duas chamadas
  `stripe.subscriptions.update` (duas faturas proporcionais) e, se gerarem `invoice.id` distintos, o
  `providerRef` `upgrade_<invoiceId>` **não** deduplica → possível crédito/cobrança em dobro.
  Recomenda-se desabilitar o botão durante a chamada **e** uma trava idempotente por assinatura.
- **[Baixo] Rate-limit conta requisições que depois falham** (`rateLimit.ts` é chamado antes das
  checagens de tamanho/saldo — `matriculas/index.post.ts:38`): um usuário sem crédito (402) ou com
  arquivo grande (413) ainda "gasta" cota da hora. Ordenar: validar tamanho/saldo **antes** de
  incrementar o bucket. Ainda: se o processo cair entre `INCR` e `EXPIRE`, a chave fica sem TTL
  (bloqueio permanente) — usar `SET key ... EX` atômico ou script Lua.

---

## 3. UX / Design

- **Design system de alto nível.** `apps/web/DESIGN.md` documenta razões de contraste (piso 7:1),
  `focus-visible`, `prefers-reduced-motion`, `.sr-only` global, estados vazios que ensinam o fluxo e
  os **7 estados** de todo interativo. É uma base de acessibilidade acima da média.
- **Aderência confirmada no código.** `pages/auth/login.vue`: `<label>` envolvendo input (associação
  implícita), `role="alert"` no erro, `autocomplete` correto, SVG decorativo `aria-hidden`, botão com
  `:disabled` + spinner `aria-hidden` no loading. `pages/dashboard.vue`: rótulos em **linguagem de
  ofício** ("Leitura do documento" em vez de "OCR/worker/fila"), respeitando a regra do PRODUCT.md;
  paginação que recua quando a página esvazia.
- **Pendente de verificação ao vivo** (bloqueio de rede): contraste real renderizado, responsividade
  mobile (cards do dashboard), foco visível na navegação, e conformidade das demais telas (conta,
  resultados de laudo, admin). Ver Apêndice A.

---

## 4. Performance / Técnica

- **Índices adequados** para o acesso atual: `jobs(org_id)`, `jobs(status)`, `credit_tx(org_id)`,
  `subscriptions(org_id)` (schema). Healthchecks sólidos (web `select 1`+`ping`; worker por
  heartbeat).
- **[Médio, escala] Saldo é `SUM(delta)` sobre todo o ledger da org** (`credits.ts:18`), recomputado
  a cada upload e a cada carga do dashboard. O ledger **cresce indefinidamente**; com histórico
  grande a soma fica cara. Considerar saldo materializado por org (atualizado por trigger/na mesma tx
  do lançamento) — que também resolve **S1**.
- **[Baixo, escala] SSE duplica uma conexão Redis por cliente** (`stream.get.ts:22`
  `connection.duplicate()`). Muitos espectadores simultâneos podem esgotar conexões do Redis;
  monitorar e, se necessário, multiplexar um único subscriber por instância.
- **Observabilidade** condicionada a `SENTRY_DSN` (web + workers), 4xx ignorados de propósito —
  bom sinal/ruído. Plano de troca por GlitchTip já documentado.

---

## Apêndice A — Checklist da verificação ao vivo pendente

A executar quando `lidimus.gvlar.com` for alcançável (login: `jose.tarallo@gmail.com`):

- [ ] **S1 na prática:** disparar uploads concorrentes com saldo baixo e conferir se o saldo fica
      negativo / análises extras rodam.
- [ ] **S2 na prática:** forçar/observar um job que estoura o watchdog e recebe callback atrasado —
      verificar se termina `done` com estorno mantido.
- [ ] **change-plan:** duplo clique em "Alterar plano" e conferir faturas/créditos no Stripe e no
      ledger.
- [ ] **UX/a11y renderizado:** navegação por teclado (foco visível), contraste real, layout mobile do
      dashboard e telas de laudo (`/matriculas/:id`, `/kml/:id`, `/injection/:id`), estados
      vazio/erro/loading.
- [ ] **Admin:** `/admin/clientes`, `/admin/faturamento`, `/admin/queues` com usuário promovido.
- [ ] **Fluxos completos:** cadastro → upload → resultado; recuperação de senha; checkout Stripe (test
      mode).
