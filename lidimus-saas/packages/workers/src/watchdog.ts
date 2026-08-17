import type IORedis from 'ioredis'
import { and, eq, inArray, lt } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobs, refundJobCredits } from '@lidimus/db'
import { publishJobEvent } from '@lidimus/queue'
import { seguirParaJuridico } from './lib/seguirParaJuridico.ts'
import type { EnfileirarJuridico } from './lib/seguirParaJuridico.ts'

// Job cujo callback do n8n nunca chega fica em queued/processing para sempre,
// com os créditos debitados. Esta varredura expira jobs parados além do timeout:
// marca como erro, estorna os créditos e avisa o painel via pub/sub.
//
// `awaiting_review` fica de fora da lista de propósito: ali quem demora é o
// usuário conferindo os trechos, e transformar isso em erro estornado seria
// punir quem foi cuidadoso. Esse estado tem a varredura própria logo abaixo.
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

/**
 * Revisão que ninguém respondeu segue sozinha depois do prazo.
 *
 * A promessa da ferramenta é "envie e vá cuidar da sua vida". Um job parado para
 * sempre esperando alguém digitar quebra essa promessa de um jeito caro: o
 * cliente pagou, o relatório não sai, e num lote de dez matrículas seriam dez
 * telas esperando resposta. Passado o prazo, a análise segue com o texto que o
 * OCR leu — que é exatamente o que ela receberia se esta etapa não existisse.
 *
 * Não há estorno nem erro: o cliente recebe o relatório que contratou. O que ele
 * perdeu foi a chance de aumentar a precisão, e isso fica registrado no
 * `stageData.revisao.desfecho` como 'expirada'.
 */
export function startRevisaoWatchdog(
  db: Db,
  enfileirar: EnfileirarJuridico,
  publisher: IORedis,
  callbackUrl: string,
  opts: { prazoMinutos: number; sweepIntervalMs?: number },
) {
  const sweepIntervalMs = opts.sweepIntervalMs ?? 60_000

  async function sweep(): Promise<void> {
    const cutoff = new Date(Date.now() - opts.prazoMinutos * 60_000)

    const vencidos = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.status, 'awaiting_review'), lt(jobs.updatedAt, cutoff)))

    let seguiram = 0
    for (const job of vencidos) {
      const foi = await seguirParaJuridico(db, enfileirar, publisher, job.id, callbackUrl, 'expirada', [
        'awaiting_review',
      ])
      if (foi) seguiram++
    }

    if (seguiram > 0) {
      console.log(`[watchdog] ${seguiram} revisão(ões) sem resposta seguiram para a análise`)
    }
  }

  const timer = setInterval(() => {
    sweep().catch((err) => console.error('[watchdog] varredura de revisão falhou:', err))
  }, sweepIntervalMs)

  return { stop: () => clearInterval(timer) }
}
