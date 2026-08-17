import { describe, expect, it } from 'vitest'
import {
  cnpjValido,
  cpfValido,
  detectarAtos,
  detectarConfianca,
  detectarDatas,
  detectarDocumentos,
  detectarHomoglifos,
  detectarValores,
} from './detectores.ts'
import { tokenizar } from './fixtures.ts'

const ANO = 2026

describe('dígitos verificadores', () => {
  it('aceita CPF e CNPJ válidos', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
  })

  it('recusa dígito trocado e sequência repetida', () => {
    expect(cpfValido('529.982.247-26')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
    expect(cnpjValido('11.222.333/0001-82')).toBe(false)
  })
})

describe('detectarDocumentos', () => {
  it('levanta só o CPF que não fecha', () => {
    const texto = 'ADQUIRENTE: JOSÉ, CPF 529.982.247-25, e MARIA, CPF 529.982.247-26.'
    const achados = detectarDocumentos(texto)
    expect(achados).toHaveLength(1)
    expect(texto.slice(achados[0].inicio, achados[0].fim)).toBe('529.982.247-26')
  })

  it('ignora sequências de onze dígitos que não são CPF', () => {
    // O CNM da certidão tem a mesma quantidade de dígitos e outra pontuação —
    // exigir a forma pontuada de CPF é o que mantém isto em zero falso positivo.
    expect(detectarDocumentos('CNM 145573.2.0002653-37')).toHaveLength(0)
    expect(detectarDocumentos('CEP: 18.120-000 Telefone (11) 4718-2141')).toHaveLength(0)
  })
})

describe('detectarDatas', () => {
  it('aceita datas reais', () => {
    expect(detectarDatas('Mairinque, 24 de fevereiro de 2012', ANO)).toHaveLength(0)
    expect(detectarDatas('registrado em 29/02/2020 e em 21/03/2024', ANO)).toHaveLength(0)
  })

  it('acusa dia que não existe no mês', () => {
    const achados = detectarDatas('escritura de 31/02/2019', ANO)
    expect(achados).toHaveLength(1)
    expect(achados[0].rotulo).toContain('dia que não existe')
  })

  it('acusa mês inexistente e ano fora do período', () => {
    expect(detectarDatas('em 12/13/2019', ANO)[0].rotulo).toContain('mês inexistente')
    expect(detectarDatas('em 12/03/2098', ANO)[0].rotulo).toContain('ano fora do período')
  })

  it('acusa nome de mês ilegível e aponta só a palavra', () => {
    const texto = 'Mairinque, 24 de fevereréiro de 2012'
    const achados = detectarDatas(texto, ANO)
    expect(achados).toHaveLength(1)
    expect(texto.slice(achados[0].inicio, achados[0].fim)).toBe('fevereréiro')
  })

  it('não confunde CEP, telefone e quilometragem com data', () => {
    const texto = 'CEP: 18.120-000, Telefone (11) 4718-2141, Km. 64 + 500 metros'
    expect(detectarDatas(texto, ANO)).toHaveLength(0)
  })
})

describe('detectarAtos', () => {
  it('acusa o ato cuja matrícula divergiu do resto do documento', () => {
    const texto = 'R.1/7.529 em 1998. Av.2/7529 em 2001. Av.3/7523 em 2005.'
    const achados = detectarAtos(texto, ANO)
    const divergente = achados.find((a) => a.rotulo.includes('outra matrícula'))
    expect(divergente).toBeDefined()
    expect(texto.slice(divergente!.inicio, divergente!.fim)).toBe('7523')
  })

  it('acusa salto na numeração dos atos', () => {
    const texto = 'R.1/100 em 1998. Av.2/100 em 2001. Av.5/100 em 2005.'
    const salto = detectarAtos(texto, ANO).find((a) => a.rotulo.includes('salta'))
    expect(salto).toBeDefined()
    expect(texto.slice(salto!.inicio, salto!.fim)).toBe('5')
  })

  it('acusa ano fora de ordem quando um dígito resolve', () => {
    const texto = 'R.1/100 em 1998. Av.2/100 em 2019. Av.3/100 em 2009.'
    const fora = detectarAtos(texto, ANO).find((a) => a.rotulo.includes('fora da ordem'))
    expect(fora).toBeDefined()
    expect(texto.slice(fora!.inicio, fora!.fim)).toBe('2009')
  })

  it('cala sobre inversão que nenhum dígito trocado explica', () => {
    // Registro feito hoje de escritura antiga é rotina no cartório; acusar isso
    // como erro de leitura treinaria o usuário a ignorar o corretor.
    const texto = 'R.1/100 em 1998. Av.2/100 em 2019. Av.3/100 em 1901.'
    expect(detectarAtos(texto, ANO).filter((a) => a.rotulo.includes('fora da ordem'))).toHaveLength(0)
  })

  it('não vê ato em rua, avenida nem em valor', () => {
    const texto = 'Rua 25 de Março, Av. Paulista, 1000, pelo valor de R$ 5/6 avos'
    expect(detectarAtos(texto, ANO)).toHaveLength(0)
  })
})

describe('detectarValores', () => {
  it('aceita valores e medidas bem formados', () => {
    const texto = 'pelo valor de R$ 1.234,56 e área de 10.000,00 m2, com 203,00 metros'
    expect(detectarValores(texto)).toHaveLength(0)
  })

  it('acusa letra no meio dos dígitos', () => {
    const texto = 'pelo valor de R$ 1OO,00'
    const achados = detectarValores(texto)
    expect(achados).toHaveLength(1)
    expect(achados[0].rotulo).toContain('letra')
    expect(texto.slice(achados[0].inicio, achados[0].fim)).toBe('1OO,00')
  })

  it('acusa pontuação de milhar inconsistente', () => {
    const achados = detectarValores('área de 1.23,456 metros quadrados')
    expect(achados).toHaveLength(1)
    expect(achados[0].rotulo).toContain('Pontuação')
  })
})

describe('detectarHomoglifos', () => {
  it('acha a letra grega que o mapa de homóglifos não cobriu', () => {
    const texto = 'Aν. 2/7529 - penhora'
    const achados = detectarHomoglifos(texto)
    expect(achados).toHaveLength(1)
    expect(texto.slice(achados[0].inicio, achados[0].fim)).toBe('ν')
  })

  it('deixa em paz acento, cedilha e pontuação de escritura', () => {
    const texto = 'Imóvel situado à Rua São João, nº 12 — 1º andar; área de 20m² (vinte).'
    expect(detectarHomoglifos(texto)).toHaveLength(0)
  })
})

describe('detectarConfianca', () => {
  it('agrupa tokens vizinhos de leitura ruim num só achado', () => {
    const texto = 'consta a penhora de 1.234,00 reais'
    const tokens = tokenizar(texto)
    // "de 1.234,00" — três tokens seguidos lidos mal viram uma pergunta só
    for (const t of tokens) {
      if (['de', '1.234,00', 'reais'].includes(texto.slice(t.s, t.e))) t.c = 0.6
    }
    const achados = detectarConfianca(texto, tokens)
    expect(achados).toHaveLength(1)
    expect(texto.slice(achados[0].inicio, achados[0].fim)).toBe('de 1.234,00 reais')
  })

  it('descarta grupo sem letra nem dígito', () => {
    const texto = 'a — b'
    const tokens = tokenizar(texto)
    for (const t of tokens) if (texto.slice(t.s, t.e) === '—') t.c = 0.2
    expect(detectarConfianca(texto, tokens)).toHaveLength(0)
  })

  it('não levanta nada quando a leitura foi confiante', () => {
    const texto = 'consta a penhora de 1.234,00 reais'
    expect(detectarConfianca(texto, tokenizar(texto))).toHaveLength(0)
  })
})
