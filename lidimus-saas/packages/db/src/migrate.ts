import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)
config({ path: resolve(__dir, '../../../.env') })

import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const __dirname = dirname(fileURLToPath(import.meta.url))

const client = postgres(url, { max: 1 })
const db = drizzle(client)

await migrate(db, { migrationsFolder: join(__dirname, '../drizzle') })
await client.end()
console.log('Migrations applied.')
