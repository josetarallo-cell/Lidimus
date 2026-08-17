// Quem entra no corretor de leitura, e quem passa direto.
//
// A etapa só faz sentido quando há alguém do outro lado para responder. Todo o
// resto do pipeline é assíncrono de propósito — o cliente envia e vai cuidar da
// vida — e esta é a única parte que depende de uma pessoa olhando a tela.

import { levantarCandidatos, reconciliarOffsets, removerCarimbo } from '@lidimus/revisao'
import type { Candidato, TokenOcr } from '@lidimus/revisao'

export type EntradaDaRevisao = {
  textoOcr: string
  /** Índice de tokens do OCR; ausente quando o workflow ainda não o envia */
  tokens?: TokenOcr[]
  inputMeta?: Record<string, unknown> | null
}

export type LeituraPreparada = {
  /** Texto que segue para a análise: sem o carimbo, quando dá para removê-lo */
  textoOcr: string
  /** O texto como o OCR entregou, guardado quando houve limpeza */
  textoBruto?: string
  /** Trechos de carimbo removidos, para auditoria */
  carimboRemovido?: string[]
  candidatos: Candidato[]
}

/**
 * Prepara a leitura antes de ela virar análise: tira o carimbo do texto e
 * levanta os trechos que merecem conferência humana.
 *
 * A ordem importa. A limpeza vem primeiro porque é ela que define o texto
 * definitivo — os candidatos carregam posições dentro dele, e levantá-los antes
 * apontaria para um texto que deixou de existir.
 */
export function prepararLeitura({
  textoOcr,
  tokens,
  inputMeta,
}: EntradaDaRevisao): LeituraPreparada {
  // Sem índice de tokens não há ângulo nem caixa: nada a limpar, nada a
  // conferir. É o caminho de quem roda com o workflow de OCR antigo — segue
  // direto para o jurídico, exatamente como antes desta etapa existir.
  if (!tokens?.length) return { textoOcr, candidatos: [] }

  const limpeza = removerCarimbo(textoOcr, reconciliarOffsets(textoOcr, tokens))

  // Análise pedida por integração não tem tela nem usuário: parar o job para
  // esperar uma resposta que nunca vem transformaria a melhoria num timeout de
  // quinze minutos em cada chamada da API. A limpeza do carimbo, essa, vale
  // igual — ela não pede nada a ninguém.
  const candidatos =
    inputMeta?.origem === 'api' ? [] : levantarCandidatos(limpeza.texto, limpeza.tokens)

  if (limpeza.removidos.length === 0) return { textoOcr, candidatos }

  return {
    textoOcr: limpeza.texto,
    textoBruto: textoOcr,
    carimboRemovido: limpeza.removidos,
    candidatos,
  }
}
