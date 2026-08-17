// Índice de tokens de mentira para os testes.
//
// Imita o que o Document AI devolve: um token por palavra, com caixa e
// confiança. A geometria é fictícia mas coerente (linhas de cima para baixo,
// palavras da esquerda para a direita), o que é o suficiente para verificar
// ancoragem, agrupamento e ordenação.

import type { TokenOcr } from './tipos.ts'

export type OpcoesTokenizar = {
  confianca?: number
  /** Emite os offsets como o Document AI faz quando conta bytes UTF-8 */
  porBytes?: boolean
  /** Quantas palavras por página, para exercitar trechos que cruzam a virada */
  palavrasPorPagina?: number
}

export function tokenizar(texto: string, opcoes: OpcoesTokenizar = {}): TokenOcr[] {
  const { confianca = 0.99, porBytes = false, palavrasPorPagina = 1000 } = opcoes
  const tokens: TokenOcr[] = []
  let n = 0

  for (const m of texto.matchAll(/\S+/g)) {
    const inicio = m.index!
    const fim = inicio + m[0].length
    const naPagina = n % palavrasPorPagina
    tokens.push({
      p: Math.floor(n / palavrasPorPagina) + 1,
      b: [
        0.1 + ((naPagina % 10) * 0.08),
        0.05 + (Math.floor(naPagina / 10) % 40) * 0.02,
        0.16 + ((naPagina % 10) * 0.08),
        0.07 + (Math.floor(naPagina / 10) % 40) * 0.02,
      ],
      c: confianca,
      s: porBytes ? Buffer.byteLength(texto.slice(0, inicio), 'utf8') : inicio,
      e: porBytes ? Buffer.byteLength(texto.slice(0, fim), 'utf8') : fim,
    })
    n++
  }

  return tokens
}
