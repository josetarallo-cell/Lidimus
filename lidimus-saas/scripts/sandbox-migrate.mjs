// Aplica as migrations no banco do SANDBOX (127.0.0.1:5433).
//
// Por que um wrapper em vez de `pnpm db:migrate`: o migrate.ts carrega
// ../../../.env — o de PRODUÇÃO — para achar a DATABASE_URL. Rodar o script
// puro aponta para o banco do site no ar. O dotenv não sobrescreve chave já
// presente em process.env, então injetar a URL do sandbox aqui basta para
// vencer o arquivo.

import { spawn } from 'node:child_process'
import { lerEnvSandbox, raiz, semSegredo } from './sandbox-env.mjs'

const env = lerEnvSandbox()

// Trava explícita: um .env.sandbox editado à mão que apontasse para a 5432
// aplicaria migrations no banco de produção.
if (!/127\.0\.0\.1:5433|localhost:5433/.test(env.DATABASE_URL || '')) {
  console.error(
    `DATABASE_URL do sandbox não aponta para a porta 5433: ${semSegredo(env.DATABASE_URL)}\n` +
    'Recusando aplicar migrations — corrija o .env.sandbox.',
  )
  process.exit(1)
}

console.log(`migrando: ${semSegredo(env.DATABASE_URL)}\n`)

const filho = spawn('pnpm', ['--filter', 'db', 'migrate'], {
  cwd: raiz,
  env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
  stdio: 'inherit',
  shell: true,
})

filho.on('exit', (code) => process.exit(code ?? 0))
