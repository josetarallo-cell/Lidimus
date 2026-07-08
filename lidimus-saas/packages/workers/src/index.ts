import { writeFileSync } from 'node:fs'
import * as Sentry from '@sentry/node'
import { createDb } from '@lidimus/db'
import { startMatriculaOcrWorker } from './matricula-ocr.worker.ts'
import { startMatriculaJuridicoWorker } from './matricula-juridico.worker.ts'
import { startMatriculaDocWorker } from './matricula-doc.worker.ts'
import { startKmlWorker } from './kml.worker.ts'
import { startInjectionWorker } from './injection.worker.ts'

const DATABASE_URL = process.env.DATABASE_URL!
const REDIS_URL = process.env.REDIS_URL!
const N8N_BASE_URL = process.env.N8N_BASE_URL!
const N8N_MATRICULA_OCR_WEBHOOK_PATH = process.env.N8N_MATRICULA_OCR_WEBHOOK_PATH!
const N8N_MATRICULA_JURIDICO_WEBHOOK_PATH = process.env.N8N_MATRICULA_JURIDICO_WEBHOOK_PATH!
const N8N_MATRICULA_DOC_WEBHOOK_PATH = process.env.N8N_MATRICULA_DOC_WEBHOOK_PATH!
const N8N_KML_WEBHOOK_PATH = process.env.N8N_KML_WEBHOOK_PATH!
const N8N_INJECTION_WEBHOOK_PATH = process.env.N8N_INJECTION_WEBHOOK_PATH!
const N8N_CALLBACK_SECRET = process.env.N8N_CALLBACK_SECRET!
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL!

const required = [
  'DATABASE_URL', 'REDIS_URL', 'N8N_BASE_URL',
  'N8N_MATRICULA_OCR_WEBHOOK_PATH', 'N8N_MATRICULA_JURIDICO_WEBHOOK_PATH', 'N8N_MATRICULA_DOC_WEBHOOK_PATH',
  'N8N_KML_WEBHOOK_PATH', 'N8N_INJECTION_WEBHOOK_PATH',
  'N8N_CALLBACK_SECRET', 'PUBLIC_BASE_URL',
]
for (const k of required) {
  if (!process.env[k]) throw new Error(`Missing env var: ${k}`)
}

// Rastreamento de erros — inativo sem SENTRY_DSN
const SENTRY_DSN = process.env.SENTRY_DSN
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  })
  process.on('unhandledRejection', (reason) => Sentry.captureException(reason))
  process.on('uncaughtException', (err) => Sentry.captureException(err))
}

const db = createDb(DATABASE_URL)

const workers = [
  startMatriculaOcrWorker(db, REDIS_URL, N8N_BASE_URL + N8N_MATRICULA_OCR_WEBHOOK_PATH, N8N_CALLBACK_SECRET),
  startMatriculaJuridicoWorker(db, REDIS_URL, N8N_BASE_URL + N8N_MATRICULA_JURIDICO_WEBHOOK_PATH, N8N_CALLBACK_SECRET, PUBLIC_BASE_URL),
  startMatriculaDocWorker(db, REDIS_URL, N8N_BASE_URL + N8N_MATRICULA_DOC_WEBHOOK_PATH, N8N_CALLBACK_SECRET),
  startKmlWorker(db, REDIS_URL, N8N_BASE_URL + N8N_KML_WEBHOOK_PATH, N8N_CALLBACK_SECRET),
  startInjectionWorker(db, REDIS_URL, N8N_BASE_URL + N8N_INJECTION_WEBHOOK_PATH, N8N_CALLBACK_SECRET),
]

// Falha de job (retries esgotados) e erro de infraestrutura (ex.: Redis fora)
// vão para o Sentry com o contexto da fila — sem isso, worker quebrado é silencioso
if (SENTRY_DSN) {
  for (const w of workers) {
    w.on('failed', (job, err) => {
      if (job && job.attemptsMade < (job.opts.attempts ?? 1)) return
      Sentry.captureException(err, { extra: { queue: w.name, jobId: job?.data?.jobId } })
    })
    w.on('error', (err) => Sentry.captureException(err, { extra: { queue: w.name } }))
  }
}

console.log('Workers started: matricula-ocr, matricula-juridico, matricula-doc, kml, injection')

// Heartbeat lido por healthcheck.js (Docker HEALTHCHECK) — sem porta HTTP exposta pelo worker
const HEARTBEAT_PATH = process.env.WORKER_HEARTBEAT_PATH || '/tmp/worker-heartbeat'
function touchHeartbeat() {
  writeFileSync(HEARTBEAT_PATH, String(Date.now()))
}
touchHeartbeat()
const heartbeatInterval = setInterval(touchHeartbeat, 15_000)

async function shutdown() {
  console.log('Shutting down workers...')
  clearInterval(heartbeatInterval)
  await Promise.all(workers.map((w) => w.close()))
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
