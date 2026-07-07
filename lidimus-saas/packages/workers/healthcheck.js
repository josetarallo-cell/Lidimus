import { statSync } from 'node:fs'

// Usado pelo HEALTHCHECK do Dockerfile — sem porta HTTP, checa o heartbeat escrito pelo processo.
const path = process.env.WORKER_HEARTBEAT_PATH || '/tmp/worker-heartbeat'

try {
  const { mtimeMs } = statSync(path)
  process.exit(Date.now() - mtimeMs < 60_000 ? 0 : 1)
} catch {
  process.exit(1)
}
