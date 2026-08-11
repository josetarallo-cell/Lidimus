// Prepara uma conta de teste no banco do SANDBOX.
//
// Uso:  pnpm sandbox:seed <email> [creditos]
//
// O que NÃO faz: criar o usuário. Cadastre-se normalmente em
// http://localhost:3100 — com REQUIRE_EMAIL_VERIFICATION=false o login é
// imediato, e a organização própria nasce na primeira chamada de API que
// precisa dela, já com os 150 créditos de SIGNUP_GRANT_CREDITS.
//
// O que faz, que a tela não faz:
//   1. marca users.is_platform_admin — libera as telas /admin/*
//   2. lança um crédito de admin_adjustment na organização própria, para
//      testes de volume sem esbarrar no saldo
//
// Roda via `tsx` para reaproveitar o pacote @lidimus/db (mesmo schema, mesmas
// regras) em vez de SQL solto que sairia de sincronia com as migrations.

import { spawn } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { lerEnvSandbox, raiz, semSegredo } from './sandbox-env.mjs'

const [email, creditosArg] = process.argv.slice(2)
if (!email) {
  console.error('Uso: pnpm sandbox:seed <email> [creditos]\nEx.: pnpm sandbox:seed teste@sandbox.local 5000')
  process.exit(1)
}
const creditos = Number(creditosArg ?? 5000)
if (!Number.isInteger(creditos) || creditos < 0) {
  console.error(`Créditos inválidos: ${creditosArg}`)
  process.exit(1)
}

const env = lerEnvSandbox()
if (!/127\.0\.0\.1:5433|localhost:5433/.test(env.DATABASE_URL || '')) {
  console.error(`DATABASE_URL do sandbox não aponta para a 5433: ${semSegredo(env.DATABASE_URL)} — recusando.`)
  process.exit(1)
}

// Script temporário: o pacote db não tem entrypoint de seed, e deixar um
// arquivo permanente lá dentro exporia um "dar créditos a quem eu quiser" ao
// alcance da produção. Nasce e morre na execução.
//
// Mora em packages/db/src/ e não no diretório temporário do sistema por dois
// motivos: os imports ficam relativos, e o `"type": "module"` do package.json
// vale ali — fora dele o tsx transpila para CJS e o top-level await quebra.
const alvo = resolve(raiz, 'packages/db/src', `.sandbox-seed-${process.pid}.ts`)

writeFileSync(alvo, `
import { eq, sql } from 'drizzle-orm'
import { createDb } from './index.ts'
import { users, organizations, orgMembers, creditTransactions } from './schema.ts'
import { getOrgCreditBalance } from './credits.ts'

const db = createDb(process.env.DATABASE_URL!)
const email = ${JSON.stringify(email)}
const creditos = ${creditos}

const [usuario] = await db.select().from(users).where(sql\`lower(\${users.email}) = lower(\${email})\`)
if (!usuario) {
  console.error('Usuário não encontrado: ' + email)
  console.error('Cadastre-se primeiro em http://localhost:3100 e rode de novo.')
  process.exit(1)
}

await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, usuario.id))
console.log('admin de plataforma: ' + email)

const [vinculo] = await db
  .select({ orgId: orgMembers.orgId })
  .from(orgMembers)
  .where(sql\`\${orgMembers.userId} = \${usuario.id} and \${orgMembers.role} = 'owner'\`)

if (!vinculo) {
  console.log('organização própria ainda não existe — ela nasce no primeiro acesso ao painel.')
  console.log('entre em http://localhost:3100/dashboard e rode o seed de novo para os créditos.')
} else if (creditos > 0) {
  await db.insert(creditTransactions).values({
    orgId: vinculo.orgId,
    delta: creditos,
    reason: 'admin_adjustment',
  })
  const saldo = await getOrgCreditBalance(db, vinculo.orgId)
  const [org] = await db.select({ nome: organizations.name }).from(organizations).where(eq(organizations.id, vinculo.orgId))
  console.log('creditados ' + creditos + ' em "' + (org?.nome ?? vinculo.orgId) + '" — saldo agora: ' + saldo)
}

process.exit(0)
`, 'utf8')

const filho = spawn('pnpm', ['--filter', 'db', 'exec', 'tsx', alvo], {
  cwd: raiz,
  env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
  stdio: 'inherit',
  shell: true,
})

filho.on('exit', (code) => {
  try { unlinkSync(alvo) } catch {}
  process.exit(code ?? 0)
})
