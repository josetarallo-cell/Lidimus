import type IORedis from 'ioredis'
import { and, inArray, lt } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobs, refundJobCredits } from '@lidimus/db'
import { publishJobEvent } from '@lidimus/queue'

// Job cujo callback do n8n nunca chega fica em queued/processing para sempre,
// com os créditos debitados. Esta varredura expira jobs parados além do timeout:
// marca como erro, estorna os créditos e avisa o painel via pub/sub.
export function startStuckJobWatchdog(
  db: Db,
  publisher: IORedis,
  opts: { timeoutMinutes: number; sweepIntervalMs?: number },
) {
  const sweepIntervalMs = opts.sweepIntervalMs ?? 60_000

  async function sweep(): Promise<void> {
    const cutoff = new Date(Date.now() - opts.timeoutMinutes * 60_000)

    const stuck = await db
      .update(jobs)
      .set({
        status: 'error',
        errorMessage: `Tempo limite de ${opts.timeoutMinutes} minutos excedido — a análise foi interrompida e os créditos, estornados.`,
        completedAt: new Date(),
      })
      .where(
        and(
          inArray(jobs.status, ['pending', 'queued', 'processing']),
          lt(jobs.updatedAt, cutoff),
        ),
      )
      .returning({ id: jobs.id })

    for (const job of stuck) {
      await refundJobCredits(db, job.id)
      await publishJobEvent(publisher, job.id)
    }

    if (stuck.length > 0) {
      console.log(`[watchdog] ${stuck.length} job(s) preso(s) expirado(s) e estornado(s): ${stuck.map((j) => j.id).join(', ')}`)
    }
  }

  const timer = setInterval(() => {
    sweep().catch((err) => console.error('[watchdog] varredura falhou:', err))
  }, sweepIntervalMs)

  return { stop: () => clearInterval(timer) }
}
