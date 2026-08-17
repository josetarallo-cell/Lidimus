import { describe, expect, it } from 'vitest'
import { semTextoGirado } from './giro.ts'
import { levantarCandidatos } from './index.ts'
import { tokenizar } from './fixtures.ts'
import type { TokenOcr } from './tipos.ts'

/** Uma página de texto reto com alguns tokens do carimbo diagonal no meio. */
function pagina(anguloDoCorpo: number, anguloDoCarimbo: number, quantosDoCarimbo = 4): TokenOcr[] {
  const corpo: TokenOcr[] = Array.from({ length: 40 }, (_, i) => ({
    p: 1,
    b: [0.1, 0.1 + i * 0.01, 0.3, 0.11 + i * 0.01],
    c: 0.99,
    a: anguloDoCorpo,
    s: i * 10,
    e: i * 10 + 8,
  }))
  const carimbo: TokenOcr[] = Array.from({ length: quantosDoCarimbo }, (_, i) => ({
    p: 1,
    b: [0.4, 0.4 + i * 0.05, 0.6, 0.45 + i * 0.05],
    c: 0.5,
    a: anguloDoCarimbo,
    s: 1000 + i * 10,
    e: 1000 + i * 10 + 8,
  }))
  return [...corpo, ...carimbo]
}

describe('semTextoGirado', () => {
  it('tira o carimbo diagonal e mantém o corpo do documento', () => {
    const tokens = pagina(0, 45)
    const sobraram = semTextoGirado(tokens)
    expect(sobraram).toHaveLength(40)
    expect(sobraram.every((t) => t.a === 0)).toBe(true)
  })

  it('não apaga a página inteira quando a digitalização veio torta', () => {
    // O documento todo a 20° e o carimbo a 65°: medir contra a horizontal
    // absoluta descartaria tudo. Contra a mediana, só o carimbo sai.
    const tokens = pagina(20, 65)
    const sobraram = semTextoGirado(tokens)
    expect(sobraram).toHaveLength(40)
    expect(sobraram.every((t) => t.a === 20)).toBe(true)
  })

  it('deixa passar a inclinação leve de scanner', () => {
    const tokens = pagina(0, 6, 4)
    expect(semTextoGirado(tokens)).toHaveLength(44)
  })

  it('não filtra nada quando o ângulo não foi informado', () => {
    // Workflow de OCR antigo: sem o dado, descartar seria achismo.
    const tokens = pagina(0, 45).map(({ a: _a, ...resto }) => resto)
    expect(semTextoGirado(tokens)).toHaveLength(44)
  })

  it('cai para a horizontal em página com poucos tokens', () => {
    // Sem massa para uma mediana confiável, o carimbo poderia ser a maioria e
    // virar a referência — o que inverteria o filtro.
    const poucos: TokenOcr[] = [
      { p: 1, b: [0.1, 0.1, 0.2, 0.12], c: 0.9, a: 0, s: 0, e: 5 },
      { p: 1, b: [0.3, 0.3, 0.4, 0.35], c: 0.5, a: 45, s: 10, e: 15 },
      { p: 1, b: [0.3, 0.4, 0.4, 0.45], c: 0.5, a: 46, s: 20, e: 25 },
    ]
    const sobraram = semTextoGirado(poucos)
    expect(sobraram).toHaveLength(1)
    expect(sobraram[0].a).toBe(0)
  })

  it('mede cada página com a própria régua', () => {
    const p1 = pagina(0, 45).map((t) => ({ ...t, p: 1 }))
    const p2 = pagina(25, 70).map((t) => ({ ...t, p: 2, s: t.s + 5000, e: t.e + 5000 }))
    const sobraram = semTextoGirado([...p1, ...p2])
    expect(sobraram.filter((t) => t.p === 1)).toHaveLength(40)
    expect(sobraram.filter((t) => t.p === 2)).toHaveLength(40)
  })
})

describe('levantamento com o carimbo por cima', () => {
  it('não gasta vaga da tela com pedaço de carimbo', () => {
    const texto = 'Imóvel da matrícula 2.653 PARA SIMPLES CONSU UTORIZADO NAO VALE COMO'
    const tokens = tokenizar(texto)

    // Os pedaços do carimbo: lidos mal (estão por cima do texto) e na diagonal
    for (const t of tokens) {
      const palavra = texto.slice(t.s, t.e)
      if (['PARA', 'SIMPLES', 'CONSU', 'UTORIZADO', 'NAO', 'VALE', 'COMO'].includes(palavra)) {
        t.c = 0.45
        t.a = 45
      }
    }

    const comFiltro = levantarCandidatos(texto, tokens, { anoAtual: 2026 })
    expect(comFiltro).toHaveLength(0)

    // Sem o ângulo, os mesmos pedaços entrariam — é o que acontecia antes.
    const semAngulo = tokens.map(({ a: _a, ...resto }) => resto)
    expect(levantarCandidatos(texto, semAngulo, { anoAtual: 2026 }).length).toBeGreaterThan(0)
  })
})
