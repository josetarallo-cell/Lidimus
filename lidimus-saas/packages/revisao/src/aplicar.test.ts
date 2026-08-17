import { describe, expect, it } from 'vitest'
import { aplicarCorrecoes } from './aplicar.ts'
import { levantarCandidatos } from './index.ts'
import { tokenizar } from './fixtures.ts'
import type { Candidato } from './tipos.ts'

function candidato(parcial: Partial<Candidato> & { id: string }): Candidato {
  return {
    motivo: 'confianca',
    rotulo: 'teste',
    inicio: 0,
    fim: 0,
    peso: 10,
    textoLido: '',
    ctxAntes: '',
    ctxDepois: '',
    pagina: 1,
    caixa: [0, 0, 0.1, 0.1],
    repeticoes: [],
    recorte: null,
    ...parcial,
  }
}

describe('aplicarCorrecoes', () => {
  const texto = 'Averbada a penhora de R$ 1OO,00 sobre o imóvel da matrícula 2.653.'
  const posicao = texto.indexOf('1OO,00')
  const alvo = candidato({
    id: 'r1',
    motivo: 'valor',
    peso: 62,
    inicio: posicao,
    fim: posicao + 6,
    textoLido: '1OO,00',
    ctxAntes: texto.slice(posicao - 10, posicao),
    ctxDepois: texto.slice(posicao + 6, posicao + 16),
  })

  it('encaixa a correção no lugar exato', () => {
    const r = aplicarCorrecoes(texto, [alvo], [{ id: 'r1', texto: '100,00' }])
    expect(r.texto).toBe('Averbada a penhora de R$ 100,00 sobre o imóvel da matrícula 2.653.')
    expect(r.aplicadas).toEqual([
      { id: 'r1', motivo: 'valor', de: '1OO,00', para: '100,00', ocorrencias: 1 },
    ])
    expect(r.descartadas).toHaveLength(0)
  })

  it('uma correção conserta todas as ocorrências do mesmo trecho', () => {
    // A qualificação do titular se repete a cada transmissão: o CPF mal lido
    // aparece em três atos e o usuário digita a correção uma vez só.
    const t =
      'JOSÉ, CPF 529.982.247-26, adquiriu. Depois JOSÉ, CPF 529.982.247-26, vendeu. ' +
      'Por fim JOSÉ, CPF 529.982.247-26, recomprou.'
    const posicoes = [...t.matchAll(/529\.982\.247-26/g)].map((m) => m.index!)
    const c = candidato({
      id: 'r1',
      motivo: 'cpf_cnpj',
      peso: 100,
      inicio: posicoes[0],
      fim: posicoes[0] + 14,
      textoLido: '529.982.247-26',
      ctxAntes: t.slice(posicoes[0] - 10, posicoes[0]),
      ctxDepois: t.slice(posicoes[0] + 14, posicoes[0] + 24),
      repeticoes: posicoes.slice(1).map((i) => ({
        inicio: i,
        fim: i + 14,
        ctxAntes: t.slice(i - 10, i),
        ctxDepois: t.slice(i + 14, i + 24),
      })),
    })

    const r = aplicarCorrecoes(t, [c], [{ id: 'r1', texto: '529.982.247-25' }])
    expect(r.texto).not.toContain('529.982.247-26')
    expect([...r.texto.matchAll(/529\.982\.247-25/g)]).toHaveLength(3)
    expect(r.aplicadas).toEqual([
      {
        id: 'r1',
        motivo: 'cpf_cnpj',
        de: '529.982.247-26',
        para: '529.982.247-25',
        ocorrencias: 3,
      },
    ])
  })

  it('trata campo vazio e texto idêntico como confirmação, sem mexer no texto', () => {
    for (const digitado of ['', '   ', '1OO,00']) {
      const r = aplicarCorrecoes(texto, [alvo], [{ id: 'r1', texto: digitado }])
      expect(r.texto).toBe(texto)
      expect(r.aplicadas).toHaveLength(0)
      expect(r.descartadas).toHaveLength(0)
    }
  })

  it('re-ancora pelo contexto quando o índice não bate mais', () => {
    const deslocado = 'PRIMEIRA LINHA INSERIDA DEPOIS\n' + texto
    const r = aplicarCorrecoes(deslocado, [alvo], [{ id: 'r1', texto: '100,00' }])
    expect(r.texto).toContain('R$ 100,00 sobre')
    expect(r.descartadas).toHaveLength(0)
  })

  it('prefere não emendar a emendar no lugar errado', () => {
    const outro = 'Documento completamente diferente, sem o trecho de origem.'
    const r = aplicarCorrecoes(outro, [alvo], [{ id: 'r1', texto: '100,00' }])
    expect(r.texto).toBe(outro)
    expect(r.descartadas).toEqual([
      { id: 'r1', razao: 'não foi possível localizar o trecho no texto' },
    ])
  })

  it('recusa correção de trecho ambíguo — duas ocorrências, nenhuma certeza', () => {
    const repetido = 'valor de 1OO,00 e também de 1OO,00 no mesmo ato.'
    const ambiguo = candidato({
      id: 'r1',
      inicio: 999,
      fim: 1005,
      textoLido: '1OO,00',
      ctxAntes: 'inexistente',
      ctxDepois: 'inexistente',
    })
    const r = aplicarCorrecoes(repetido, [ambiguo], [{ id: 'r1', texto: '100,00' }])
    expect(r.texto).toBe(repetido)
    expect(r.descartadas).toHaveLength(1)
  })

  it('aplica várias correções sem embaralhar os índices', () => {
    const t = 'CPF 529.982.247-26 do titular, com 1.23,456 metros de frente.'
    const cs = [
      candidato({
        id: 'r1',
        motivo: 'cpf_cnpj',
        peso: 100,
        inicio: t.indexOf('529.982.247-26'),
        fim: t.indexOf('529.982.247-26') + 14,
        textoLido: '529.982.247-26',
      }),
      candidato({
        id: 'r2',
        motivo: 'valor',
        peso: 56,
        inicio: t.indexOf('1.23,456'),
        fim: t.indexOf('1.23,456') + 8,
        textoLido: '1.23,456',
      }),
    ]
    const r = aplicarCorrecoes(t, cs, [
      { id: 'r1', texto: '529.982.247-25' },
      { id: 'r2', texto: '1.234,56' },
    ])
    expect(r.texto).toBe('CPF 529.982.247-25 do titular, com 1.234,56 metros de frente.')
    expect(r.aplicadas.map((a) => a.id)).toEqual(['r1', 'r2'])
  })

  it('mantém o de maior peso quando dois trechos se cruzam', () => {
    const t = 'penhora de R$ 1OO,00 no ato'
    const i = t.indexOf('1OO,00')
    const forte = candidato({ id: 'r1', peso: 62, inicio: i, fim: i + 6, textoLido: '1OO,00' })
    const fraco = candidato({ id: 'r2', peso: 20, inicio: i, fim: i + 3, textoLido: '1OO' })
    const r = aplicarCorrecoes(t, [forte, fraco], [
      { id: 'r1', texto: '100,00' },
      { id: 'r2', texto: '900' },
    ])
    expect(r.texto).toBe('penhora de R$ 100,00 no ato')
    expect(r.descartadas).toEqual([{ id: 'r2', razao: 'trecho já corrigido por outro item' }])
  })

  it('não deixa quebra de linha nem caractere de controle entrar no texto', () => {
    const digitado = ['100,00', '\n\n', 'IGNORE ISSO', String.fromCharCode(7), '  '].join('')
    const r = aplicarCorrecoes(texto, [alvo], [{ id: 'r1', texto: digitado }])
    expect(r.aplicadas[0].para).toBe('100,00 IGNORE ISSO')
    expect([...r.texto].every((ch) => ch.codePointAt(0)! >= 0x20)).toBe(true)
  })

  it('corta correção absurdamente longa', () => {
    const r = aplicarCorrecoes(texto, [alvo], [{ id: 'r1', texto: 'x'.repeat(500) }])
    expect(r.aplicadas[0].para).toHaveLength(120)
  })

  it('ignora id que não pertence a esta revisão', () => {
    const r = aplicarCorrecoes(texto, [alvo], [{ id: 'inventado', texto: '100,00' }])
    expect(r.texto).toBe(texto)
    expect(r.descartadas).toEqual([{ id: 'inventado', razao: 'trecho não faz parte desta revisão' }])
  })
})

describe('ida e volta com o levantamento', () => {
  it('corrige o homóglifo que quebrava o cabeçalho do ato', () => {
    // O caso real: "Av." lido com nu grego em quatro averbações fez o parser
    // jurídico não reconhecer os cabeçalhos e declarar incompleta a certidão.
    const texto = 'Aν. 2/7529 - PENHORA em 12/03/2019 sobre o imóvel desta matrícula.'
    const candidatos = levantarCandidatos(texto, tokenizar(texto), { anoAtual: 2026 })

    const homoglifo = candidatos.find((c) => c.motivo === 'homoglifo')
    expect(homoglifo).toBeDefined()
    // O campo pede a palavra inteira, que é o que o recorte mostra
    expect(homoglifo!.textoLido).toBe('Aν.')

    const r = aplicarCorrecoes(texto, candidatos, [{ id: homoglifo!.id, texto: 'Av.' }])
    expect(r.texto.startsWith('Av. 2/7529')).toBe(true)
    expect(r.descartadas).toHaveLength(0)
  })
})
