import { useQueues } from '../../lib/queue'

// Retorna contagem de jobs por status em cada fila — sem autenticação de usuário
// (proteger com IP allowlist ou Basic Auth em produção se necessário)
export default defineEventHandler(async () => {
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
