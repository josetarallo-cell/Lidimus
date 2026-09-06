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
  /** Desvio da horizontal, em graus — o carimbo diagonal fica em ~45 */
  angulo?: number
  /**
   * Estende o offset do token até o espaço ou a quebra de linha que o separa do
   * próximo — como o Document AI de verdade faz.
   *
   * Fica atrás de uma opção, e não como padrão, porque a geometria dos outros
   * testes foi escrita contra o token justo. Mas é a forma REAL, e ignorá-la
   * custou caro: o `aparar` não podava espaço em branco, o campo da tela pedia
   * "199.908⏎" de volta, e a correção do usuário colou a matrícula na palavra
   * seguinte. Nenhum teste pegou porque este fixture não reproduzia o
   * comportamento do serviço.
   */
  comSeparador?: boolean
}

export function tokenizar(texto: string, opcoes: OpcoesTokenizar = {}): TokenOcr[] {
  const {
    confianca = 0.99, porBytes = false, palavrasPorPagina = 1000, angulo = 0,
    comSeparador = false,
  } = opcoes
  const tokens: TokenOcr[] = []
  let n = 0

  for (const m of texto.matchAll(/\S+/g)) {
    const inicio = m.index!
    let fim = inicio + m[0].length
    if (comSeparador) {
      const espaco = texto.slice(fim).match(/^\s+/)
      if (espaco) fim += espaco[0].length
    }
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
      a: angulo,
      s: porBytes ? Buffer.byteLength(texto.slice(0, inicio), 'utf8') : inicio,
      e: porBytes ? Buffer.byteLength(texto.slice(0, fim), 'utf8') : fim,
    })
    n++
  }

  return tokens
}
