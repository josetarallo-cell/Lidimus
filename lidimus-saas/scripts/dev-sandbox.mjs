// Sobe o Nuxt em modo dev (hot reload) contra o SANDBOX, na porta 3100.
//
// Diferença para o dev-local.mjs: aquele é acesso a PRODUÇÃO com hot reload —
// mesmo banco, mesmo Redis, mesmo GCS, PUBLIC_BASE_URL no domínio público.
// Este aponta tudo para o ambiente isolado do docker-compose.sandbox.yml.
//
// Pré-requisito: `pnpm sandbox:up postgres redis worker` (o container `web` do
// sandbox fica fora, senão os dois disputam a porta 3100 — e é justamente por
// usarem a mesma porta que PUBLIC_BASE_URL serve aos dois modos sem edição).
//
// O n8n continua sendo o de produção: ele recebe callbackUrl e fileUrl pelo
// payload, e alcança este processo por host.docker.internal:3100.

import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { lerEnvSandbox, raiz, PORTA_WEB, semSegredo } from './sandbox-env.mjs'

const env = lerEnvSandbox()

// Checagem de porta: se o container `web` do sandbox estiver de pé, o Nuxt
// falharia com EADDRINUSE bem depois, no meio do build.
function portaOcupada(porta) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(porta) })
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('error', () => resolve(false))
    setTimeout(() => { socket.destroy(); resolve(false) }, 1000)
  })
}

if (await portaOcupada(PORTA_WEB)) {
  console.error(
    `A porta ${PORTA_WEB} já está em uso — provavelmente o container web do sandbox.\n` +
    `Derrube-o com: docker compose -f docker-compose.sandbox.yml --env-file .env.sandbox stop web`,
  )
  process.exit(1)
}

// c12 (carregador de .env do Nuxt) não sobrescreve chave já presente em
// process.env, então estes valores vencem. Ainda assim passamos --dotenv
// apontando para o .env.sandbox: sem isso o script `dev` do apps/web puxaria
// o .env de PRODUÇÃO para preencher qualquer chave que faltasse aqui.
const ambiente = {
  ...process.env,
  ...env,
  NUXT_PORT: PORTA_WEB,
  NODE_ENV: 'development',
}

console.log(`sandbox dev:  http://localhost:${PORTA_WEB}  (hot reload)`)
console.log(`banco:        ${semSegredo(env.DATABASE_URL)}`)
console.log(`redis:        ${env.REDIS_URL}`)
console.log(`bucket:       ${env.GCS_BUCKET_NAME}`)
console.log(`callback n8n: ${env.PUBLIC_BASE_URL}/api/webhooks/n8n-callback`)
console.log(`produção:     intacta — nada aqui toca lidimus.gvlar.com\n`)

const filho = spawn(
  'pnpm',
  ['--filter', 'web', 'exec', 'nuxt', 'dev', '--dotenv', '../../.env.sandbox'],
  { cwd: raiz, env: ambiente, stdio: 'inherit', shell: true },
)

filho.on('exit', (code) => process.exit(code ?? 0))
