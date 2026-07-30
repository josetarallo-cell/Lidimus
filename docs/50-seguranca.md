# Segurança

Firewall, SSL, segredos e rotina de atualização para o Lidimus em produção.

## Superfície exposta

Em `docker-compose.prod.yml`, **só a porta 3000 (`web`) é publicada**. Postgres e Redis não têm portas mapeadas para o host — só são acessíveis pela rede interna do Docker Compose. Isso já reduz bastante a superfície de ataque; o principal cuidado extra é:

- Colocar um reverse proxy (nginx / Caddy / Traefik) na frente da porta 3000, terminando TLS ali, e não expor a 3000 diretamente à internet.
- Confirmar que o firewall da VPS bloqueia todas as portas exceto 80/443 (proxy) e a porta de SSH.

## Firewall (exemplo com `ufw`)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

Não abra 5432, 6379 ou 3000 diretamente — tudo deve passar pelo proxy reverso em 443. Se precisar acessar o Postgres remotamente para debug, use túnel SSH (ver [30-banco-de-dados.md](30-banco-de-dados.md)), nunca abra a porta.

## SSL

- Termine TLS no reverse proxy, não no Nuxt.
- Use Let's Encrypt (`certbot` para nginx, ou automático se usar Caddy/Traefik).
- Renovação automática — confirme que o cron/systemd timer do certbot está ativo (`certbot renew --dry-run`).
- `BETTER_AUTH_URL` e `PUBLIC_BASE_URL` devem usar `https://` em produção — o n8n externo também depende de `PUBLIC_BASE_URL` estar correto e acessível para baixar arquivos e enviar callbacks.

## Segredos: o que existe e onde vive

| Segredo | Onde fica | Rotação |
|---|---|---|
| `BETTER_AUTH_SECRET` | `.env` / `.env.prod` | trocar invalida todas as sessões ativas |
| `N8N_CALLBACK_SECRET` | `.env` / `.env.prod` **e** configurado nos workflows do n8n | trocar exige atualizar nos dois lados ao mesmo tempo (senão os callbacks passam a ser rejeitados com 401) |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | `.env.prod` | trocar exige reiniciar `postgres`/`redis` e atualizar `DATABASE_URL`/`REDIS_URL` no mesmo `.env.prod` |
| `GOOGLE_CLOUD_SA_KEY_JSON` | `.env` / `.env.prod` | rotacionar pela console do GCP (criar nova chave da service account, revogar a antiga) |
| `access_token` de `job_files` | gerado por job (32 bytes aleatórios, `crypto.randomBytes`) | não precisa rotação manual — é de uso único por job e soft-deletado após consumo |
| `ANTHROPIC_API_KEY` | `.env` / `.env.prod` (reservado para uso futuro) | rotacionar pela console da Anthropic |

Regras:

- `.env` e `.env.prod` **nunca** são commitados (confira com `git status` antes de qualquer commit amplo — um `git add -A` acidental é o risco mais comum aqui).
- Nunca reutilize o mesmo `BETTER_AUTH_SECRET` ou `N8N_CALLBACK_SECRET` entre ambiente local e produção.
- Segredos "change-me..." do `.env.example` **têm que** ser substituídos antes de qualquer deploy real — não é só recomendação, o `N8N_CALLBACK_SECRET` default tornaria o endpoint de callback previsível.

## Como a autenticação funciona

- `better-auth` com adapter Drizzle, e-mail/senha habilitado (`apps/web/server/lib/auth.ts`).
- Middleware (`server/middleware/auth.ts`) injeta `event.context.user`/`session` em toda requisição — rotas protegidas checam isso (ver `server/lib/requireAuth.ts`).
- Sessões ficam na tabela `sessions` — revogar acesso de um usuário específico é apagar/expirar a linha correspondente, ou trocar `BETTER_AUTH_SECRET` para revogar todas de uma vez (impacto: todo mundo é deslogado).

## Verificação de e-mail e vínculo com o login Google

Controlado por `REQUIRE_EMAIL_VERIFICATION` (`.env`, default `false`). Ligado, ele:

- exige confirmação do e-mail antes do primeiro login por senha (`emailAndPassword.requireEmailVerification`);
- envia o link no cadastro e reenvia a cada tentativa de login não verificada (`emailVerification.sendOnSignUp` / `sendOnSignIn`);
- volta a exigir e-mail local verificado para vincular o login Google a uma conta de senha existente (`account.accountLinking.requireLocalEmailVerified`).

**Pré-requisito para ligar:** `EMAIL_FROM` em domínio verificado no Resend. Com o remetente padrão `onboarding@resend.dev`, o Resend só entrega ao dono da conta — todo cadastro novo ficaria sem receber o link e sem conseguir entrar.

Enquanto estiver desligado, existe uma brecha conhecida e aceita: quem se cadastrar por senha usando o e-mail de outra pessoa fica com a conta vinculada quando o dono real entrar pelo Google. As duas travas sobem juntas de propósito — ligar a verificação fecha a brecha no mesmo movimento.

## Como o download de arquivo é protegido

Cada upload gera um `access_token` aleatório (`packages/db` tabela `job_files`) usado para montar a URL que o n8n usa para baixar o arquivo (`buildFileUrl` em `server/lib/jobFile.ts`). O arquivo é servido via signed URL do GCS e o token é conferido contra o `jobId` antes de gerar a URL assinada — depois do processamento, o arquivo é soft-deletado (`deleted_at`) e removido do GCS (`softDeleteJobFile`). Não exponha esse token em logs.

## Chaves da API pública

A credencial da API (`api_keys`, ver [70-api-publica.md](70-api-publica.md)) é a segunda forma de autenticar no sistema, e foi desenhada para **não** herdar os poderes da sessão.

**Como a chave é guardada.** 32 bytes de CSPRNG em base64url (256 bits), prefixados por `ldm_live_`. O banco recebe só o SHA-256 — o token em claro existe uma única vez, na resposta da emissão. SHA-256 sem sal e sem KDF é a escolha certa aqui, pelo mesmo motivo do token de convite: é segredo aleatório de alta entropia, não senha de gente, e o lookup precisa ser um índice único. O prefixo fixo serve para scanner de segredos (push protection, gitleaks) reconhecer a credencial e barrar o commit antes de o cliente vazá-la no repositório dele.

**Estanqueidade.** `server/lib/requireApiKey.ts` é paralelo ao `requireAuth`, e não um ramo do `server/middleware/auth.ts`. Consequências que valem por si: a v1 nunca autentica por cookie, então nenhuma requisição de navegador de terceiro se autentica sozinha (não há superfície de CSRF na API); e as rotas de sessão nunca aceitam chave, então uma chave vazada não abre painel, equipe, Stripe ou troca de plano.

**Autorização é sempre lida do plano, a cada requisição.** A chave identifica; quem autoriza é `features.api` do plano vigente. Rebaixamento, cancelamento e inadimplência cortam a API na chamada seguinte, sem depender de alguém lembrar de revogar chave. Uma chave não é um passe permanente.

**Quem emite.** Só o proprietário da organização (`exigirDono`), e só em plano com a marca. A chave é da organização e pode ser compartilhada — por isso a tela exige confirmação explícita de que o consumo debita os créditos do plano antes de emitir.

**Demais defesas:**

- Prazo obrigatório de 365 dias (`expires_at` é NOT NULL) — chave sem prazo é chave nunca rotacionada. Máximo de 5 ativas por organização.
- Revogação preenche `revoked_at` (não apaga a linha): o histórico de quem emitiu o que sobrevive à chave.
- Chave inexistente, revogada e expirada devolvem **o mesmo** 401. Distinguir os casos confirmaria a quem sonda que o token em mãos existe de verdade.
- Chave cujo emissor deixou de ser membro da organização para de valer (`chave_orfa`): credencial de ex-integrante não segue gastando o crédito de quem ficou.
- HTTPS obrigatório em produção (`x-forwarded-proto`): credencial de portador em canal claro é credencial vazada, e o cliente merece o erro alto. Token em query string nunca é aceito — query string vaza para log de acesso, proxy e `Referer`.
- Três limites por hora: 120 por organização, 120 por chave (isola o culpado quando a chave é compartilhada) e 20 falhas de autenticação por IP a cada 5 minutos, contadas só em falha, antes de consultar o Postgres.
- Respostas da v1 vão com `Cache-Control: no-store`, e o cabeçalho `Authorization` não é ecoado em log.
- O resultado devolvido pela API é filtrado (`server/lib/v1/serializarJob.ts`): `stage_data` (OCR bruto) e `result.usage` (tokens e custo por modelo) ficam de fora. O `usage` é telemetria de margem — diz quanto a análise nos custou, e não é assunto de quem compra.
- Não exponha o token em logs, e ao excluir um usuário lembre que `api_keys.created_by` é `ON DELETE restrict`: as chaves dele precisam ser tratadas antes.

## Callback do n8n

`server/api/webhooks/n8n-callback.post.ts` aceita dois esquemas de autenticação, ambos comparados com `timingSafeEqual` (evita timing attack):

- `X-Lidimus-Signature`: HMAC-SHA256 do corpo bruto, assinado com `N8N_CALLBACK_SECRET`
- `X-Lidimus-Secret`: o segredo estático enviado diretamente

Se o callback começar a falhar com 401 depois de um deploy, o `N8N_CALLBACK_SECRET` dessincronizou entre o `.env.prod` e a configuração do workflow no n8n — ver [90-troubleshooting.md](90-troubleshooting.md).

## Atualizações e dependências

- **Imagens base** (`node:20-alpine`, `postgres:16-alpine`, `redis:7-alpine`): acompanhe CVEs; rebuildar periodicamente traz patches de segurança do Alpine mesmo sem mudar o Dockerfile (a tag `:20-alpine` aponta para a última patch da major 20).
- **Dependências npm**: rode `pnpm audit` no monorepo periodicamente; atualizações de `better-auth`, `drizzle-orm` e `bullmq` merecem teste em ambiente local antes de ir para produção (não são simples troca de versão sem risco de breaking change).
- **n8n externo**: como não está neste repositório, sua atualização e patch de segurança são responsabilidade de quem administra aquele servidor — confirme periodicamente que está atualizado.

## Checklist de hardening antes de ir ao ar

- [ ] Todos os segredos de `.env.prod` são valores reais, não os placeholders de `.env.example`
- [ ] Porta 3000 não está exposta diretamente à internet (só via proxy com TLS)
- [ ] `ufw`/firewall só permite 22, 80, 443
- [ ] Certificado TLS válido e renovação automática confirmada
- [ ] `BETTER_AUTH_URL` / `PUBLIC_BASE_URL` em `https://`
- [ ] Backup do banco configurado e testado (restore, não só o dump) — ver [30-banco-de-dados.md](30-banco-de-dados.md)
- [ ] `N8N_CALLBACK_SECRET` idêntico entre `.env.prod` e os workflows do n8n
- [ ] Domínio verificado no Resend e `EMAIL_FROM` apontando para ele
- [ ] `REQUIRE_EMAIL_VERIFICATION=true` (depende do item acima)
- [ ] `API_RATE_LIMIT_PER_HOUR` revisado para o volume real dos clientes de API (padrão 120)
