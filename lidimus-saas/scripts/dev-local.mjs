// Sobe o Nuxt em modo dev (hot reload) NO HOST, em paralelo com os containers.
//
// Por que existe: o `web` do compose também é o site público (o cloudflared
// publica esse mesmo container em PUBLIC_BASE_URL), então parar o container
// para liberar a porta 3000 tira o site do ar. Aqui o dev server sobe numa
// porta própria e os containers ficam intactos.
//
// O que muda em relação ao `pnpm dev` puro: o .env aponta para os hostnames
// da rede do Docker (`postgres`, `redis`), que não resolvem no host. Este
// script reescreve só esses dois para 127.0.0.1 (as portas são publicadas
// pelo compose) e acrescenta a origem do dev server às confiáveis do Better
// Auth. Todo o resto — segredos, chave do GCS, PUBLIC_BASE_URL — continua
// vindo do .env, sem cópia paralela para sair de sincronia.
//
// PUBLIC_BASE_URL fica de propósito apontando para o domínio público: é o
// endereço que o n8n usa para baixar o arquivo e devolver o callback. Como
// os dois processos compartilham Postgres, Redis e GCS, um job criado aqui é
// processado pelo worker do container e o resultado aparece nos dois.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const porta = process.env.PORT_DEV || '3001'

// Leitura pontual do .env: só as chaves abaixo, todas valores simples de uma
// linha. Não é um parser de .env — o arquivo real tem JSON longo em outras
// chaves, e essas ficam por conta do --dotenv do próprio Nuxt.
function valorDoEnv(bruto, chave) {
  const achado = bruto.match(new RegExp(`^${chave}=(.*)$`, 'm'))
  if (!achado) return ''
  return achado[1].trim().replace(/^["']|["']$/g, '')
}

let envBruto = ''
try {
  envBruto = readFileSync(resolve(raiz, '.env'), 'utf8')
} catch {
  console.error('Não encontrei lidimus-saas/.env — copie de .env.example antes de rodar.')
  process.exit(1)
}

const paraOHost = (url) => url.replace(/@postgres:/, '@127.0.0.1:').replace(/\/\/redis:/, '//127.0.0.1:')

const databaseUrl = paraOHost(valorDoEnv(envBruto, 'DATABASE_URL'))
const redisUrl = paraOHost(valorDoEnv(envBruto, 'REDIS_URL'))

// O Better Auth só confia na origem derivada de PUBLIC_BASE_URL; sem isso,
// login e cadastro no dev server respondem 403 Invalid origin.
const origensDoEnv = valorDoEnv(envBruto, 'BETTER_AUTH_TRUSTED_ORIGINS')
const origens = [...new Set([
  ...origensDoEnv.split(',').map((o) => o.trim()).filter(Boolean),
  `http://localhost:${porta}`,
  `http://127.0.0.1:${porta}`,
])].join(',')

// c12 (o carregador de .env do Nuxt) não sobrescreve chave que já existe no
// process.env — por isso estes valores vencem os do arquivo.
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  BETTER_AUTH_TRUSTED_ORIGINS: origens,
  NUXT_PORT: porta,
}

console.log(`dev server:  http://localhost:${porta}  (hot reload)`)
console.log(`banco:       ${databaseUrl.replace(/:[^:@/]*@/, ':***@')}`)
console.log(`containers:  intactos — o site público continua no ar\n`)

const filho = spawn('pnpm', ['--filter', 'web', 'dev'], {
  cwd: raiz,
  env,
  stdio: 'inherit',
  shell: true,
})

filho.on('exit', (code) => process.exit(code ?? 0))
