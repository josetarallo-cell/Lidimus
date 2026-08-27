import { describe, expect, it } from 'vitest'
import { analisarPdf } from './arquivo.ts'
import {
  FIXTURE_229216,
  FIXTURE_61601,
  FIXTURE_COWBOY,
  FIXTURE_COWBOY3,
  FIXTURE_MAIRINQUE,
  FIXTURE_TRUNCADO,
  construirPdfDeTeste,
} from './fixtures.ts'

function codigos(pericia: ReturnType<typeof analisarPdf>): string[] {
  return pericia.indicios.map((i) => i.codigo)
}

describe('analisarPdf — amostras do plano', () => {
  it('Cowboy: sem CreationDate + Producer iLovePDF → criacao_ausente e produtor_editor', () => {
    const p = analisarPdf(FIXTURE_COWBOY)
    expect(codigos(p)).toContain('criacao_ausente')
    expect(codigos(p)).toContain('produtor_editor')
    expect(p.paginas).toBe(3)
    expect(p.truncado).toBe(false)
  })

  it('Cowboy3: mesmo padrão, uma página a mais que a Cowboy', () => {
    const p = analisarPdf(FIXTURE_COWBOY3)
    expect(codigos(p)).toContain('criacao_ausente')
    expect(codigos(p)).toContain('produtor_editor')
    expect(p.paginas).toBe(4)
  })

  it('Mairinque: Ghostscript é reimpressão (médio), não edição (alto)', () => {
    const p = analisarPdf(FIXTURE_MAIRINQUE)
    expect(codigos(p)).toContain('produtor_rerender')
    expect(codigos(p)).not.toContain('produtor_editor')
    expect(codigos(p)).not.toContain('criacao_ausente')
    const rerender = p.indicios.find((i) => i.codigo === 'produtor_rerender')
    expect(rerender?.peso).toBe('medio')
  })

  it('229.216 e 61601: Print To PDF é reimpressão, não alarme', () => {
    for (const fixture of [FIXTURE_229216, FIXTURE_61601]) {
      const p = analisarPdf(fixture)
      expect(codigos(p)).toContain('produtor_rerender')
      expect(codigos(p).filter((c) => c === 'produtor_editor')).toHaveLength(0)
      expect(codigos(p).filter((c) => c === 'mod_antes_da_criacao')).toHaveLength(0)
    }
  })

  it('arquivo truncado: sem xref/trailer/%%EOF', () => {
    const p = analisarPdf(FIXTURE_TRUNCADO)
    expect(p.truncado).toBe(true)
    expect(codigos(p)).toContain('arquivo_truncado')
  })
})

describe('analisarPdf — indícios isolados', () => {
  it('mod_antes_da_criacao quando ModDate < CreationDate', () => {
    const pdf = construirPdfDeTeste({
      paginas: 1,
      creationDate: "D:20260601000000-03'00'",
      modDate: "D:20260501000000-03'00'",
    })
    expect(codigos(analisarPdf(pdf))).toContain('mod_antes_da_criacao')
  })

  it('updates_incrementais quando há /Prev ou mais de um %%EOF', () => {
    const pdf = construirPdfDeTeste({ paginas: 1, comUpdateIncremental: true })
    expect(codigos(analisarPdf(pdf))).toContain('updates_incrementais')
  })

  it('sem_assinatura_digital é informativo, não alto', () => {
    const pdf = construirPdfDeTeste({ paginas: 1 })
    const p = analisarPdf(pdf)
    const s = p.indicios.find((i) => i.codigo === 'sem_assinatura_digital')
    expect(s?.peso).toBe('informativo')
  })

  it('produtor_rerender e sem_assinatura_digital sozinhos não viram peso alto (calibragem)', () => {
    const p = analisarPdf(FIXTURE_MAIRINQUE)
    expect(p.indicios.every((i) => i.peso !== 'alto')).toBe(true)
  })

  it('respeita paginasConhecidas quando informado, sem recontar', () => {
    const pdf = construirPdfDeTeste({ paginas: 3 })
    const p = analisarPdf(pdf, { paginasConhecidas: 99 })
    expect(p.paginas).toBe(99)
  })

  it('sha256 é determinístico para o mesmo buffer', () => {
    const pdf = construirPdfDeTeste({ paginas: 1 })
    expect(analisarPdf(pdf).sha256).toBe(analisarPdf(pdf).sha256)
    expect(analisarPdf(pdf).sha256).toHaveLength(64)
  })

  it('data_futura quando a data de criação está à frente de hoje', () => {
    const futuro = new Date(Date.now() + 30 * 86_400_000)
    const y = futuro.getUTCFullYear()
    const mo = String(futuro.getUTCMonth() + 1).padStart(2, '0')
    const dy = String(futuro.getUTCDate()).padStart(2, '0')
    const pdf = construirPdfDeTeste({ paginas: 1, creationDate: `D:${y}${mo}${dy}000000Z` })
    expect(codigos(analisarPdf(pdf))).toContain('data_futura')
  })
})
