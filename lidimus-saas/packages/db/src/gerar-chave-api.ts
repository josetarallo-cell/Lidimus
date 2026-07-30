import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

import { and, desc, eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.ts'
import { apiKeys, organizations, orgMembers, users } from './schema.ts'
import { planoLiberaApi, nomeDoPlano } from './planos.ts'
import { gerarChave, validadeDaChave, filtroChaveAtiva, MAX_CHAVES_ATIVAS } from './apiKey.ts'

// Emissão de chave da API pela linha de comando.
//
// Existe para o onboarding de Enterprise e para o suporte destravar um cliente
// sem pedir a senha de ninguém. O que ele NÃO é: um atalho para as regras. Ele
// importa planoLiberaApi e gerarChave — os mesmos módulos que a rota HTTP usa —
// e recusa organização cujo plano não inclui a API. Um script de manutenção que
// furasse o gate tornaria o gate decorativo.
//
//   pnpm chave:api --org <uuid> --nome "ERP do cartório"
//   pnpm chave:api --org <uuid> --listar
//   pnpm chave:api --revogar ldm_live_a1b2c3d4

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  if (i === -1) return undefined
  const valor = process.argv[i + 1]
  // `--listar` é bandeira sem valor; devolve string vazia para diferenciar de
  // ausente sem engolir o argumento seguinte.
  return valor && !valor.startsWith('--') ? valor : ''
}

function temBandeira(nome: string): boolean {
  return process.argv.includes(`--${nome}`)
}

function morrer(mensagem: string): never {
  console.error(`\n  ${mensagem}\n`)
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) morrer('DATABASE_URL não configurada. Rode a partir de lidimus-saas/ com o .env preenchido.')

const client = postgres(url, { max: 1 })
const db = drizzle(client, { schema })

// O .env local aponta para o banco de produção (ver docs/10-ambiente-local.md).
// Dizer em qual banco vamos escrever antes de escrever é o mínimo.
const hostMascarado = url.replace(/:[^:@/]*@/, ':***@')
console.log(`\n  banco: ${hostMascarado}`)

async function encerrar(codigo = 0): Promise<never> {
  await client.end()
  process.exit(codigo)
}

// ── Revogar ────────────────────────────────────────────────
// Aceita o prefixo, nunca o token: linha de comando vai para o histórico do
// shell, e um token completo no histórico é um token vazado.
if (temBandeira('revogar')) {
  const prefix = argumento('revogar')
  if (!prefix) morrer('Informe o prefixo da chave: --revogar ldm_live_a1b2c3d4')

  const revogadas = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.prefix, prefix), sql`${apiKeys.revokedAt} is null`))
    .returning({ id: apiKeys.id, name: apiKeys.name, orgId: apiKeys.orgId })

  if (!revogadas.length) {
    console.log(`\n  Nenhuma chave ativa com o prefixo ${prefix}.\n`)
    await encerrar(1)
  }

  for (const chave of revogadas) {
    console.log(`\n  Revogada: "${chave.name}" (${prefix}) da organização ${chave.orgId}`)
  }
  console.log('\n  A próxima chamada da integração que a usava vai falhar com 401.\n')
  await encerrar()
}

// ── Resolver a organização ─────────────────────────────────
const orgId = argumento('org')
if (!orgId) {
  morrer(
    'Uso:\n' +
      '    pnpm chave:api --org <uuid> --nome "ERP do cartório"\n' +
      '    pnpm chave:api --org <uuid> --listar\n' +
      '    pnpm chave:api --revogar ldm_live_a1b2c3d4',
  )
}

const [org] = await db
  .select({ id: organizations.id, name: organizations.name })
  .from(organizations)
  .where(eq(organizations.id, orgId))
  .limit(1)

if (!org) morrer(`Organização ${orgId} não existe.`)
console.log(`  organização: ${org.name}`)

// ── Listar ─────────────────────────────────────────────────
if (temBandeira('listar')) {
  const linhas = await db
    .select({
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.orgId, org.id))
    .orderBy(desc(apiKeys.createdAt))

  if (!linhas.length) {
    console.log('\n  Nenhuma chave emitida.\n')
    await encerrar()
  }

  console.log('')
  for (const chave of linhas) {
    const situacao = chave.revokedAt
      ? 'revogada'
      : chave.expiresAt <= new Date()
        ? 'expirada'
        : 'ativa'
    const uso = chave.lastUsedAt ? chave.lastUsedAt.toISOString().slice(0, 16).replace('T', ' ') : 'nunca usada'
    // Nunca o token — ele não existe em lugar nenhum depois da emissão.
    console.log(`  ${chave.prefix}…  ${situacao.padEnd(9)} último uso: ${uso}  "${chave.name}"`)
  }
  console.log('')
  await encerrar()
}

// ── Emitir ─────────────────────────────────────────────────
const nome = argumento('nome')
if (!nome) morrer('Informe o nome da chave: --nome "ERP do cartório"')

// O gate, igual ao da rota HTTP e do endpoint da tela.
if (!(await planoLiberaApi(db, org.id))) {
  const plano = await nomeDoPlano(db, org.id)
  morrer(
    plano
      ? `A organização está no plano ${plano}, que não inclui a API.\n  Planos com API: Escritório e Enterprise.`
      : 'A organização não tem assinatura ativa, então não inclui a API.\n  Planos com API: Escritório e Enterprise.',
  )
}

// A chave é sempre emitida no nome de quem é dono — não existe `--usuario`. A
// análise criada pela API é atribuída a essa pessoa (jobs.user_id), então precisa
// ser quem responde pela conta, igual à emissão pela tela.
const [dono] = await db
  .select({ id: users.id, name: users.name, email: users.email })
  .from(orgMembers)
  .innerJoin(users, eq(users.id, orgMembers.userId))
  .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.role, 'owner')))
  .limit(1)

if (!dono) morrer(`A organização ${org.name} não tem proprietário — não há a quem atribuir a chave.`)
console.log(`  proprietário: ${dono.name} <${dono.email}>`)

const [{ ativas }] = await db
  .select({ ativas: sql<number>`count(*)::int` })
  .from(apiKeys)
  .where(and(eq(apiKeys.orgId, org.id), filtroChaveAtiva()))

if (ativas >= MAX_CHAVES_ATIVAS) {
  morrer(
    `A organização já tem ${MAX_CHAVES_ATIVAS} chaves ativas.\n` +
      '  Revogue uma antes de emitir outra: pnpm chave:api --revogar <prefixo>',
  )
}

const { token, prefix, keyHash } = gerarChave()
const expiresAt = validadeDaChave()

await db
  .insert(apiKeys)
  .values({ orgId: org.id, createdBy: dono.id, name: nome, prefix, keyHash, expiresAt })

console.log(`
  Chave emitida: "${nome}"
  Válida até:    ${expiresAt.toLocaleDateString('pt-BR')}

  ${token}

  Esta é a única vez que a chave aparece — o banco guarda apenas o SHA-256.
  Entregue pelo cofre de senhas do cliente, nunca por e-mail ou mensagem.

  ATENÇÃO: cada análise enviada por esta chave debita créditos do plano da
  organização. Quem tiver a chave gasta esse saldo em nome dela.

  O token acabou de entrar no histórico deste terminal. Para limpá-lo:
    PowerShell  Clear-History; Remove-Item (Get-PSReadlineOption).HistorySavePath
    bash        history -c
`)

await encerrar()
