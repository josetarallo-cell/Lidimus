import { describe, expect, it } from 'vitest'
import { parseDms, rumoParaAzimute } from './angulos.ts'

describe('parseDms', () => {
  it('graus, minutos e segundos', () => {
    expect(parseDms('83°06\'19"')).toBeCloseTo(83 + 6 / 60 + 19 / 3600, 6)
  })
  it('graus e minutos', () => {
    expect(parseDms("12°30'")).toBeCloseTo(12.5, 6)
  })
  it('só graus, com e sem símbolo', () => {
    expect(parseDms('90°')).toBe(90)
    expect(parseDms('90')).toBe(90)
  })
  it('símbolo º alternativo e aspas duplicadas', () => {
    expect(parseDms("45º30'30''")).toBeCloseTo(45.508333, 5)
  })
  it('decimal com vírgula nos segundos', () => {
    expect(parseDms('10°00\'30,5"')).toBeCloseTo(10 + 30.5 / 3600, 6)
  })
  it('rejeita minutos/segundos ≥ 60 (artefato de OCR)', () => {
    expect(parseDms('83°66\'19"')).toBeNull()
    expect(parseDms('83°06\'75"')).toBeNull()
  })
  it('rejeita lixo', () => {
    expect(parseDms('')).toBeNull()
    expect(parseDms(null)).toBeNull()
    expect(parseDms('norte')).toBeNull()
  })
})

describe('rumoParaAzimute', () => {
  it('quadrante NE', () => {
    expect(rumoParaAzimute("N 45°10' E")).toBeCloseTo(45 + 10 / 60, 6)
  })
  it('quadrante SE', () => {
    expect(rumoParaAzimute('S 30° E')).toBeCloseTo(150, 6)
  })
  it('quadrante SW com O de oeste', () => {
    expect(rumoParaAzimute('S 22°30\'15" O')).toBeCloseTo(180 + 22.504166, 4)
  })
  it('quadrante NW', () => {
    expect(rumoParaAzimute('N 10° W')).toBeCloseTo(350, 6)
  })
  it('rejeita rumo acima de 90°', () => {
    expect(rumoParaAzimute('N 120° E')).toBeNull()
  })
  it('rejeita formato sem letras', () => {
    expect(rumoParaAzimute('45°10\'')).toBeNull()
  })
})
