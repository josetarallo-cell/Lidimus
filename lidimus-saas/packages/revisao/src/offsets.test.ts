import { describe, expect, it } from 'vitest'
import { reconciliarOffsets } from './offsets.ts'
import { tokenizar } from './fixtures.ts'
import type { TokenOcr } from './tipos.ts'

// Texto com acento suficiente para as duas leituras de offset divergirem cedo e
// continuarem divergindo — é o que uma matrícula de verdade faz.
const TEXTO =
  'Imóvel situado à Rua São João, nº 12, na Comarca de Mairinque, ' +
  'com área de 1.234,56 m², matrícula 2.653 do Livro 2 — Registro Geral, ' +
  'transmitido por escritura pública lavrada em 24 de fevereiro de 2012.'

function fatias(texto: string, tokens: TokenOcr[]): string[] {
  return tokens.map((t) => texto.slice(t.s, t.e))
}

describe('reconciliarOffsets', () => {
  it('recupera as palavras quando o Document AI conta bytes', () => {
    const comBytes = tokenizar(TEXTO, { porBytes: true })
    const esperado = fatias(TEXTO, tokenizar(TEXTO))

    // Sem reconciliar, o desalinhamento é visível já na segunda palavra
    expect(fatias(TEXTO, comBytes)).not.toEqual(esperado)
    expect(fatias(TEXTO, reconciliarOffsets(TEXTO, comBytes))).toEqual(esperado)
  })

  it('não move nada quando o Document AI conta caracteres', () => {
    const comCaracteres = tokenizar(TEXTO)
    const reconciliados = reconciliarOffsets(TEXTO, comCaracteres)
    expect(reconciliados.map((t) => [t.s, t.e])).toEqual(comCaracteres.map((t) => [t.s, t.e]))
  })

  it('é inócua em documento sem acento — as duas leituras coincidem', () => {
    const ascii = 'LOTE 12 DA QUADRA 3, COM 250,00 M2 DE AREA'
    const tokens = tokenizar(ascii)
    expect(fatias(ascii, reconciliarOffsets(ascii, tokens))).toEqual(fatias(ascii, tokens))
  })

  it('descarta token que aponta para fora do texto', () => {
    const tokens: TokenOcr[] = [
      { p: 1, b: [0, 0, 0.1, 0.1], c: 0.9, s: 0, e: 5 },
      { p: 1, b: [0, 0, 0.1, 0.1], c: 0.9, s: 9000, e: 9010 },
      { p: 1, b: [0, 0, 0.1, 0.1], c: 0.9, s: 7, e: 7 },
    ]
    expect(reconciliarOffsets(TEXTO, tokens)).toHaveLength(1)
  })

  it('devolve os tokens ordenados pela posição no texto', () => {
    const tokens = tokenizar(TEXTO).reverse()
    const reconciliados = reconciliarOffsets(TEXTO, tokens)
    const ordenado = [...reconciliados].sort((a, b) => a.s - b.s)
    expect(reconciliados).toEqual(ordenado)
  })
})
