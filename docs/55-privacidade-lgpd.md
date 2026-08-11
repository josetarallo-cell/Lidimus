# Privacidade e LGPD

Parecer sobre a necessidade de banner de consentimento de cookies, inventário do que o Lidimus coleta e registro dos achados pendentes.

Complementa [50-seguranca.md](50-seguranca.md), que cuida da infraestrutura. Este documento cuida do titular dos dados.

Data da análise: 7 de agosto de 2026. Base: LGPD (Lei 13.709/2018) e o Guia Orientativo "Cookies e Proteção de Dados Pessoais" da ANPD (18/10/2022).

---

## A pergunta: precisamos de banner de cookies com 3 botões?

**Não.** E implantá-lo hoje seria pior do que não ter.

O Guia da ANPD divide cookies em **necessários** e **não necessários**, e a base legal muda com a categoria:

- **Necessários** — legítimo interesse (art. 7º, IX) ou execução de contrato (art. 7º, V). **Dispensam consentimento**, porque não há escolha real a oferecer: sem cookie de sessão não existe login.
- **Não necessários** (audiência, publicidade, perfilamento) — exigem **consentimento**, com banner em duas camadas, botão de recusa em igual destaque e caixas desmarcadas por padrão.

O Lidimus **não define um único cookie não necessário**. Sem objeto de consentimento, o banner de "aceitar todos / rejeitar todos / configurar" não teria o que controlar. Um botão "rejeitar todos" que não desliga nada é declaração falsa ao titular — ofende a transparência e a boa-fé (art. 6º, VI) em vez de sanar o que quer que seja.

O que a lei exige **sempre**, inclusive quando só há cookies necessários, é **transparência**: política de cookies informando finalidade, prazo e compartilhamentos (art. 9º). É isso que passou a existir.

### Gatilho para revisar esta conclusão

No dia em que entrar **o primeiro** GA4, Meta Pixel, Hotjar, Clarity, RD Station ou similar, o banner de consentimento passa a ser **obrigatório** e precisa nascer junto com o rastreador — nunca depois. Ver "Regra vinculante" ao final.

---

## Inventário de cookies

Todos de primeira parte, exceto os da Cloudflare. Em produção (HTTPS) os dois primeiros ganham o prefixo `__Secure-`; todos os de sessão são `HttpOnly`.

| Cookie | Finalidade | Base legal | Prazo |
|---|---|---|---|
| `better-auth.session_token` | Sessão autenticada | Art. 7º, V | 7 dias |
| `better-auth.state` | Anti-CSRF do OAuth Google | Art. 7º, IX + art. 46 | 5 min |
| `ld_aceite_termos` | Leva o aceite dos Termos ao servidor através do round-trip do OAuth | Art. 7º, II e IX | 30 min |
| `ld_consentimento` | Registra que o aviso de cookies já foi visto | Art. 7º, IX | 1 ano |
| `__cf_bm`, `_cfuvid` | Cloudflare: anti-bot e rate limiting na borda | Art. 7º, IX + art. 46 | ~30 min / sessão |

**`localStorage`**: `nuxt-color-mode` (string `"system"`), gravado em toda visita pelo `@nuxt/ui` via dependência transitiva. Não identifica ninguém, não é dado pessoal, não demanda consentimento. É lixo funcional — o app não expõe seletor de tema. Desligar é higiene, não conformidade.

**Varredura negativa confirmada** (nenhuma ocorrência no repositório): gtag, GTM, Meta Pixel, Hotjar, Clarity, PostHog, Plausible, Umami, Matomo, Amplitude, Mixpanel, Segment, FullStory, LogRocket, Intercom, Crisp, reCAPTCHA, Turnstile. Stripe e Asaas operam por redirect server-side, sem SDK no navegador. Sentry é `@sentry/node`, só servidor — sem SDK de browser, sem session replay.

---

## O achado principal, que banner nenhum resolveria

`nuxt.config.ts` carregava cinco famílias tipográficas do CDN do Google. Toda visita — **inclusive anônima, na landing, antes de qualquer clique** — transmitia IP, User-Agent e Referer ao Google LLC nos Estados Unidos. Isso é tratamento de dado pessoal somado a transferência internacional (arts. 33–36), sem base legal declarada e sem aviso.

Cookie banner não bloqueia requisição de fonte. Só a remoção do `<link>` resolve — e foi o que se fez.

**Detalhe que quase passou:** o `@nuxt/fonts` (embutido no `@nuxt/ui`) auto-hospedava só parte da tipografia. Seu scanner resolve `font-family` literal e variáveis com prefixo `--font-` (padrão `processCSSVariables: 'font-prefixed-only'`), o que cobria **Archivo** e **Archivo Narrow**. Mas **Besley, Hanken Grotesk e Fragment Mono** moram em `--ld-font-serif`, `--ld-font-sans` e `--ld-font-mono` — tokens da identidade anterior, ainda usados em cerca de 230 pontos do app — e passavam batido: vinham do Google em tempo de execução.

Apagar o `<link>` sem mais nada teria derrubado essas três para o fallback do sistema. A correção é `global: true` em cada família de `fonts.families`, que injeta o `@font-face` **independentemente de o scanner detectar uso**, e só então o link saiu. `processCSSVariables: true` foi testado antes e não resolveu — o `global` é o que dá a garantia.

Nota de método, porque custou tempo: conferir só `.output/public/**/*.css` **engana**. O CSS global é embutido nos chunks de servidor (`.output/server/chunks/build/entry-styles.*.mjs`), então metade dos `@font-face` não aparece ali. A verificação tem de varrer `.output` inteiro.

---

## O que foi implementado

| # | Mudança | Onde |
|---|---|---|
| 1 | Fontes auto-hospedadas; `<link>` e `preconnect` do Google removidos | `nuxt.config.ts` |
| 2 | `icon.fallbackToApi: false` — fecha a chamada de runtime a `api.iconify.design` | `nuxt.config.ts` |
| 3 | Política de Privacidade, com seção de cookies, suboperadores e retenção | `pages/privacidade.vue` |
| 4 | Termos com URL própria, citável e arquivável | `pages/termos.vue` |
| 5 | Texto dos Termos extraído para fonte única — modal e página não podem divergir | `components/TermosTexto.vue` |
| 6 | Aviso informativo de cookies (**um** botão, não três) | `components/AvisoCookies.vue` |
| 7 | Estado de consentimento versionado, pronto para o dia do primeiro rastreador | `composables/useConsentimento.ts` |
| 8 | `/privacidade` e `/termos` liberados sem sessão | `middleware/auth.global.ts` |
| 9 | Links mortos `href="#"` do rodapé apontam para os documentos reais | `pages/index.vue`, `layouts/default.vue` |

---

## Como conferir que continua valendo

Medido em 07/08/2026, com `pnpm build` e o servidor construído rodando em porta avulsa.

```bash
# 1. As cinco famílias precisam estar auto-hospedadas.
#    Varra .output INTEIRO — só public/**/*.css engana (ver nota acima).
grep -rho "@font-face{[^}]*}" .output --include=*.css --include=*.mjs \
  | grep -o "font-family:[^;}]*" | sort | uniq -c
# esperado: Hanken Grotesk 40, Archivo Narrow 32, Archivo 32, Besley 18, Fragment Mono 8

# 2. Nenhuma referência a domínio de fonte do Google.
grep -rl "fonts.googleapis.com\|fonts.gstatic.com" .output
# esperado: vazio

# 3. Nenhum domínio de terceiro no HTML entregue ao visitante anônimo.
curl -s http://localhost:3200/ | grep -oE 'https?://[a-zA-Z0-9.-]+' | sort -u
# esperado: só o próprio host e https://schema.org — este último é o @context
# do JSON-LD, string de vocabulário que o navegador nunca busca

# 4. Rotas legais públicas, rotas do app ainda protegidas.
for r in / /privacidade /termos /dashboard; do
  curl -s -o /dev/null -w "$r -> %{http_code}\n" "http://localhost:3200$r"; done
# esperado: 200, 200, 200, 302
```

Confere também que `/termos` renderiza as 12 cláusulas e que `/privacidade` cita nominalmente `better-auth.session_token`, `better-auth.state`, `ld_aceite_termos`, `ld_consentimento`, `__cf_bm`, `_cfuvid` e `nuxt-color-mode` — se um cookie novo aparecer no produto sem aparecer ali, a política virou declaração falsa.

## Regra vinculante para scripts de terceiros

> **Nenhum script de terceiro entra no `<head>` direto.** Todo rastreador, pixel, mapa de calor ou ferramenta de audiência carrega condicionado a `useConsentimento()`, e só depois de `aceitou()` devolver `true` para a categoria dele.

No dia em que o primeiro entrar, `AvisoCookies` deixa de ser aviso e vira banner de duas camadas: "aceitar todos" e "rejeitar todos" com o mesmo destaque na primeira, granularidade por categoria na segunda, tudo desmarcado por padrão. `useConsentimento()` já suporta isso — falta só a interface.

O mesmo vale para fontes, ícones, iframes e widgets: se a requisição sai do navegador do titular para um domínio de terceiro, ela é tratamento e precisa de base legal.

---

## Pendências — não implementadas, por ordem de gravidade

### 1. Controlador não identificado 🔴

`[RAZÃO SOCIAL]`, `[CNPJ]`, `[CIDADE/UF]` e `[E-MAIL DE CONTATO]` seguem em branco nos Termos **já aceitos por usuários reais**, e agora também na Política. O art. 9º, I exige identificação do controlador; o art. 41, a do encarregado. Enquanto não forem preenchidos, o contrato não identifica a parte.

Há aviso vermelho renderizado **em desenvolvimento** (`import.meta.dev`) nas duas páginas, para que a lacuna não passe batida. Ele não aparece para o usuário final.

### 2. Sem exclusão nem exportação de conta 🔴

Não existe endpoint (art. 18, §3º). Pior: `api_keys.created_by` é `ON DELETE restrict` e chega a **bloquear** a exclusão do usuário. Hoje a Política declara honestamente que o atendimento é manual — o que é aceitável como transição, não como estado permanente.

### 3. Retenção indefinida de dado pessoal de terceiros 🔴

`jobs.stage_data` (texto OCR bruto) e `jobs.result` guardam nome, CPF, estado civil, endereço e ônus dos titulares das matrículas **sem prazo de expurgo**. O binário sai do GCS logo após o OCR (`softDeleteJobFile`), com lifecycle de 7 dias como rede de segurança — mas o texto extraído fica para sempre. Arts. 15 e 16 exigem término do tratamento quando a finalidade se exaure.

### 4. Tokens OAuth do Google em texto claro 🟠

`account.encryptOAuthTokens` não está habilitado em `server/lib/auth.ts`, então `access_token`, `refresh_token` e `id_token` ficam legíveis no Postgres (art. 46).

### 5. Aceite dos Termos pode escapar sem registro 🟠

O cookie `ld_aceite_termos` vive 30 min e a validação de tela usa o `ref` em memória, não o cookie. Quem marca a caixa, se distrai e volta depois consegue criar conta **sem linha em `terms_acceptances`** — a falha só vira `console.warn` (`server/lib/registrarAceiteTermos.ts:25-31`). Contas criadas por script também nunca têm registro.

### 6. `terms_acceptances` — IP completo e cascade 🟠

Guarda IP **não truncado** por prazo indefinido (decisão deliberada: "evidência truncada vale menos"). E o `ON DELETE cascade` destrói a prova do aceite junto com o titular — tensão entre o art. 16, II e o dever de prestação de contas que merece decisão explícita, não herança de default.

### 7. Transferência internacional sem lastro documental 🟠

Arts. 33–36. Os destinos estão agora declarados na Política, mas não há DPA nem lista de suboperadores versionada no repositório, embora os Termos afirmem obrigação contratual de confidencialidade e não-treinamento. Vale reunir os termos de cada fornecedor num anexo.

### 8. `semTelemetria.ts` versus dever de transparência 🟡

O módulo existe para **ocultar do cliente quais fornecedores de IA são usados** (regex sobre `gpt-|claude|anthropic|openai|mistral|document-ai|gemini|vertex|bedrock`). É decisão comercial legítima, mas colide com os arts. 6º, VI e 9º. A Política resolveu parcialmente ao listar os fornecedores por nome — o que torna o filtro incoerente com o documento público. Decidir de que lado ficar.

### 9. Canal oficial em e-mail pessoal 🟡

`mailto:jose.tarallo@gmail.com` aparece como suporte e contato comercial. Inadequado para exercício de direitos do titular; falta encarregado nomeado (art. 41).

### 10. Account linking permissivo 🟡

Com `REQUIRE_EMAIL_VERIFICATION=false`, quem se cadastra por senha usando e-mail alheio herda a conta quando o dono real entra pelo Google. Já registrado e aceito em `50-seguranca.md`, mas é risco de acesso indevido a dado pessoal.

---

## Ao mexer no produto, mexa aqui

`pages/privacidade.vue` descreve o que o código faz **hoje**. Política que descreve sistema imaginário é pior que política nenhuma: vira declaração falsa ao titular. Mudou cookie, suboperador, prazo de retenção ou base legal — a página muda junto, no mesmo commit.
