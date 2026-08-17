// Texto girado: o carimbo, e não o documento.
//
// A certidão eletrônica do ONR sai com "PARA SIMPLES CONSULTA — NÃO VALE COMO
// CERTIDÃO" atravessado na diagonal de cada página. O OCR lê esse carimbo como
// se fosse conteúdo, e o resultado se intercala no texto do cartório:
//
//     A(O) escrevente:-
//     PARA SIMPLES CONSU      ← carimbo
//     Cavalhieri
//     UTORIZADO               ← carimbo
//     NAO VALE COMO CERTIDAU  ← carimbo
//
// Para o corretor de leitura isso é duplamente ruim: os pedaços do carimbo saem
// com confiança baixa (estão por cima de texto, e cortados), então concorrem
// pelas oito vagas da tela com os erros de verdade; e quando entram na caixa de
// um trecho vizinho, o recorte sai com o carimbo por cima da palavra que o
// usuário deveria julgar.
//
// O que separa um do outro não é o conteúdo — é o ângulo. O carimbo está a ~45°
// e o cartório escreve na horizontal.
//
// A comparação é contra a MEDIANA da página, não contra a horizontal absoluta.
// A diferença importa: uma digitalização torta inclina o documento inteiro, e
// medir contra a horizontal apagaria a página toda. Contra a mediana, a
// inclinação do scanner vira o novo zero e só o que destoa dela é carimbo.

import type { TokenOcr } from './tipos.ts'

/**
 * Desvio, em graus, a partir do qual o token deixa de ser considerado texto do
 * documento. Carimbo diagonal fica em torno de 45°; digitalização torta
 * raramente passa de 5°.
 */
export const LIMITE_GIRO = 15

/** Mínimo de tokens para a mediana da página significar alguma coisa. */
const MINIMO_PARA_MEDIANA = 20

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const ordenado = [...valores].sort((a, b) => a - b)
  const meio = ordenado.length >> 1
  return ordenado.length % 2 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2
}

/**
 * Remove os tokens girados em relação ao corpo da página.
 *
 * Tokens sem ângulo informado passam intactos: é o caso do workflow de OCR
 * antigo, que não emitia o campo. Sem o dado, a decisão honesta é não filtrar
 * nada — pior que não ter o filtro seria descartar texto por achismo.
 */
/**
 * Ângulo do corpo de cada página — a régua contra a qual "girado" é medido.
 *
 * Página com poucos tokens não tem mediana confiável: nela o carimbo poderia ser
 * a maioria e virar a referência, invertendo o filtro. Nesse caso a régua é a
 * horizontal, que é o padrão do documento.
 */
export function baseDasPaginas(tokens: TokenOcr[]): Map<number, number> {
  const base = new Map<number, number>()
  const comAngulo = tokens.filter((t) => typeof t.a === 'number')

  for (const pagina of new Set(comAngulo.map((t) => t.p))) {
    const angulos = comAngulo.filter((t) => t.p === pagina).map((t) => t.a as number)
    base.set(pagina, angulos.length >= MINIMO_PARA_MEDIANA ? mediana(angulos) : 0)
  }
  return base
}

/** O token corre em direção diferente do corpo da página? */
export function estaGirado(
  t: TokenOcr,
  base: Map<number, number>,
  limite = LIMITE_GIRO,
): boolean {
  if (typeof t.a !== 'number') return false
  return Math.abs(t.a - (base.get(t.p) ?? 0)) > limite
}

export function semTextoGirado(tokens: TokenOcr[], limite = LIMITE_GIRO): TokenOcr[] {
  if (!tokens.some((t) => typeof t.a === 'number')) return tokens
  const base = baseDasPaginas(tokens)
  return tokens.filter((t) => !estaGirado(t, base, limite))
}
