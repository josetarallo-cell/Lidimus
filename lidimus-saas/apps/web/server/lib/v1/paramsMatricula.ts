// Leitura do campo `params` da v1.
//
// Existe como função porque as duas rotas de criação (unitária e lote) precisam
// recusar exatamente as mesmas coisas, e porque a recusa mais delicada — o
// corretor de leitura — tem de acontecer ANTES do `parse` do zod. O schema é
// compartilhado com o painel, onde a chave é legítima; aqui ela não é, e zod com
// strip de chave desconhecida a descartaria em silêncio.
//
// Três recusas distintas, todas `400 requisicao_invalida`, cada uma com a frase
// que resolve o problema de quem chamou — em vez de uma mensagem só para três
// causas diferentes.

import { paramsMatriculaSchema } from '../criarAnaliseMatricula'
import type { ParamsMatricula } from '../criarAnaliseMatricula'
import { erroApi } from './erroApi'

export function lerParamsMatriculaApi(
  parteParams: { data?: Buffer } | undefined,
  { noLote = false } = {},
): ParamsMatricula {
  let bruto: unknown
  try {
    bruto = parteParams?.data ? JSON.parse(parteParams.data.toString()) : {}
  } catch {
    throw erroApi(400, 'requisicao_invalida', 'O campo "params" deve ser um JSON válido.')
  }

  // A correção de leitura é auxílio de tela e não existe na API (§4 da doc
  // pública): sem ninguém para responder, o job esperaria o prazo inteiro em
  // cada chamada. Recusar a chave toda — `true` e `false` — mantém uma regra só:
  // este parâmetro não é da v1. Aceitar `false` sugeriria que `true` também vale.
  if (bruto && typeof bruto === 'object' && 'corretorDeLeitura' in bruto) {
    throw erroApi(
      400,
      'requisicao_invalida',
      'A correção de leitura não existe na API — não há tela para responder. ' +
        'Envie pelo painel se a conferência importar nesta matrícula.',
    )
  }

  const lido = paramsMatriculaSchema.safeParse(bruto)
  if (!lido.success) {
    throw erroApi(
      400,
      'requisicao_invalida',
      'O campo "params" deve ser um JSON com as chaves incluirMemorial, incluirCroqui e geocodificar (todas booleanas e opcionais).' +
        (noLote ? ' Ele vale para todos os arquivos do lote.' : ''),
    )
  }

  return lido.data
}
