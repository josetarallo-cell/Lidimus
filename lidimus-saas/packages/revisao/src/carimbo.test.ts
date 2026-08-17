import { describe, expect, it } from 'vitest'
import { removerCarimbo } from './carimbo.ts'
import { reconciliarOffsets } from './offsets.ts'
import type { TokenOcr } from './tipos.ts'

/**
 * Monta texto + índice de tokens a partir de linhas marcadas.
 * Linha começando com '@' é carimbo (girada); as demais são o documento.
 */
function documento(linhas: string[], anguloCorpo = 0, anguloCarimbo = 45) {
  const limpas = linhas.map((l) => (l.startsWith('@') ? l.slice(1) : l))
  const texto = limpas.join('\n')
  const tokens: TokenOcr[] = []

  let base = 0
  for (const [i, linha] of limpas.entries()) {
    const girada = linhas[i].startsWith('@')
    for (const m of linha.matchAll(/\S+/g)) {
      tokens.push({
        p: 1,
        b: [0.1, 0.1, 0.2, 0.12],
        c: 0.9,
        a: girada ? anguloCarimbo : anguloCorpo,
        s: base + m.index!,
        e: base + m.index! + m[0].length,
      })
    }
    base += linha.length + 1
  }
  return { texto, tokens }
}

// Uma página com corpo suficiente para a mediana valer (>= 20 tokens)
const CORPO = [
  'Imovel matriculado sob numero dois mil seiscentos e cinquenta e tres',
  'situado na rua Padre Raposo apartamento cento e vinte e um',
  'a parte ideal correspondente a sete virgula tres por cento a cada um',
]

describe('removerCarimbo', () => {
  it('tira o carimbo intercalado e junta de volta o texto do cartorio', () => {
    const { texto, tokens } = documento([
      ...CORPO,
      'A(O) escrevente:-',
      '@PARA SIMPLES CONSU',
      'Cavalhieri',
      '@UTORIZADO',
      '@NAO VALE COMO CERTIDAU',
      'SOLICITADO POR: VANIA LEME',
    ])

    const r = removerCarimbo(texto, tokens)

    expect(r.texto).toContain('A(O) escrevente:-\nCavalhieri\nSOLICITADO POR: VANIA LEME')
    expect(r.texto).not.toContain('SIMPLES CONSU')
    expect(r.texto).not.toContain('NAO VALE COMO')
    expect(r.removidos).toEqual(['PARA SIMPLES CONSU', 'UTORIZADO', 'NAO VALE COMO CERTIDAU'])
    expect(r.aborto).toBeUndefined()
  })

  it('deixa os tokens sobreviventes apontando para o texto novo', () => {
    const { texto, tokens } = documento([...CORPO, '@PARA SIMPLES CONSULTA', 'Cavalhieri'])
    const r = removerCarimbo(texto, tokens)

    // Todo token que sobrou tem que continuar recortando a mesma palavra
    for (const t of r.tokens) {
      expect(r.texto.slice(t.s, t.e)).toMatch(/^\S+$/)
    }
    const palavras = r.tokens.map((t) => r.texto.slice(t.s, t.e))
    expect(palavras).toContain('Cavalhieri')
    expect(palavras).not.toContain('CONSULTA')
  })

  it('não toca em documento sem carimbo', () => {
    const { texto, tokens } = documento(CORPO)
    const r = removerCarimbo(texto, tokens)
    expect(r.texto).toBe(texto)
    expect(r.removidos).toHaveLength(0)
  })

  it('deixa a página inteira em paz quando o girado é demais', () => {
    // Metade girada: a medição é que está errada (paisagem, coluna vertical),
    // e apagar metade da página seria pior que qualquer carimbo.
    const { texto, tokens } = documento([
      ...CORPO,
      '@' + CORPO[0],
      '@' + CORPO[1],
      '@' + CORPO[2],
    ])
    const r = removerCarimbo(texto, tokens)
    expect(r.texto).toBe(texto)
    expect(r.removidos).toHaveLength(0)
  })

  it('não remove nada quando o índice não traz ângulo', () => {
    const { texto, tokens } = documento([...CORPO, '@PARA SIMPLES CONSULTA'])
    const semAngulo = tokens.map(({ a: _a, ...resto }) => resto)
    const r = removerCarimbo(texto, semAngulo)
    expect(r.texto).toBe(texto)
    expect(r.aborto).toContain('sem angulo')
  })

  it('respeita a inclinação da digitalização torta', () => {
    // Documento a 20°, carimbo a 65°: medir contra a horizontal apagaria tudo.
    const { texto, tokens } = documento([...CORPO, '@PARA SIMPLES CONSULTA'], 20, 65)
    const r = removerCarimbo(texto, tokens)
    expect(r.removidos).toEqual(['PARA SIMPLES CONSULTA'])
    expect(r.texto).toContain('Imovel matriculado')
  })

  it('funciona com os offsets em bytes que o Document AI entrega', () => {
    const linhas = ['Imóvel da matrícula 2.653 em São Paulo', ...CORPO, '@NAO VALE COMO CERTIDAO']
    const { texto, tokens } = documento(linhas)
    const emBytes = tokens.map((t) => ({
      ...t,
      s: Buffer.byteLength(texto.slice(0, t.s), 'utf8'),
      e: Buffer.byteLength(texto.slice(0, t.e), 'utf8'),
    }))

    const r = removerCarimbo(texto, reconciliarOffsets(texto, emBytes))
    expect(r.removidos).toEqual(['NAO VALE COMO CERTIDAO'])
    expect(r.texto).toContain('Imóvel da matrícula 2.653 em São Paulo')
  })
})
