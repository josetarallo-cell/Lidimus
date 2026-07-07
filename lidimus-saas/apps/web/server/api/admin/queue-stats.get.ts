import { useQueues } from '../../lib/queue'
import { requirePlatformAdmin } from '../../lib/requirePlatformAdmin'

// Retorna contagem de jobs por status em cada fila — restrito a administradores da plataforma
export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)

  const { matriculaOcrQueue, matriculaJuridicoQueue, matriculaDocQueue, kmlQueue, injectionQueue } =
    useQueues()

  const counts = (q: typeof kmlQueue) =>
    q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused')

  const [matriculaOcr, matriculaJuridico, matriculaDoc, kml, injection] = await Promise.all([
    counts(matriculaOcrQueue),
    counts(matriculaJuridicoQueue),
    counts(matriculaDocQueue),
    counts(kmlQueue),
    counts(injectionQueue),
  ])

  return {
    timestamp: new Date().toISOString(),
    queues: {
      'matricula-ocr': matriculaOcr,
      'matricula-juridico': matriculaJuridico,
      'matricula-doc': matriculaDoc,
      kml,
      injection,
    },
  }
})
