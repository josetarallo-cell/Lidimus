// Faixa de Unicode Tags (U+E0000–U+E007F): esteganografia usada em prompt
// injection real contra LLMs. Cada caractere ASCII do payload é deslocado para
// lá (alvo = 0xE0000 + código ASCII). Nenhuma fonte comum desenha glifo nessa
// faixa, então o trecho fica invisível por construção — não depende de cor, de
// tamanho nem do modo de renderização do PDF, e sobrevive a copiar, colar e
// imprimir. Mas chega íntegro a qualquer extração de texto Unicode-aware.
//
// Consequência para o laudo: exibir esse texto cru pinta uma caixa vazia — não
// há o que desenhar. Para *mostrar* a fraude (e não só anunciá-la) é preciso
// trazer os pontos de código de volta ao ASCII antes de renderizar.

const TAG_BASE = 0xe0000
const TAG_FIM = 0xe007f
const TAG_ESPACO = 0xe0020 // primeiro com equivalente imprimível (' ')
const TAG_TIL = 0xe007e // último com equivalente imprimível ('~')

function ehTagUnicode(cp: number): boolean {
  return cp >= TAG_BASE && cp <= TAG_FIM
}

/** Há caracteres da faixa de tags — isto é, texto invisível por código? */
export function temTagsUnicode(texto: string): boolean {
  if (!texto) return false
  return [...texto].some((ch) => ehTagUnicode(ch.codePointAt(0)!))
}

/**
 * Devolve o trecho legível: tags viram o ASCII original, o resto passa intacto.
 * Texto sem tags (oculto por cor ou por corpo minúsculo) atravessa sem mudança.
 */
export function revelarTextoOculto(texto: string): string {
  if (!texto) return ''
  return [...texto]
    .map((ch) => {
      const cp = ch.codePointAt(0)!
      if (cp >= TAG_ESPACO && cp <= TAG_TIL) return String.fromCharCode(cp - TAG_BASE)
      // Tags de controle (cancel tag e afins) não têm equivalente legível
      if (ehTagUnicode(cp)) return ''
      return ch
    })
    .join('')
}
