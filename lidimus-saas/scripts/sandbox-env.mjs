// Leitura do .env.sandbox e tradução dos hostnames do Docker para o host.
//
// Compartilhado por dev-sandbox.mjs, sandbox-migrate.mjs e sandbox-seed.mjs.
// Existe para que os três NUNCA caiam no .env de produção por omissão: o
// carregamento é sempre explícito e o arquivo precisa existir.

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const CAMINHO_ENV = resolve(raiz, '.env.sandbox')

// Portas do sandbox no host (o compose publica 5433/6380/3100)
export const PORTA_WEB = process.env.PORTA_WEB_SANDBOX || '3100'
const PORTA_PG = '5433'
const PORTA_REDIS = '6380'

// Dentro do compose os serviços se acham por `postgres`/`redis`; do host, não.
// Traduz para 127.0.0.1 nas portas publicadas — mesma ideia do dev-local.mjs,
// mas nas portas do sandbox, nunca nas de produção (5432/6379).
export function paraOHost(url) {
  if (!url) return url
  return url
    .replace(/@postgres:5432/, `@127.0.0.1:${PORTA_PG}`)
    .replace(/\/\/redis:6379/, `//127.0.0.1:${PORTA_REDIS}`)
}

// Chaves que o container `web` precisa ver TAMBÉM com o prefixo NUXT_.
//
// Não é redundância: num Nuxt buildado (que é o que roda no container), o
// nuxt.config já foi executado no build e os `process.env.X` do runtimeConfig
// viraram valores fixos. Em runtime só a variável NUXT_<CHAVE> sobrescreve —
// o nome sem prefixo é ignorado. O compose de produção resolve isso com um
// bloco `environment:` remapeando ${VAR}; aqui a duplicação mora no próprio
// .env.sandbox, porque interpolar ${} no compose faria o Compose ler o `.env`
// de PRODUÇÃO sempre que alguém esquecesse o `--env-file`.
//
// O worker, ao contrário, lê process.env direto (packages/workers/src/index.ts)
// e usa os nomes sem prefixo — daí as duas formas precisarem coexistir.
export const CHAVES_ESPELHADAS_NUXT = [
  'DATABASE_URL', 'REDIS_URL', 'BETTER_AUTH_SECRET', 'N8N_CALLBACK_SECRET',
  'PUBLIC_BASE_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY', 'EMAIL_FROM', 'REQUIRE_EMAIL_VERIFICATION',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'USD_BRL_RATE',
  'UPLOAD_RATE_LIMIT_PER_HOUR', 'API_RATE_LIMIT_PER_HOUR',
  'MAX_UPLOAD_SIZE_MB', 'MAX_BATCH_FILES', 'MAX_BATCH_TOTAL_MB',
]

// Pega a divergência assim que alguém edita um lado e esquece o outro — o
// sintoma sem isso é sutil: o container `web` continua subindo, só que com o
// valor antigo (ou com "DATABASE_URL not configured", se o par nunca existiu).
export function verificarEspelhoNuxt(bruto) {
  const problemas = []
  for (const chave of CHAVES_ESPELHADAS_NUXT) {
    const semPrefixo = bruto.match(new RegExp(`^${chave}=(.*)$`, 'm'))
    const comPrefixo = bruto.match(new RegExp(`^NUXT_${chave}=(.*)$`, 'm'))
    if (!semPrefixo) continue
    if (!comPrefixo) problemas.push(`NUXT_${chave} ausente`)
    else if (semPrefixo[1].trim() !== comPrefixo[1].trim()) problemas.push(`NUXT_${chave} ≠ ${chave}`)
  }
  return problemas
}

// Parser deliberadamente simples: só linhas KEY=valor de uma linha. O
// .env.sandbox é gerado nesse formato (o SA key JSON cabe em uma linha).
export function lerEnvSandbox() {
  if (!existsSync(CAMINHO_ENV)) {
    console.error(
      'Não encontrei lidimus-saas/.env.sandbox.\n' +
      'Copie de .env.sandbox.example e preencha — ver docs/15-sandbox.md.',
    )
    process.exit(1)
  }

  const bruto = readFileSync(CAMINHO_ENV, 'utf8')
  const env = {}
  for (const linha of bruto.split(/\r?\n/)) {
    if (!linha || linha.trimStart().startsWith('#')) continue
    const achado = linha.match(/^([A-Za-z0-9_]+)=([\s\S]*)$/)
    if (!achado) continue
    env[achado[1]] = achado[2].trim().replace(/^["']|["']$/g, '')
  }

  // Traduz em TODAS as chaves, não só em DATABASE_URL/REDIS_URL: os espelhos
  // NUXT_* carregam a mesma URL e vencem o valor sem prefixo no runtimeConfig,
  // então deixar um par sem traduzir faz o dev server tentar resolver o
  // hostname `postgres` a partir do host (ENOTFOUND). É no-op nas demais.
  for (const chave of Object.keys(env)) env[chave] = paraOHost(env[chave])

  // Rede de segurança: se algum valor de produção sobreviver a uma edição
  // manual do .env.sandbox, é melhor falhar aqui do que descobrir depois de
  // um e-mail enviado ou um crédito debitado.
  const suspeitos = Object.entries(env).filter(([chave, valor]) => {
    if (chave === 'N8N_BASE_URL' || chave === 'N8N_API_KEY') return false // n8n é compartilhado de propósito
    return /lidimus\.gvlar\.com|lidimus-job-files/.test(valor)
  })
  if (suspeitos.length) {
    console.error('.env.sandbox aponta para produção nestas chaves:', suspeitos.map(([c]) => c).join(', '))
    process.exit(1)
  }

  const divergentes = verificarEspelhoNuxt(bruto)
  if (divergentes.length) {
    console.error(
      '.env.sandbox está fora de sincronia entre as formas com e sem prefixo NUXT_:\n  ' +
      divergentes.join('\n  ') +
      '\n\nO container `web` (Nuxt buildado) só enxerga as NUXT_*. Acerte os dois lados.',
    )
    process.exit(1)
  }

  return env
}

// Máscara para log: senha de URL e valores longos (chaves) não aparecem.
export function semSegredo(url) {
  return String(url || '').replace(/:[^:@/]*@/, ':***@')
}
