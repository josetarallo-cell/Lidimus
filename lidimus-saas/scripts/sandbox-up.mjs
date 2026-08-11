// Sobe o sandbox, validando o .env.sandbox antes.
//
// A validação (em sandbox-env.mjs) recusa: valor de produção onde não devia,
// e divergência entre `X` e `NUXT_X` — que no container `web` se manifesta
// como um valor silenciosamente antigo, não como erro.
//
// Aceita nomes de serviço: `pnpm sandbox:up postgres redis worker` sobe só
// esses três (o modo de iteração rápida, em que o Nuxt roda no host).

import { spawn } from 'node:child_process'
import { lerEnvSandbox, raiz, semSegredo } from './sandbox-env.mjs'

const env = lerEnvSandbox()
const servicos = process.argv.slice(2)

console.log(`sandbox:   projeto lidimus-sandbox (web 3100, pg 5433, redis 6380)`)
console.log(`banco:     ${semSegredo(env.DATABASE_URL)}`)
console.log(`bucket:    ${env.GCS_BUCKET_NAME}`)
console.log(`produção:  intacta — este compose não tem cloudflared\n`)

const filho = spawn(
  'docker',
  ['compose', '-f', 'docker-compose.sandbox.yml', '--env-file', '.env.sandbox',
   'up', '-d', '--build', ...servicos],
  { cwd: raiz, stdio: 'inherit', shell: true },
)

filho.on('exit', (code) => process.exit(code ?? 0))
