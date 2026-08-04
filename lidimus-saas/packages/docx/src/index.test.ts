import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  loteMatriculasDocx,
  nomeDoArquivoLote,
  nomeDoArquivoParecer,
  pareceMatriculaDocx,
} from './index.ts'
import { documentoCompleto, documentoIncompleto } from './fixtures.ts'
import { nomeDoParecer, rotuloCertidao, valorDoAto } from './parecer.ts'

/**
 * O .docx é um zip de XML. Para afirmar o que o documento diz, é preciso abrir
 * o zip e ler o texto — asserção sobre o Buffer cru daria falso negativo, já
 * que o conteúdo sai comprimido.
 */
async function textoDoDocx(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const arquivo = zip.file('word/document.xml')
  expect(arquivo, 'word/document.xml ausente — o arquivo não é um .docx válido').toBeTruthy()
  const xml = await arquivo!.async('string')
  // <w:t> carrega o texto visível; o resto é formatação
  return (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? [])
    .map((t) => t.replace(/<[^>]+>/g, ''))
    .join(' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
}

describe('pareceMatriculaDocx — matrícula completa', () => {
  let texto: string
  let buf: Buffer

  beforeAll(async () => {
    buf = await pareceMatriculaDocx(documentoCompleto, {
      emitidoEm: '21/03/2024 15:04',
      arquivoOriginal: 'matricula-12345.pdf',
    })
    texto = await textoDoDocx(buf)
  })

  it('produz um .docx válido (zip com as peças obrigatórias)', async () => {
    expect(buf.length).toBeGreaterThan(1000)
    // PK: assinatura de zip
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
    const zip = await JSZip.loadAsync(buf)
    for (const peca of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml']) {
      expect(zip.file(peca), `falta ${peca}`).toBeTruthy()
    }
  })

  it('traz identificação, cartório e datas do cabeçalho', () => {
    expect(texto).toContain('Matrícula 12.345')
    expect(texto).toContain('1º Oficial de Registro de Imóveis de São Paulo')
    expect(texto).toContain('Livro 2 / Fl. 88')
    expect(texto).toContain('012.345.6789-0')
    expect(texto).toContain('21/03/2024 15:04')
  })

  it('escreve o risco em português, nunca o enum cru (regra 7)', () => {
    expect(texto).toContain('Risco alto')
    expect(texto).not.toContain('classificacao_risco')
  })

  it('traz todas as seções do laudo', () => {
    for (const secao of [
      'Imóvel',
      'Proprietários atuais',
      'Parecer',
      'Análise jurídica',
      'Histórico de atos',
      'Ônus e gravames ativos',
    ]) {
      expect(texto, `seção ausente: ${secao}`).toContain(secao)
    }
  })

  it('converte a prosa em HTML da análise', () => {
    expect(texto).toContain('Hipoteca')
    expect(texto).toContain('Penhora ativa (Av.11)')
    expect(texto).toContain('Divergência de 0,4 m²')
    expect(texto).toContain('Art. 1.473 do Código Civil.')
    // Marcação não vaza como texto
    expect(texto).not.toContain('<strong>')
    expect(texto).not.toContain('<li>')
  })

  it('mantém a moeda como o documento escreveu (regra 4)', () => {
    expect(texto).toContain('Cr$ 12.000.000')
    expect(texto).toContain('R$ 480.000,00')
    // Nunca converte cruzeiro de 1966 em real corrente
    expect(texto).not.toContain('R$ 12.000.000')
  })

  it('marca o ato cancelado', () => {
    expect(texto).toContain('[CANCELADO]')
    expect(texto).toContain('cancelado por Av.4')
  })

  it('separa promitentes dos proprietários', () => {
    expect(texto).toContain('Promitentes compradores e cessionários')
    expect(texto).toContain('não são os proprietários')
    expect(texto).toContain('Construtora Horizonte Ltda.')
  })

  it('lista os ônus ativos', () => {
    expect(texto).toContain('Banco Exemplo S.A.')
    expect(texto).toContain('Fazenda Nacional')
    expect(texto).not.toContain('Nenhum ônus ativo identificado')
  })

  it('não traz as ressalvas que só valem para documento incompleto', () => {
    expect(texto).not.toContain('parecer jurídico não emitido')
    expect(texto).not.toContain('Lista não exaustiva')
    expect(texto).not.toContain('não confirmam a titularidade do domínio')
  })

  it('traz o rodapé de isenção (regra 8)', () => {
    expect(texto).toContain('não substitui a certidão oficial do cartório')
    expect(texto).toContain('nem o parecer de profissional habilitado')
    expect(texto).toContain('6 página(s) analisada(s)')
    expect(texto).toContain('baixa qualidade de digitalização')
  })
})

describe('pareceMatriculaDocx — matrícula incompleta (regras 1, 2, 3, 5, 6)', () => {
  let texto: string

  beforeAll(async () => {
    texto = await textoDoDocx(await pareceMatriculaDocx(documentoIncompleto))
  })

  it('avisa que o parecer não foi emitido, antes de qualquer dado (regra 1)', () => {
    expect(texto).toContain('Matrícula incompleta — parecer jurídico não emitido')
    expect(texto).toContain('3 das 8 páginas declaradas')
    expect(texto).toContain('certidão de inteiro teor')
    expect(texto).toContain('Não emitido.')
  })

  it('NÃO estampa classificação de risco (regra 1)', () => {
    expect(texto).not.toContain('Risco médio')
    expect(texto).not.toContain('Risco baixo')
    expect(texto).not.toContain('Risco alto')
    expect(texto).not.toContain('medio')
  })

  it('suprime parecer, resumo, riscos, cadeia e fundamentação (regra 1)', () => {
    expect(texto).not.toContain('Não deveria aparecer no documento.')
    expect(texto).not.toContain('Resumo que não deve sair')
    expect(texto).not.toContain('Risco que não deve sair')
    expect(texto).not.toContain('Problema que não deve sair')
    expect(texto).not.toContain('Cadeia que não deve sair')
    expect(texto).not.toContain('Fundamentação que não deve sair')
  })

  it('troca "Análise jurídica" por "Lacunas do documento" e mantém as inconsistências', () => {
    expect(texto).toContain('Lacunas do documento')
    expect(texto).not.toContain('Análise jurídica')
    expect(texto).toContain('Faltam as páginas 4 a 8.')
  })

  it('lista vazia de ônus não vira "nenhum ônus ativo" (regra 2)', () => {
    expect(texto).toContain('Lista não exaustiva')
    expect(texto).toContain('não significa que o imóvel esteja livre')
    expect(texto).not.toContain('Nenhum ônus ativo identificado')
  })

  it('ressalva a titularidade não confirmada (regra 3)', () => {
    expect(texto).toContain('não confirmam a titularidade do domínio')
  })

  it('reproduz a divisa como a matrícula escreveu, sem inventar rumo (regra 5)', () => {
    expect(texto).toContain('de um lado')
    expect(texto).toContain('com o lote 12')
    expect(texto).toContain('não indica rumo cardeal')
    for (const rumo of ['Norte', 'Sul', 'Leste', 'Oeste']) {
      expect(texto, `rumo cardeal inventado: ${rumo}`).not.toContain(rumo)
    }
  })

  it('data a certidão por baixo quando não há expedição (regra 6)', () => {
    expect(texto).toContain('Posterior a 30/11/2021')
  })
})

describe('rotuloCertidao (regra 6)', () => {
  it('usa data e hora quando há', () => {
    expect(rotuloCertidao({ cabecalho: { certidao: { data: '01/02/2024', hora: '09:10' } } })).toBe(
      '01/02/2024 · 09:10',
    )
  })
  it('usa só a data quando não há hora', () => {
    expect(rotuloCertidao({ cabecalho: { certidao: { data: '01/02/2024' } } })).toBe('01/02/2024')
  })
  it('cai para "posterior a" quando não há data', () => {
    expect(rotuloCertidao({ cabecalho: { certidao: { posterior_a: '10/10/2020' } } })).toBe(
      'Posterior a 10/10/2020',
    )
  })
  it('assume não identificada quando não há nada', () => {
    expect(rotuloCertidao({})).toBe('Não identificada')
  })
})

describe('valorDoAto (regra 4)', () => {
  it('prefere valor_display', () => {
    expect(valorDoAto({ valor_display: 'Cr$ 12.000.000', valor: '12000000' })).toBe('Cr$ 12.000.000')
  })
  it('usa a moeda declarada quando não há display', () => {
    expect(valorDoAto({ valor: '5.000', moeda: 'Cz$' })).toBe('Cz$ 5.000')
  })
  it('assume real só na ausência de moeda — laudo antigo', () => {
    expect(valorDoAto({ valor: '5.000' })).toBe('R$ 5.000')
  })
  it('devolve nulo quando não há valor', () => {
    expect(valorDoAto({})).toBeNull()
    expect(valorDoAto({ valor: null })).toBeNull()
  })
})

describe('nome do arquivo', () => {
  it('usa o número da matrícula', () => {
    expect(nomeDoParecer(documentoCompleto)).toBe('parecer-matricula-12.345')
    expect(nomeDoArquivoParecer(documentoCompleto)).toBe('parecer-matricula-12.345.docx')
  })
  it('cai para o id do job quando não há número', () => {
    expect(nomeDoParecer({}, 'abcdef01-2345-6789')).toBe('parecer-abcdef01')
  })
  it('não deixa acento nem barra escaparem para o nome do arquivo', () => {
    const nome = nomeDoParecer({ cabecalho: { numero_matricula: 'Matrícula 1/2 nº 9' } })
    expect(nome).toBe('parecer-matricula-matricula-1-2-n-9')
    expect(nome).not.toMatch(/[^\w.-]/)
  })
  it('data o arquivo do lote', () => {
    expect(nomeDoArquivoLote('03/08/2026 10:00')).toBe('lote-matriculas-2026-08-03.docx')
    expect(nomeDoArquivoLote(null)).toBe('lote-matriculas.docx')
  })
})

describe('loteMatriculasDocx', () => {
  const itens = [
    {
      id: 'a1',
      status: 'done',
      arquivoOriginal: 'mat-12345.pdf',
      emitidoEm: '21/03/2024 15:04',
      documento: documentoCompleto,
    },
    {
      id: 'b2',
      status: 'done',
      arquivoOriginal: 'mat-98765.pdf',
      emitidoEm: '02/08/2026 09:00',
      documento: documentoIncompleto,
    },
    { id: 'c3', status: 'error', arquivoOriginal: 'ilegivel.pdf', documento: null },
  ]

  it('traz capa, índice e um parecer por análise concluída', async () => {
    const texto = await textoDoDocx(
      await loteMatriculasDocx(itens, { loteId: 'lote-1', enviadoEm: '03/08/2026 08:00' }),
    )
    expect(texto).toContain('Pareceres de matrícula')
    expect(texto).toContain('2 de 3 análise(s) concluída(s)')
    expect(texto).toContain('mat-12345.pdf')
    expect(texto).toContain('Risco alto')
    // Regra 1 também no índice: incompleta não recebe risco
    expect(texto).toContain('Matrícula incompleta — parecer não emitido')
    // A que falhou não some do índice — sumir faria o lote parecer completo
    expect(texto).toContain('ilegivel.pdf')
    expect(texto).toContain('Não concluída — falhou')
    // E os dois pareceres saem por inteiro
    expect(texto).toContain('Matrícula 12.345')
    expect(texto).toContain('Matrícula 98.765')
  })

  it('gera arquivo válido mesmo sem nenhuma análise concluída', async () => {
    const buf = await loteMatriculasDocx(
      [{ id: 'x', status: 'error', arquivoOriginal: 'a.pdf', documento: null }],
      { loteId: 'lote-2' },
    )
    const texto = await textoDoDocx(buf)
    expect(texto).toContain('Nenhuma análise deste lote foi concluída')
  })
})

describe('robustez', () => {
  it('não estoura com documento vazio', async () => {
    const texto = await textoDoDocx(await pareceMatriculaDocx({}))
    expect(texto).toContain('Matrícula —')
    expect(texto).toContain('não substitui a certidão oficial')
  })

  it('não estoura com seções nulas', async () => {
    const doc = {
      cabecalho: { numero_matricula: '1' },
      imovel: null,
      proprietarios: null,
      parecer: null,
      analise_juridica: null,
      historico_atos: null,
      onus: null,
      metadados: null,
    }
    await expect(pareceMatriculaDocx(doc as any)).resolves.toBeInstanceOf(Buffer)
  })

  it('ignora croqui em SVG (o Word não lê) e não quebra', async () => {
    const doc = { ...documentoCompleto, croqui: { disponivel: true, svg: '<svg/>' } }
    const texto = await textoDoDocx(await pareceMatriculaDocx(doc))
    expect(texto).not.toContain('Croqui do terreno')
    expect(texto).not.toContain('<svg')
  })
})
