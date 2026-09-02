import { writeFileSync } from 'node:fs'
import * as Sentry from '@sentry/node'
import { createDb } from '@lidimus/db'
import { createQueues, createRedisConnection } from '@lidimus/queue'
import type { MatriculaJuridicoJobPayload } from '@lidimus/queue'
import { startMatriculaOcrWorker } from './matricula-ocr.worker.ts'
import { startMatriculaRevisaoWorker } from './matricula-revisao.worker.ts'
import { startMatriculaJuridicoWorker } from './matricula-juridico.worker.ts'
import { startMatriculaDocWorker } from './matricula-doc.worker.ts'
import { startCroquiWorker } from './croqui.worker.ts'
import { startKmlWorker } from './kml.worker.ts'
import { startInjectionWorker } from './injection.worker.ts'
import { startRevisaoWatchdog, startStuckJobWatchdog } from './watchdog.ts'

const DATABASE_URL = process.env.DATABASE_URL!
const REDIS_URL = process.env.REDIS_URL!
const N8N_BASE_URL = process.env.N8N_BASE_URL!
const N8N_MATRICULA_OCR_WEBHOOK_PATH = process.env.N8N_MATRICULA_OCR_WEBHOOK_PATH!
const N8N_MATRICULA_JURIDICO_WEBHOOK_PATH = process.env.N8N_MATRICULA_JURIDICO_WEBHOOK_PATH!
const N8N_MATRICULA_DOC_WEBHOOK_PATH = process.env.N8N_MATRICULA_DOC_WEBHOOK_PATH!
const N8N_CROQUI_WEBHOOK_PATH = process.env.N8N_CROQUI_WEBHOOK_PATH!
const N8N_KML_WEBHOOK_PATH = process.env.N8N_KML_WEBHOOK_PATH!
const N8N_INJECTION_WEBHOOK_PATH = process.env.N8N_INJECTION_WEBHOOK_PATH!
const N8N_CALLBACK_SECRET = process.env.N8N_CALLBACK_SECRET!
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL!

const required = [
  'DATABASE_URL', 'REDIS_URL', 'N8N_BASE_URL',
  'N8N_MATRICULA_OCR_WEBHOOK_PATH', 'N8N_MATRICULA_JURIDICO_WEBHOOK_PATH', 'N8N_MATRICULA_DOC_WEBHOOK_PATH',
  'N8N_CROQUI_WEBHOOK_PATH', 'N8N_KML_WEBHOOK_PATH', 'N8N_INJECTION_WEBHOOK_PATH',
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

// Conexão dedicada a pub/sub de eventos de job — compartilhada pelos handlers
// de falha dos workers e pelo watchdog
const publisher = createRedisConnection(REDIS_URL)

// O corretor de leitura é a única etapa que enfileira a seguinte sem passar
// pelo callback do n8n: quando a revisão fecha (respondida, expirada ou sem
// recorte), é daqui que a análise jurídica sai.
const filas = createQueues(REDIS_URL)
const CALLBACK_URL = `${PUBLIC_BASE_URL}/api/webhooks/n8n-callback`
const enfileirarJuridico = (payload: MatriculaJuridicoJobPayload) =>
  filas.matriculaJuridicoQueue.add('process', payload)

const workers = [
  startMatriculaOcrWorker(db, REDIS_URL, N8N_BASE_URL + N8N_MATRICULA_OCR_WEBHOOK_PATH, N8N_CALLBACK_SECRET, publisher),
  startMatriculaRevisaoWorker(db, REDIS_URL, enfileirarJuridico, CALLBACK_URL, publisher),
  startMatriculaJuridicoWorker(db, REDIS_URL, N8N_BASE_URL + N8N_MATRICULA_JURIDICO_WEBHOOK_PATH, N8N_CALLBACK_SECRET, PUBLIC_BASE_URL, publisher),
  startMatriculaDocWorker(db, REDIS_URL, N8N_BASE_URL + N8N_MATRICULA_DOC_WEBHOOK_PATH, N8N_CALLBACK_SECRET, publisher),
  startCroquiWorker(db, REDIS_URL, N8N_BASE_URL + N8N_CROQUI_WEBHOOK_PATH, N8N_CALLBACK_SECRET, PUBLIC_BASE_URL, publisher),
  startKmlWorker(db, REDIS_URL, N8N_BASE_URL + N8N_KML_WEBHOOK_PATH, N8N_CALLBACK_SECRET, publisher),
  startInjectionWorker(db, REDIS_URL, N8N_BASE_URL + N8N_INJECTION_WEBHOOK_PATH, N8N_CALLBACK_SECRET, publisher),
]

// Expira jobs presos (callback do n8n que nunca chegou) e estorna os créditos.
//
// 15 e não 60 desde 01/09/2026. O número mede uma ETAPA, não o pipeline —
// `jobs.updatedAt` tem `$onUpdate`, então o relógio zera a cada transição — e as
// etapas reais cabem com folga: a janela do OCR (enfileiramento até o callback)
// deu no máximo 100 s em produção, croqui 33 s, KML 58 s, e uma análise jurídica
// completa medida ponta a ponta, 67 s. O que ocupava a hora era falha silenciosa
// do n8n, e essa passou a voltar como callback de erro em segundos.
//
// Baixar tem custo se errarmos para menos: o job é morto e estornado enquanto o
// n8n ainda trabalha, e o callback que chegar depois é recusado por
// `transitionActiveJob` — o cliente fica com o estorno e sem o relatório. Por
// isso o corte acompanha a medição, e não o palpite.
const watchdog = startStuckJobWatchdog(db, publisher, {
  timeoutMinutes: Number(process.env.STUCK_JOB_TIMEOUT_MINUTES ?? 15),
})

// Revisão sem resposta segue sozinha depois do prazo — ver startRevisaoWatchdog
const watchdogRevisao = startRevisaoWatchdog(db, enfileirarJuridico, publisher, CALLBACK_URL, {
  prazoMinutos: Number(process.env.REVISAO_PRAZO_MINUTOS ?? 15),
})

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

console.log('Workers started: matricula-ocr, matricula-revisao, matricula-juridico, matricula-doc, croqui, kml, injection')

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
  watchdog.stop()
  watchdogRevisao.stop()
  await Promise.all(workers.map((w) => w.close()))
  publisher.disconnect()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
