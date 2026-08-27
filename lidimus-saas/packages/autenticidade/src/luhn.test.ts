import { describe, expect, it } from 'vitest'
import { calcularDvLuhnModN, luhnModNFecha } from './luhn.ts'

describe('luhn mod 36', () => {
  // Especificação de Requisitos do Selo Digital TJSP, §4.9 — único exemplo da
  // spec que de fato fecha (o do §9.2 é placeholder).
  const SELO_VALIDO = '9999991CE0000000000030184'

  it('calcula o DV do exemplo oficial da spec', () => {
    expect(calcularDvLuhnModN(SELO_VALIDO.slice(0, -1))).toBe('4')
  })

  it('confirma que o selo completo fecha', () => {
    expect(luhnModNFecha(SELO_VALIDO)).toBe(true)
  })

  it('rejeita quando um caractere do payload muda', () => {
    const alterado = '9999992CE0000000000030184' // 7ª posição 1→2
    expect(luhnModNFecha(alterado)).toBe(false)
  })

  it('rejeita quando o DV impresso está errado', () => {
    const dvErrado = SELO_VALIDO.slice(0, -1) + '5'
    expect(luhnModNFecha(dvErrado)).toBe(false)
  })

  it('devolve false para código malformado, não lança', () => {
    expect(luhnModNFecha('')).toBe(false)
    expect(luhnModNFecha('1')).toBe(false)
    expect(luhnModNFecha('1!23456789012345678901234')).toBe(false)
  })
})
