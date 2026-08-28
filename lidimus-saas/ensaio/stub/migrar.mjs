// O migrator do stub: aplica as migrations pendentes e escreve no MESMO ledger
// que o Drizzle usa (`drizzle.__drizzle_migrations`).
//
// Fidelidade aqui não é capricho. O pipeline não confia no código de saída do
// migrator — desde 27/08/2026 ele confere que o ledger cresceu exatamente o
// número de pendentes. Se este stub apenas fingisse, a conferência do pipeline
// não estaria sendo testada, que é o ponto todo do cenário.
//
// ENSAIO_MIGRACAO controla o comportamento:
//   aplica  (padrão) roda os .sql pendentes e registra cada um no ledger
//   ignora           sai com código 0 sem tocar em nada — é a reprodução exata
//                    da falha de 27/08: o migrator rodou no container ANTIGO,
//                    leu um journal sem a 0025, concluiu "nada pendente" e
//                    devolveu sucesso. O deploy subiu código novo contra schema
//                    velho e o rollback ficou proibido por uma mentira.
//   falha            sai com código 1

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RAIZ = '/app/drizzle'
const modo = process.env.ENSAIO_MIGRACAO || 'aplica'
const url = process.env.DATABASE_URL

if (modo === 'falha') {
  console.error('[migrar] ENSAIO_MIGRACAO=falha')
  process.exit(1)
}

if (modo === 'ignora') {
  console.log('[migrar] nada pendente (ENSAIO_MIGRACAO=ignora)')
  process.exit(0)
}

function psql(args, entrada) {
  const r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', input: entrada })
  if (r.status !== 0) {
    console.error(`[migrar] psql falhou: ${(r.stderr || '').trim()}`)
    process.exit(1)
  }
  return (r.stdout || '').trim()
}

const journal = JSON.parse(readFileSync(resolve(RAIZ, 'meta/_journal.json'), 'utf8'))
const marco = Number(psql(['-t', '-A', '-c', 'select coalesce(max(created_at), 0) from drizzle.__drizzle_migrations']))
const pendentes = journal.entries.filter((e) => e.when > marco)

if (!pendentes.length) {
  console.log('[migrar] nada pendente')
  process.exit(0)
}

for (const entrada of pendentes) {
  const caminho = resolve(RAIZ, `${entrada.tag}.sql`)
  const sql = readFileSync(caminho, 'utf8')

  // O Drizzle separa statements por `--> statement-breakpoint`; para o ensaio
  // basta mandar o arquivo inteiro numa transação, com ON_ERROR_STOP.
  psql(['-f', '-'], sql.split('--> statement-breakpoint').join('\n'))

  const hash = createHash('sha256').update(sql).digest('hex')
  psql(['-c', `insert into drizzle.__drizzle_migrations (hash, created_at) values ('${hash}', ${entrada.when})`])
  console.log(`[migrar] aplicada ${entrada.tag}`)
}

console.log(`[migrar] ${pendentes.length} migration(s) aplicada(s)`)
