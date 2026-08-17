// Quem entra no corretor de leitura, e quem passa direto.
//
// A etapa só faz sentido quando há alguém do outro lado para responder. Todo o
// resto do pipeline é assíncrono de propósito — o cliente envia e vai cuidar da
// vida — e esta é a única parte que depende de uma pessoa olhando a tela.

import { levantarCandidatos } from '@lidimus/revisao'
import type { Candidato, TokenOcr } from '@lidimus/revisao'

export type EntradaDaRevisao = {
  textoOcr: string
  /** Índice de tokens do OCR; ausente quando o workflow ainda não o envia */
  tokens?: TokenOcr[]
  inputMeta?: Record<string, unknown> | null
}

export function candidatosParaRevisao({
  textoOcr,
  tokens,
  inputMeta,
}: EntradaDaRevisao): Candidato[] {
  // Análise pedida por integração não tem tela nem usuário: parar o job para
  // esperar uma resposta que nunca vem transformaria a melhoria num timeout de
  // quinze minutos em cada chamada da API.
  if (inputMeta?.origem === 'api') return []

  // Sem índice de tokens não há caixa, sem caixa não há recorte. É o caminho de
  // quem roda com o workflow de OCR antigo — segue direto para o jurídico,
  // exatamente como antes desta etapa existir.
  if (!tokens?.length) return []

  return levantarCandidatos(textoOcr, tokens)
}
