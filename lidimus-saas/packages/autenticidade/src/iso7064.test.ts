import { describe, expect, it } from 'vitest'
import { calcularDvIso7064, iso7064Fecha } from './iso7064.ts'

// Não há, até o momento desta implementação, um CNM real publicamente
// documentado para usar como vetor externo (o Provimento CNJ 89/2019 define o
// algoritmo, não publica exemplo numérico). O algoritmo em si é o mesmo do
// dígito verificador do IBAN (ISO 7064 MOD 97-10), então os testes abaixo
// fixam um vetor calculado pela própria implementação — o que pega regressão
// de comportamento — e conferem as propriedades que a spec exige: o número
// completo (base + DV) sempre fecha em mod 97 == 1, e qualquer dígito alterado
// quebra isso.
describe('iso 7064 mod 97-10', () => {
  const BASE_13_DIGITOS = '1455720000001' // CNS(5) + Livro(1) + nº de ordem(7)
  const DV_FIXADO = '72'

  it('calcula o DV do vetor fixado (regressão)', () => {
    expect(calcularDvIso7064(BASE_13_DIGITOS)).toBe(DV_FIXADO)
  })

  it('o número completo fecha em mod 97 == 1', () => {
    expect(iso7064Fecha(BASE_13_DIGITOS + DV_FIXADO)).toBe(true)
  })

  it('rejeita quando um dígito da base muda', () => {
    const alterada = '1455720000009' + DV_FIXADO
    expect(iso7064Fecha(alterada)).toBe(false)
  })

  it('rejeita quando os dígitos verificadores mudam', () => {
    expect(iso7064Fecha(BASE_13_DIGITOS + '00')).toBe(false)
  })

  it('rejeita entrada não numérica sem lançar', () => {
    expect(iso7064Fecha('14557X000000172')).toBe(false)
  })

  it('calcularDvIso7064 lança para base não numérica', () => {
    expect(() => calcularDvIso7064('14557X0000001')).toThrow()
  })
})
