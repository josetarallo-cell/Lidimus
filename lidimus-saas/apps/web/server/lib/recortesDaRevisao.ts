// Tira os recortes do payload do job e os troca pelo endereço de onde buscá-los.
//
// Foi um defeito de verdade, achado num teste real: o worker gravava as imagens
// como data URL dentro de `stage_data`, e `stage_data` inteiro é o que sai em
// `/api/jobs/:id` e em cada evento SSE. Oito recortes deram 256 KB — de um
// `stage_data` de 262 KB, ou seja, 98% do payload era imagem. A mensagem do SSE
// que anunciava `awaiting_review` não chegou ao navegador, e a tela ficou parada
// na espera enquanto o job já esperava resposta do usuário. Pior: o EventSource
// não fecha nesse caso, então o fallback de polling nunca dispara e a página
// espera para sempre.
//
// Imagem não é estado. O status do job muda a cada etapa e é reenviado a cada
// mudança; a imagem é escrita uma vez e é a mesma para sempre. Trocar o data URL
// pelo caminho do endpoint devolve o payload ao tamanho de um status (uns
// poucos KB), deixa o navegador buscar e cachear cada recorte por conta própria,
// e não muda nada na tela: `<img :src="c.recorte">` continua valendo.

import type { Candidato } from '@lidimus/revisao'

export function urlDoRecorte(jobId: string, candidatoId: string): string {
  return `/api/jobs/${jobId}/revisao/${candidatoId}`
}

type ComStageData = { id: string; stageData?: unknown }

export function trocarRecortesPorUrl<T extends ComStageData>(job: T): T {
  const stageData = job.stageData as Record<string, unknown> | null | undefined
  const revisao = stageData?.revisao as Record<string, unknown> | undefined
  const candidatos = revisao?.candidatos

  if (!Array.isArray(candidatos) || candidatos.length === 0) return job

  return {
    ...job,
    stageData: {
      ...stageData,
      revisao: {
        ...revisao,
        candidatos: (candidatos as Candidato[]).map((c) => ({
          ...c,
          // `null` continua significando "não há imagem para este trecho" — o
          // worker deixa assim quando o recorte falha, e a revisão encerrada
          // zera todos. A tela já sabe lidar com isso.
          recorte: c.recorte ? urlDoRecorte(job.id, c.id) : null,
        })),
      },
    },
  } as T
}
