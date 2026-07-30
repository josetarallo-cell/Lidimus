// Projeção pública de um job. É o contrato da v1 — mude com cuidado.
//
// Por que não devolver a linha do banco: `jobs.result` é o payload que o n8n
// monta, e `stage_data` guarda o intermediário de cada etapa. Repassar a linha
// crua congelaria a estrutura interna dentro de um contrato público — qualquer
// ajuste de workflow viraria quebra de integração de cliente.
//
// Duas coisas ficam de fora por serem nossas, não do cliente:
//   • `stage_data` — texto de OCR bruto e estado intermediário do pipeline;
//   • `result.usage` — tokens e custo por modelo. É telemetria de margem: diz
//     quanto a análise nos custou, o que não é assunto de quem compra.

type JobDoBanco = {
  id: string
  status: 'pending' | 'queued' | 'processing' | 'done' | 'error'
  stage: 'ocr' | 'juridico' | 'doc' | 'croqui' | null
  inputMeta: Record<string, unknown> | null
  // Ausente na listagem, que não carrega o conteúdo da análise.
  result?: Record<string, unknown> | null
  errorMessage: string | null
  createdAt: Date
  completedAt: Date | null
}

export type StatusPublico = 'queued' | 'processing' | 'done' | 'error'

// `pending` existe por instantes, entre o débito do crédito e o enfileiramento.
// Para quem consome de fora é fila — não vale expor um estado que só existe
// dentro de uma transação nossa.
function statusPublico(status: JobDoBanco['status']): StatusPublico {
  return status === 'pending' ? 'queued' : status
}

function semTelemetria(result: Record<string, unknown> | null | undefined) {
  if (!result) return null
  const { usage: _usage, ...resto } = result
  return resto
}

// `incluirResultado: false` na listagem: o resultado de uma matrícula é um JSON
// grande, e devolver vinte deles de uma vez transformaria a listagem em resposta
// de megabytes. Quem quer o conteúdo pede a análise pelo id.
export function serializarJob(job: JobDoBanco, { incluirResultado = true } = {}) {
  const meta = job.inputMeta ?? {}

  return {
    id: job.id,
    status: statusPublico(job.status),
    // Etapa do pipeline (ocr → juridico → doc). Só para o cliente poder mostrar
    // progresso; não é campo em que valha ramificar lógica.
    etapa: job.stage,
    arquivo: typeof meta.originalName === 'string' ? meta.originalName : null,
    paginas: typeof meta.paginas === 'number' ? meta.paginas : null,
    criadoEm: job.createdAt.toISOString(),
    concluidoEm: job.completedAt?.toISOString() ?? null,
    // Preenchidos em exclusão mútua: erro quando falhou, resultado quando
    // concluiu. Enquanto processa, os dois são nulos.
    erro: job.status === 'error' ? (job.errorMessage ?? 'Falha ao processar a análise.') : null,
    ...(incluirResultado && {
      resultado: job.status === 'done' ? semTelemetria(job.result) : null,
    }),
  }
}
