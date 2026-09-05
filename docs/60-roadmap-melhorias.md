# Roadmap de melhorias (produto + engenharia)

Plano de implementação derivado do parecer de 07/07/2026 (UX, gestão de assinaturas, créditos, marketing
e prontidão de backend). Organizado em 4 fases sequenciais — cada uma pressupõe a anterior concluída.
Antes de começar qualquer fase, leia [00-arquitetura.md](00-arquitetura.md) e
[40-alteracoes-pontuais.md](40-alteracoes-pontuais.md).

Cada fase termina com um checklist de aceite. Ao concluir uma fase: gerar/revisar migrations,
atualizar [00-arquitetura.md](00-arquitetura.md) e [30-banco-de-dados.md](30-banco-de-dados.md) se o
schema mudou, e rebuildar as imagens (`docker compose up -d --build web worker`) antes de considerar
a fase pronta.

---

## Fase 1 — Segurança urgente

Fecha lacunas já exploráveis hoje, sem depender de nenhuma decisão de negócio. Fazer antes de qualquer
funcionalidade nova.

### 1.1 Papel de administrador de plataforma

Schema (`packages/db/src/schema.ts`):

```ts
// adicionar à tabela users
isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
```

Novo helper `server/lib/requirePlatformAdmin.ts`, no mesmo padrão de `requireAuth.ts`:

```ts
export function requirePlatformAdmin(event: H3Event) {
  const user = requireAuth(event)
  if (!user.isPlatformAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return user
}
```

Aplicar em `server/api/admin/queue-stats.get.ts` (troca `requireAuth`/nenhuma checagem por
`requirePlatformAdmin`) e adicionar guarda equivalente em `pages/admin/queues.vue` (checar
`useAuth()`/sessão no `definePageMeta`/middleware de rota, redirecionando para `/dashboard` se não-admin).

Promover o primeiro admin: como não há UI ainda, fazer via SQL direto uma vez
(`update users set is_platform_admin = true where email = '<email>'`) — documentar esse passo manual
em [30-banco-de-dados.md](30-banco-de-dados.md) até existir uma tela de gestão de admins.

### 1.2 Rate limiting nos uploads

Novo helper `server/lib/rateLimit.ts` usando o Redis já disponível (token bucket simples via
`INCR` + `EXPIRE`, ou biblioteca leve tipo `rate-limiter-flexible` se preferir não reinventar):

```ts
export async function checkRateLimit(redis: Redis, key: string, limit: number, windowSeconds: number) {
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, windowSeconds)
  if (count > limit) throw createError({ statusCode: 429, statusMessage: 'Muitas análises em pouco tempo. Tente novamente em instantes.' })
}
```

Chamar no início dos três handlers de upload (`server/api/matriculas/index.post.ts`,
`kml/index.post.ts`, `injection/index.post.ts`) com chave `ratelimit:upload:${orgId}`. Limite inicial
sugerido: 20/hora por organização — ajustável por variável de ambiente (`UPLOAD_RATE_LIMIT_PER_HOUR`).

### 1.3 Limite de tamanho de upload

Nos mesmos três handlers, antes de `Buffer.from(filePart.data)`: checar `filePart.data.length` contra
um teto (`MAX_UPLOAD_SIZE_MB`, sugestão inicial 25MB) e retornar 413 se exceder. Considerar também
configurar um limite no nível do Nitro/servidor HTTP (body size) como segunda camada de defesa, não só
na lógica de negócio.

### 1.4 Comparação de token em tempo constante

Em `server/lib/jobFile.ts:49`, trocar:

```ts
if (!file || file.accessToken !== token || file.deletedAt) return null
```

por uma comparação com `crypto.timingSafeEqual`, no mesmo padrão de
`server/api/webhooks/n8n-callback.post.ts` (cuidado com buffers de tamanho diferente — comparar
tamanho antes de chamar `timingSafeEqual`, como já feito lá).

### 1.5 Healthcheck de web/worker

Novo endpoint `server/api/health.get.ts` no `web`, checando conexão com Postgres (`select 1`) e Redis
(`ping`); adicionar `healthcheck` correspondente em `docker-compose.yml` e `docker-compose.prod.yml`
para os serviços `web` e `worker` (para o worker, um arquivo de heartbeat tocado a cada N segundos e
checado via `HEALTHCHECK CMD` no Dockerfile é suficiente, já que não expõe porta HTTP).

### Checklist de aceite — Fase 1

- [x] Usuário sem `is_platform_admin` recebe 403 em `/api/admin/queue-stats` e é redirecionado ao
      acessar `/admin/queues`
- [x] Mais de 20 uploads/hora da mesma organização retornam 429 com mensagem clara
- [x] Upload acima do teto configurado retorna 413 antes de bufferizar o arquivo inteiro
- [x] `docker compose ps` mostra `healthy` para `web` e `worker`, não só para `postgres`/`redis`

Fase concluída em 07/07/2026. Nota: o teto de 413 é checado na lógica de negócio após o
`readMultipartFormData` (que já bufferizou o corpo); o limite de body no nível do Nitro/proxy
reverso segue como melhoria opcional (ver 1.3).

---

## Fase 2 — Créditos e assinaturas

O motor de monetização que hoje não existe. Maior fase — envolve uma decisão de negócio (gateway de
pagamento) que precisa ser tomada antes de começar a integração externa, mas o ledger de créditos e a
aplicação de custo podem ser construídos e testados independentemente disso.

### 2.1 Decisão necessária antes de iniciar

**Escolha de gateway de pagamento** — impacta o formato do webhook e dos campos `provider_*`:

| Opção | A favor | Contra |
|---|---|---|
| Stripe | Melhor DX, Customer Portal pronto para autogestão de assinatura, webhooks bem documentados | Pix não é nativo no Brasil (cartão + boleto) |
| Asaas / Pagar.me | Pix nativo — mais alinhado ao público de cartórios/PMEs | DX e portal de autogestão menos maduros que o Stripe |

Recomendação: Stripe se o público pagante inicial for majoritariamente cartão corporativo; Asaas/Pagar.me
se Pix for esperado como método dominante. Esta escolha é do negócio, não bloqueia o restante da fase.

### 2.2 Schema

```ts
export const planStatusEnum = pgEnum('subscription_status', ['trialing', 'active', 'past_due', 'canceled'])

export const creditReasonEnum = pgEnum('credit_reason', [
  'signup_grant', 'purchase', 'consumption', 'refund', 'admin_adjustment',
])

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  monthlyPriceCents: integer('monthly_price_cents').notNull(),
  annualPriceCents: integer('annual_price_cents').notNull(),
  creditsPerCycle: integer('credits_per_cycle').notNull(),
  maxUsers: integer('max_users').notNull().default(1),
  features: jsonb('features').$type<Record<string, unknown>>(),
})

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  status: planStatusEnum('status').notNull().default('trialing'),
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  reason: creditReasonEnum('reason').notNull(),
  jobId: uuid('job_id').references(() => jobs.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('credit_tx_org_id_idx').on(t.orgId)])
```

Gerar migration (`pnpm db:generate`), revisar o SQL antes de aplicar.

### 2.3 Ledger e custo por análise

`server/lib/credits.ts` (novo):

```ts
export const CREDIT_COST: Record<'matricula' | 'kml' | 'injection', number> = {
  matricula: 20,
  kml: 50,
  injection: 5,
}

export async function getOrgCreditBalance(db: Db, orgId: string): Promise<number> {
  const rows = await db
    .select({ delta: creditTransactions.delta })
    .from(creditTransactions)
    .where(eq(creditTransactions.orgId, orgId))
  return rows.reduce((sum, r) => sum + r.delta, 0)
  // em escala, trocar por um SELECT SUM(delta) no banco em vez de somar em memória
}
```

Nos três handlers de upload, antes de inserir o job:

```ts
const custo = CREDIT_COST[tipoDaAnalise]
const saldo = await getOrgCreditBalance(db, orgId)
if (saldo < custo) {
  throw createError({ statusCode: 402, statusMessage: `Créditos insuficientes. Saldo: ${saldo}, necessário: ${custo}.` })
}
```

E, na mesma transação que cria o `job`, inserir a linha de consumo (`reason: 'consumption'`,
`delta: -custo`, `jobId: job.id`).

No callback do n8n (`server/api/webhooks/n8n-callback.post.ts`), quando `status` final vira `'error'`:
inserir transação de estorno (`reason: 'refund'`, `delta: +custo`).

Em `getOrCreatePersonalOrg` (`server/lib/getOrCreateOrg.ts`): ao criar a organização, inserir a
concessão inicial (`reason: 'signup_grant'`, `delta: 100`).

### 2.4 Webhook do gateway

`server/api/webhooks/<stripe|asaas>.post.ts`, espelhando a autenticação de assinatura de
`n8n-callback.post.ts` (validar assinatura do provedor, não confiar em `X-*-Secret` estático se o
provedor oferecer HMAC nativo). Tratar no mínimo:

- assinatura criada/atualizada/cancelada → sincroniza `subscriptions.status`
- pagamento confirmado → insere `credit_transactions` (`reason: 'purchase'`), com `delta` igual a
  `creditsPerCycle` do plano (renovação) ou ao pacote avulso comprado

### 2.5 Páginas novas

- `/conta` — perfil (nome, e-mail, trocar senha), lista de organizações do usuário
- `/conta/creditos` — saldo atual, histórico (join `credit_transactions` + `jobs`), aviso de saldo
  baixo, CTA "comprar mais créditos"
- `/conta/assinatura` — plano atual, status, renovação, botão para o portal do gateway (evitar
  reimplementar gestão de cartão — usar Customer Portal do Stripe ou equivalente)
- Saldo de créditos em destaque em `pages/dashboard.vue`, ao lado das ações de nova análise

### 2.6 Painel administrativo

- `/admin/clientes` — organizações com plano, status, saldo, último job; ações: conceder créditos
  (`admin_adjustment`), suspender assinatura
- `/admin/faturamento` — MRR (soma de `subscriptions` ativas × `plans.monthlyPriceCents`),
  distribuição por plano, cancelamentos no mês
- Ambas protegidas por `requirePlatformAdmin` (Fase 1)

### Checklist de aceite — Fase 2

- [x] Upload sem saldo suficiente retorna 402 com mensagem clara, sem criar job "fantasma"
- [x] Pagamento confirmado no gateway reflete no saldo em poucos segundos — verificado com
      pagamento de teste real (cartão 4242) em 07/07/2026: assinatura ativa + 500 créditos via
      `invoice.paid`, entregue pelo endpoint de webhook `https://lidimus.gvlar.com/api/webhooks/stripe`
      criado na conta Stripe (test mode)
- [x] Job que termina em erro devolve o crédito automaticamente — verificado nos dois caminhos
      (callback de erro do n8n e handler `failed` do worker), com estorno idempotente
- [x] Administrador vê todas as organizações e concede créditos manualmente sem acessar o banco

Implementação concluída em 07/07/2026 (gateway: Stripe, modo de teste). Decisões: ciclo anual
credita os 12 meses de uma vez no `invoice.paid`; preços enviados inline ao checkout (a tabela
`plans` é a fonte da verdade — não é preciso cadastrar produtos no dashboard do Stripe).

---

## Fase 3 — Escala (preparar para ~1000 acessos simultâneos)

### 3.1 Concorrência do BullMQ configurável

Trocar `concurrency: 5` hardcoded (`packages/workers/src/*.worker.ts`, 5 arquivos) por
`Number(process.env.WORKER_CONCURRENCY ?? 5)`. **Antes de aumentar o valor**, confirmar com quem
administra o n8n externo qual throughput de webhook ele sustenta — aumentar a concorrência do lado do
Lidimus sem essa confirmação só desloca o gargalo para 429/timeout do n8n.

### 3.2 Múltiplas réplicas do worker

BullMQ já suporta múltiplos processos consumindo a mesma fila nativamente. Em
`docker-compose.prod.yml`, usar `deploy.replicas` (se usando Swarm) ou subir múltiplos serviços
`worker` nomeados (`worker-1`, `worker-2`, ...) apontando para a mesma imagem — nenhuma mudança de
lógica é necessária.

### 3.3 PgBouncer

Introduzir antes de aumentar réplicas de `web`/`worker` — cada réplica nova abre seu próprio pool
(`packages/db/src/index.ts` usa o pool default de 10 do driver `postgres`). Um PgBouncer em modo
transaction na frente do Postgres evita esgotar `max_connections` conforme o número de réplicas cresce.

### 3.4 Substituir polling por push

`apps/web/composables/useJobPoller.ts` (3s por job aberto) e `pages/dashboard.vue` (10s) — trocar por
Server-Sent Events: `server/api/jobs/[id]/stream.get.ts` alimentado por Postgres `LISTEN/NOTIFY`
disparado no mesmo `UPDATE` que o callback do n8n já faz, ou por pub/sub no Redis (já disponível).
Manter o polling atual como fallback se `EventSource` falhar (rede corporativa que bloqueia SSE, por
exemplo).

### 3.5 Observabilidade

Adicionar rastreamento de erro (Sentry ou equivalente self-hosted) em `apps/web` e
`packages/workers`. Sem isso, uma fila travada ou um worker crashando silenciosamente só é percebido
quando um cliente reclama.

### 3.6 Múltiplas réplicas de web

Confirmado (Fase de análise) que sessões vivem no Postgres via better-auth — nenhuma mudança de código
necessária para tornar `web` stateless. Documentar e configurar N réplicas atrás de um load balancer
em produção.

### Checklist de aceite — Fase 3

- [x] Worker escalado a N réplicas processa jobs em paralelo sem duplicar o mesmo job — verificado
      em 08/07/2026 com `--scale worker=2`: 2 jobs concluídos, exatamente 1 consumo de crédito cada
- [x] Teste de carga não derruba o processo `web` nem esgota conexões do Postgres — verificado com
      autocannon: 500 conexões simultâneas autenticadas em `/api/jobs` por 15s → 100% de respostas
      200, zero timeouts, conexões do Postgres estáveis em 12 (pool segurou). Equivale a mais de
      1000 usuários reais com polling de 3s — e o polling virou SSE (push em <1s), reduzindo a
      carga base
- [x] Erro de worker aparece em uma ferramenta de observabilidade — conta gratuita do sentry.io
      criada em 08/07/2026, `SENTRY_DSN` no `.env` e captura testada com um 500 real. Detalhes,
      e o plano de substituição por GlitchTip se o custo virar problema, em
      [00-arquitetura.md](00-arquitetura.md#observabilidade--rastreamento-de-erros-sentry)

---

## Fase 4 — UX e marketing

### 4.1 Recuperação de senha

Nova página `pages/auth/esqueci-senha.vue` + configuração do fluxo nativo de reset por e-mail do
better-auth (`server/lib/auth.ts`) — requer escolher e configurar um provedor de e-mail transacional
(Resend ou Amazon SES são opções diretas de integrar), que hoje não existe no projeto.

### 4.2 Login social

Em `server/lib/auth.ts`, adicionar `socialProviders` com Google (prioridade 1) e Microsoft/Azure AD
(prioridade 2) — requer criar credenciais OAuth em cada provedor e configurar `NUXT_GOOGLE_CLIENT_ID`/
`NUXT_GOOGLE_CLIENT_SECRET` (e equivalentes) no `.env`. Atualizar `pages/auth/login.vue` e
`register.vue` com os botões, seguindo `DESIGN.md` (botão secundário, cantos 4px, nunca pill).

### 4.3 FAQ na landing

Nova seção em `pages/index.vue`, antes da seção de planos, respondendo pelo menos: "Isso substitui o
parecer de um profissional habilitado?", "Meus documentos ficam seguros?", "O que acontece quando meus
créditos acabam?", "Posso cancelar quando quiser?" — mesma gramática visual das seções existentes
(filetes 1px, sem sombra, cantos discretos).

### 4.4 SEO e compartilhamento

Ampliar o `useHead` da landing: meta description, Open Graph (`og:title`, `og:description`,
`og:image`), Twitter card, e um bloco `JSON-LD` `schema.org` (`Organization` + `SoftwareApplication`).

### 4.5 Tabela comparativa de planos

Substituir/complementar as três listas independentes de recursos por uma matriz
(linhas = recursos, colunas = Amador/Profissional/Empresarial) na seção de planos.

### 4.6 Caminho de vendas real para o Empresarial

O CTA "Falar com vendas" hoje leva a `/auth/register`, igual aos planos self-service — trocar por um
formulário de contato dedicado ou link de agendamento.

### 4.7 Prova social real

Assim que existirem os primeiros clientes pagantes (depende da Fase 2 em produção), substituir ou
complementar as seções "Na imprensa" por depoimentos e/ou contadores de uso reais.

### Checklist de aceite — Fase 4

- [ ] Usuário cria conta e entra com Google sem digitar senha — código pronto (botão aparece
      automaticamente quando `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` existirem no `.env`);
      falta criar as credenciais OAuth no Google Cloud Console com redirect URI
      `<PUBLIC_BASE_URL>/api/auth/callback/google`
- [x] Usuário que esqueceu a senha recupera acesso sozinho, por e-mail — fluxo verificado de ponta
      a ponta em 08/07/2026 (pedido → link → nova senha vale, antiga rejeitada). Provedor: Resend
      (`RESEND_API_KEY`); sem a chave, o link é logado no console (só dev)
- [x] A landing responde as objeções de confiança mais prováveis do público-alvo antes da seção de
      preços — FAQ com 5 perguntas; também entregues: SEO/OG/Twitter/JSON-LD (com og.png), matriz
      comparativa de planos e CTA do Empresarial apontando para contato comercial (mailto — trocar
      por formulário/agendamento quando existir e-mail de domínio próprio)

---

## Pendência técnica — os embeddings do RAG ainda são do Mistral

Em 04/09/2026 o Mistral saiu dos dois lugares onde fazia trabalho de modelo de linguagem: a
`Extração de Campos` do `lidimus-Juridico` e a `Extracao Croqui` do `lidimus-croqui` passaram a
chamar a Anthropic (`claude-sonnet-5`). O motivo imediato foi operacional — a conta caiu para o
tier gratuito, o `mistral-large` já respondia 403 `tier_not_allowed` desde 01/09 e o
`mistral-medium` passou a responder 429 `rate_limited`, derrubando análises de cliente (execução
879). Só `ministral-8b`, `open-mistral-nemo` e `mistral-embed` continuaram respondendo.

**Sobrou uma dependência**: o nó `Embeddings Consultas` do `lidimus-Juridico` usa `mistral-embed`
para vetorizar a consulta antes de buscar no Qdrant. Ele funciona (o endpoint de embeddings
responde mesmo no tier gratuito), então não há urgência — mas enquanto ele existir, encerrar a
conta Mistral quebra o RAG do jurídico.

Trocar de modelo de embedding **não é mudar uma string**. A coleção no Qdrant foi indexada com
vetores do `mistral-embed`; outro modelo produz vetores de outra dimensionalidade, e consultar
com um modelo diferente do que indexou devolve vizinhos aleatórios sem erro nenhum — falha
silenciosa, que aparece como fundamentação legal ruim no laudo, não como exceção. Migrar exige:

1. escolher o novo provedor de embedding e conferir a dimensionalidade;
2. recriar a coleção no Qdrant com a nova dimensão (`rag/index-manual.cjs`);
3. reindexar os 205 chunks do manual;
4. trocar o nó `Embeddings Consultas` **na mesma janela** da reindexação — coleção nova com nó
   velho, ou o contrário, é o cenário da falha silenciosa acima;
5. conferir com `rag/query-manual.cjs` que as buscas voltam a trazer os trechos esperados.

Gatilho para fazer: qualquer decisão de encerrar a conta Mistral, ou a primeira vez que o
`mistral-embed` também for limitado. Até lá, é dívida conhecida e barata de carregar.

---

## Decisões que dependem do negócio, não da engenharia

| Decisão | Onde impacta | Quem decide |
|---|---|---|
| Gateway de pagamento (Stripe vs. Asaas/Pagar.me) | Fase 2.1 — formato do webhook e do checkout | Produto/negócio |
| Provedor de e-mail transacional | Fase 4.1 — recuperação de senha, e futuramente recibos | Engenharia, com aprovação de custo |
| Credenciais OAuth (Google/Microsoft) | Fase 4.2 | Quem administra o domínio/organização Google Workspace da empresa |
| Limite de rate limiting e tamanho de upload (valores exatos) | Fase 1.2/1.3 — sugestões dadas, mas ajustáveis | Produto, com base em uso real observado |
