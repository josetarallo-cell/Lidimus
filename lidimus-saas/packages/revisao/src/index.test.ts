import { describe, expect, it } from 'vitest'
import { MAX_CANDIDATOS, levantarCandidatos } from './index.ts'
import { tokenizar } from './fixtures.ts'

const ANO = 2026

describe('levantarCandidatos', () => {
  it('devolve nada sem índice de tokens — sem caixa não há o que mostrar', () => {
    const texto = 'CPF 529.982.247-26 do titular.'
    expect(levantarCandidatos(texto, [], { anoAtual: ANO })).toEqual([])
  })

  it('devolve nada num documento limpo', () => {
    const texto =
      'Imóvel matriculado sob nº 2.653, adquirido por JOSÉ, CPF 529.982.247-25, ' +
      'em 24 de fevereiro de 2012, pelo valor de R$ 120.000,00, com área de 250,00 m2.'
    expect(levantarCandidatos(texto, tokenizar(texto), { anoAtual: ANO })).toEqual([])
  })

  it('ancora cada candidato numa página com caixa dentro dos limites', () => {
    const texto = 'CPF 529.982.247-26 e valor de R$ 1OO,00 em 31/02/2019.'
    const candidatos = levantarCandidatos(texto, tokenizar(texto), { anoAtual: ANO })
    expect(candidatos.length).toBeGreaterThanOrEqual(3)
    for (const c of candidatos) {
      expect(c.pagina).toBeGreaterThanOrEqual(1)
      const [x0, y0, x1, y1] = c.caixa
      expect(x0).toBeGreaterThanOrEqual(0)
      expect(y0).toBeGreaterThanOrEqual(0)
      expect(x1).toBeLessThanOrEqual(1)
      expect(y1).toBeLessThanOrEqual(1)
      expect(x1).toBeGreaterThan(x0)
      expect(y1).toBeGreaterThan(y0)
      expect(c.recorte).toBeNull()
    }
  })

  it('o texto do campo é o que o recorte mostra', () => {
    const texto = 'penhora de R$ 1OO,00 averbada'
    const [c] = levantarCandidatos(texto, tokenizar(texto), { anoAtual: ANO })
    expect(texto.slice(c.inicio, c.fim)).toBe(c.textoLido)
  })

  it('nunca passa do teto de itens', () => {
    // Documento inteiro lido mal: são dezenas de suspeitas de confiança
    const texto = Array.from({ length: 60 }, (_, i) => `palavra${i}`).join(' ')
    const candidatos = levantarCandidatos(texto, tokenizar(texto, { confianca: 0.4 }), {
      anoAtual: ANO,
    })
    expect(candidatos).toHaveLength(MAX_CANDIDATOS)
  })

  it('verificação dura nunca perde vaga para palpite de confiança', () => {
    // Cenário do inferno: leitura ruim em tudo, e no meio três erros certos.
    const ruim = Array.from({ length: 40 }, (_, i) => `palavra${i}`).join(' ')
    const texto = `${ruim} CPF 529.982.247-26 em 31/02/2019 valendo R$ 1OO,00 ${ruim}`
    const candidatos = levantarCandidatos(texto, tokenizar(texto, { confianca: 0.4 }), {
      anoAtual: ANO,
    })

    expect(candidatos).toHaveLength(MAX_CANDIDATOS)
    const motivos = candidatos.map((c) => c.motivo)
    expect(motivos).toContain('cpf_cnpj')
    expect(motivos).toContain('data')
    expect(motivos).toContain('valor')
  })

  it('entrega na ordem do documento, com ids únicos', () => {
    const texto =
      'CPF 529.982.247-26 do titular. ' +
      'Aν. 2/7529 - PENHORA. ' +
      'Valor de R$ 1OO,00 em 31/02/2019.'
    const candidatos = levantarCandidatos(texto, tokenizar(texto), { anoAtual: ANO })

    const posicoes = candidatos.map((c) => c.inicio)
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b))
    expect(new Set(candidatos.map((c) => c.id)).size).toBe(candidatos.length)
  })

  it('conta um achado só quando dois detectores apontam o mesmo trecho', () => {
    // O CPF inválido também tem confiança baixa; a tela pergunta uma vez, com o
    // rótulo da verificação dura, que explica melhor o problema.
    const texto = 'titular com CPF 529.982.247-26 inscrito'
    const tokens = tokenizar(texto)
    for (const t of tokens) if (texto.slice(t.s, t.e) === '529.982.247-26') t.c = 0.5

    const candidatos = levantarCandidatos(texto, tokens, { anoAtual: ANO })
    expect(candidatos).toHaveLength(1)
    expect(candidatos[0].motivo).toBe('cpf_cnpj')
  })

  it('funciona com offsets em bytes, como o Document AI entrega', () => {
    const texto = 'Imóvel da matrícula 2.653, área de 1.23,456 metros quadrados, em São Paulo.'
    const porBytes = levantarCandidatos(texto, tokenizar(texto, { porBytes: true }), {
      anoAtual: ANO,
    })
    const porCaracteres = levantarCandidatos(texto, tokenizar(texto), { anoAtual: ANO })

    expect(porBytes).toHaveLength(1)
    expect(porBytes[0].textoLido).toBe('1.23,456')
    expect(porBytes).toEqual(porCaracteres)
  })
})
