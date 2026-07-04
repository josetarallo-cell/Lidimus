import { config } from 'dotenv'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const client = postgres(url, { max: 1 })
const db = drizzle(client)

await migrate(db, { migrationsFolder: join(__dirname, '../drizzle') })
await client.end()
console.log('Migrations applied.')
