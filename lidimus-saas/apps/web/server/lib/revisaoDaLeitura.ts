// Quem entra no corretor de leitura, e quem passa direto.
//
// A etapa só faz sentido quando há alguém do outro lado para responder. Todo o
// resto do pipeline é assíncrono de propósito — o cliente envia e vai cuidar da
// vida — e esta é a única parte que depende de uma pessoa olhando a tela.
//
// Por isso ela é opcional desde 14/09/2026: quem manda um lote para processar
// enquanto faz outra coisa desmarca a conferência no envio, e a leitura segue
// direto para a análise.

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
 * Quem entra no corretor. Duas recusas, de naturezas diferentes:
 *
 *   • a integração não tem tela — parar o job para esperar uma resposta que
 *     nunca vem transformaria a melhoria num timeout de quinze minutos em cada
 *     chamada da API;
 *   • o usuário desmarcou a conferência no envio. É escolha dele, e a razão mais
 *     comum é o lote: dez arquivos que pausam um a um prendem à tela justamente
 *     quem mandou os dez para não ficar nela.
 *
 * Ausente a chave, o corretor roda. É o comportamento que o painel sempre teve,
 * e é o que um job enfileirado antes deste deploy espera encontrar.
 */
export function querCorretorDeLeitura(inputMeta?: Record<string, unknown> | null): boolean {
  if (inputMeta?.origem === 'api') return false
  const params = (inputMeta?.params ?? {}) as Record<string, unknown>
  return params.corretorDeLeitura !== false
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

  // A limpeza acima roda sempre, inclusive para quem não quer o corretor: ela não
  // pergunta nada a ninguém. O que é opcional é a conferência humana, não a leitura.
  const candidatos = querCorretorDeLeitura(inputMeta)
    ? levantarCandidatos(limpeza.texto, limpeza.tokens)
    : []

  if (limpeza.removidos.length === 0) return { textoOcr, candidatos }

  return {
    textoOcr: limpeza.texto,
    textoBruto: textoOcr,
    carimboRemovido: limpeza.removidos,
    candidatos,
  }
}
