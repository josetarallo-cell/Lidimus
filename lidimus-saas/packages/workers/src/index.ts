import { createDb } from '@lidimus/db'
import { startMatriculaWorker } from './matricula.worker.ts'
import { startKmlWorker } from './kml.worker.ts'
import { startInjectionWorker } from './injection.worker.ts'

const DATABASE_URL = process.env.DATABASE_URL!
const REDIS_URL = process.env.REDIS_URL!
const N8N_BASE_URL = process.env.N8N_BASE_URL!
const N8N_MATRICULA_WEBHOOK_PATH = process.env.N8N_MATRICULA_WEBHOOK_PATH!
const N8N_KML_WEBHOOK_PATH = process.env.N8N_KML_WEBHOOK_PATH!
const N8N_INJECTION_WEBHOOK_PATH = process.env.N8N_INJECTION_WEBHOOK_PATH!
const N8N_CALLBACK_SECRET = process.env.N8N_CALLBACK_SECRET!

const required = [
  'DATABASE_URL', 'REDIS_URL', 'N8N_BASE_URL',
  'N8N_MATRICULA_WEBHOOK_PATH', 'N8N_KML_WEBHOOK_PATH', 'N8N_INJECTION_WEBHOOK_PATH',
  'N8N_CALLBACK_SECRET',
]
for (const k of required) {
  if (!process.env[k]) throw new Error(`Missing env var: ${k}`)
}

const db = createDb(DATABASE_URL)

const workers = [
  startMatriculaWorker(db, REDIS_URL, N8N_BASE_URL + N8N_MATRICULA_WEBHOOK_PATH, N8N_CALLBACK_SECRET),
  startKmlWorker(db, REDIS_URL, N8N_BASE_URL + N8N_KML_WEBHOOK_PATH, N8N_CALLBACK_SECRET),
  startInjectionWorker(db, REDIS_URL, N8N_BASE_URL + N8N_INJECTION_WEBHOOK_PATH, N8N_CALLBACK_SECRET),
]

console.log('Workers started: matricula, kml, injection')

async function shutdown() {
  console.log('Shutting down workers...')
  await Promise.all(workers.map((w) => w.close()))
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
