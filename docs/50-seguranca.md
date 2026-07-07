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

## Como o download de arquivo é protegido

Cada upload gera um `access_token` aleatório (`packages/db` tabela `job_files`) usado para montar a URL que o n8n usa para baixar o arquivo (`buildFileUrl` em `server/lib/jobFile.ts`). O arquivo é servido via signed URL do GCS e o token é conferido contra o `jobId` antes de gerar a URL assinada — depois do processamento, o arquivo é soft-deletado (`deleted_at`) e removido do GCS (`softDeleteJobFile`). Não exponha esse token em logs.

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
