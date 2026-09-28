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

  // A matrícula 119.908 do 15º RI de São Paulo: o cartório escreve
  // "Av.01 - 119.908 - São Paulo, ..." e o carimbo diagonal da certidão comeu o
  // hífen em sete dos dez atos. Sem aceitar espaço como separador, nenhum
  // cabeçalho é reconhecido e o detector desiste no piso de três — que foi
  // exatamente o que deixou a digitação errada do Av.03 passar sem conferência.
  it('lê cabeçalho cujo separador o OCR comeu', () => {
    const texto = 'Av.01 119.908 em 1990. Av.02 119.908 em 1990. Av.03 199.908 em 1990.'
    const divergente = detectarAtos(texto, ANO).find((a) => a.rotulo.includes('outra matrícula'))
    expect(divergente).toBeDefined()
    expect(texto.slice(divergente!.inicio, divergente!.fim)).toBe('199.908')
  })

  // "Av. 417529" é "Av. 4/7529" com a barra lida como 1 — o caso real da
  // matrícula 7.529. Se o separador virar opcional, o número do ato sai 41.
  it('não parte dígitos colados quando falta separador', () => {
    const texto = 'R.1/7.529 em 1998. Av. 417529 em 2001. Av.6/7.529 em 2005.'
    for (const achado of detectarAtos(texto, ANO)) {
      expect(achado.rotulo).not.toContain('41')
    }
  })
})

// A matrícula 119.908: a tarja da certidão eletrônica passou por cima do
// "AV. 06 - 119.908 - São" e o Document AI não leu nada disso — nem no texto
// bruto. Sobrou a cauda da linha, e é ela que prova que a PÁGINA chegou.
describe('detectarAtos — cabeçalho encoberto pela tarja', () => {
  const comCauda = [
    'Av.04 119.908',
    'São Paulo, 27 de abril de 1.990.',
    'Do requerimento de 06 de março de 1.990, verifica-se que o prédio foi demolido.',
    'Av.05 119.908',
    'São Paulo, 27 de abril de 1.990.',
    'Do requerimento de 06 de março de 1.990, verifica-se que foi construído um prédio.',
    'Paulo, 18 de setembro de 1990.',
    'Do requerimento de 13 de setembro de 1990, verifica-se que em virtude do englobamento.',
    'Av.07 119.908',
    'São Paulo, 12 de dezembro de 1994.',
  ].join('\n')

  it('acusa o cabeçalho que não foi lido, ancorado na cauda órfã', () => {
    const achado = detectarAtos(comCauda, ANO).find((a) => a.motivo === 'cabecalho')
    expect(achado).toBeDefined()
    expect(achado!.rotulo).toContain('ato 6')
    // Âncora é o fragmento ANTES da data: a data fica fora do campo e, por
    // construção, o usuário não tem como errá-la ao redigitar.
    expect(comCauda.slice(achado!.inicio, achado!.fim)).toBe('Paulo')
  })

  it('substitui o aviso de salto em vez de somar a ele', () => {
    const achados = detectarAtos(comCauda, ANO)
    expect(achados.filter((a) => a.rotulo.includes('salta'))).toHaveLength(0)
    expect(achados.filter((a) => a.motivo === 'cabecalho')).toHaveLength(1)
  })

  it('sugere o cabeçalho com a cidade dos irmãos e a letra tirada do corpo', () => {
    const achado = detectarAtos(comCauda, ANO).find((a) => a.motivo === 'cabecalho')
    // "São Paulo" vem dos outros atos — o OCR só leu "Paulo" nesta linha, e
    // reconstruir com o fragmento mutilado daria um cabeçalho sutilmente errado.
    // "AV" vem de "Do requerimento … verifica-se", que é linguagem de averbação.
    expect(achado!.sugestao).toBe('AV.06 - 119.908 - São Paulo')
  })

  it('sugere R quando o corpo do ato é de registro', () => {
    const texto = comCauda.replace(
      'Do requerimento de 13 de setembro de 1990, verifica-se que em virtude do englobamento.',
      'TRANSMITENTE: FULANO. ADQUIRENTE: BELTRANO. TÍTULO: COMPRA E VENDA. VALOR: R$ 1,00.',
    )
    const achado = detectarAtos(texto, ANO).find((a) => a.motivo === 'cabecalho')
    expect(achado!.sugestao).toBe('R.06 - 119.908 - São Paulo')
  })

  it('cala quando a data da cauda não cabe entre as vizinhas', () => {
    // Registro feito hoje de escritura antiga é rotina; data fora da janela não
    // prova ato nenhum, e a direção segura é o silêncio.
    const texto = comCauda.replace('Paulo, 18 de setembro de 1990.', 'Paulo, 18 de setembro de 2001.')
    expect(detectarAtos(texto, ANO).filter((a) => a.motivo === 'cabecalho')).toHaveLength(0)
  })

  it('cala quando uma cauda só teria de explicar vários atos ausentes', () => {
    // Contagem casada: página faltando leva embora um bloco de atos, e uma
    // linha solta não justifica seis. É o que protege a matrícula 54.204.
    const texto = comCauda.replace('Av.07 119.908', 'Av.11 119.908')
    expect(detectarAtos(texto, ANO).filter((a) => a.motivo === 'cabecalho')).toHaveLength(0)
  })

  it('cala no topo de ficha, que tem a mesma forma', () => {
    // Falso positivo real da matrícula 82.662: o cabeçalho da ficha repete
    // "Cidade, data" logo abaixo de "LIVRO N° 2 / matrícula / ficha".
    const texto = comCauda.replace(
      'Paulo, 18 de setembro de 1990.',
      'LIVRO N° 2\nmatrícula\n119.908\nficha\n04\nSão Paulo, 18 de setembro de 1990.',
    )
    expect(detectarAtos(texto, ANO).filter((a) => a.motivo === 'cabecalho')).toHaveLength(0)
  })

  it('cala quando a linha é a cauda de um cabeçalho que foi lido', () => {
    // Aqui não falta rótulo nenhum: cada "Cidade, data" pertence ao cabeçalho
    // logo acima. O salto de 5 para 7 continua sendo acusado como salto.
    const texto = [
      'Av.04 119.908',
      'São Paulo, 27 de abril de 1.990.',
      'Av.05 119.908',
      'São Paulo, 27 de abril de 1.990.',
      'Av.07 119.908',
      'São Paulo, 12 de dezembro de 1994.',
    ].join('\n')
    const achados = detectarAtos(texto, ANO)
    expect(achados.filter((a) => a.motivo === 'cabecalho')).toHaveLength(0)
    expect(achados.filter((a) => a.rotulo.includes('salta'))).toHaveLength(1)
  })
})

// A matrícula 33.032 do 1º RI de Mogi das Cruzes: o cartório datilografa o
// cabeçalho sem a matrícula colada — "R.1 USUCAPIÃO", ou o assunto na linha de
// baixo — e o OCR leu o "R.8" como "R.e". Sem ler esse formato, o detector
// desistia no piso de três e o corretor não mostrou o ato cujo número sumiu.
describe('detectarAtos — cabeçalho de linha, sem a matrícula colada', () => {
  const linhas = [
    'R.1 USUCAPIÃO',
    'Pelo Mandado expedido aos 26 de outubro de 1987. Mogi das Cruzes, 03 de novembro de 1.992.',
    'Av.2',
    'OBITO',
    'Pelo Formal de Partilha verifica-se que faleceu. Mogi das Cruzes, 03 de novembro de 1.992.',
    'Av.3 - CASAMENTO',
    'Pela certidão de casamento. Mogi das Cruzes, 03 de novembro de 1.992.',
    'R.e',
    'VENDA E COMPRA',
    'Pela escritura, TRANSMITIRAM POR VENDA a parte ideal. Mogi das Cruzes, 03 de novembro de 1.992.',
    'Av.5 - CADASTRO MUNICIPAL ATUAL',
    'Pela escritura de 06 de julho de 2011. Mogi das Cruzes, 09 de agosto de 2011.',
  ]
  const texto = linhas.join('\n')

  it('acusa o cabeçalho cujo número virou letra e sugere o número pela posição', () => {
    const achado = detectarAtos(texto, ANO).find((a) => a.motivo === 'cabecalho')
    expect(achado).toBeDefined()
    expect(texto.slice(achado!.inicio, achado!.fim)).toBe('R.e')
    expect(achado!.rotulo).toContain('ato 4')
    // A letra é a que foi lida; só o número é deduzido
    expect(achado!.sugestao).toBe('R.4')
  })

  it('substitui o aviso de salto em vez de somar a ele', () => {
    const achados = detectarAtos(texto, ANO)
    expect(achados.filter((a) => a.rotulo.includes('salta'))).toHaveLength(0)
    expect(achados.filter((a) => a.motivo === 'cabecalho')).toHaveLength(1)
  })

  it('acusa salto quando não sobrou cabeçalho nenhum no vão', () => {
    const semOito = linhas.filter((l) => l !== 'R.e' && l !== 'VENDA E COMPRA').join('\n')
    const salto = detectarAtos(semOito, ANO).find((a) => a.rotulo.includes('salta'))
    expect(salto).toBeDefined()
    expect(salto!.rotulo).toContain('de 3 para 5')
  })

  it('cala sobre o número quando o vão salta mais de um', () => {
    // Dois números possíveis e um cabeçalho só: deduzir seria adivinhar
    const texto2 = texto.replace('Av.5 - CADASTRO', 'Av.6 - CADASTRO')
    const achados = detectarAtos(texto2, ANO)
    expect(achados.filter((a) => a.motivo === 'cabecalho')).toHaveLength(0)
    expect(achados.filter((a) => a.rotulo.includes('salta'))).toHaveLength(1)
  })

  it('não confunde endereço nem sobra de carimbo com cabeçalho', () => {
    const ruido = [
      'R. DE MORAES, 120',
      'AV. 9 JULHO, 500',
      'R5',
      'SOLICITADO POR: FULANO',
      'Rua 25 de Março',
      'objeto da Av.4 retro, e à vista da certidão',
    ].join('\n')
    expect(detectarAtos(ruido, ANO)).toHaveLength(0)
  })

  it('lê os dois formatos no mesmo documento sem perder o de matrícula', () => {
    const misto = 'R.1/7.529 em 1998. Av.2/7529 em 2001. Av.3/7523 em 2005.\n' + texto
    const divergente = detectarAtos(misto, ANO).find((a) => a.rotulo.includes('outra matrícula'))
    expect(divergente).toBeDefined()
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
