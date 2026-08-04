import { describe, expect, it } from 'vitest'
import { htmlParaBlocos, htmlParaParagrafos, htmlParaTexto } from './html.ts'
import type { Bloco } from './html.ts'

// Atalho de leitura: o texto concatenado de um bloco
const txt = (b: Bloco) => b.pecas.map((p) => (p.tipo === 'texto' ? p.texto : '\n')).join('')

describe('htmlParaBlocos', () => {
  it('devolve vazio para entrada nula, vazia ou só espaço', () => {
    expect(htmlParaBlocos(null)).toEqual([])
    expect(htmlParaBlocos(undefined)).toEqual([])
    expect(htmlParaBlocos('')).toEqual([])
    expect(htmlParaBlocos('   \n  ')).toEqual([])
    expect(htmlParaBlocos('<p></p>')).toEqual([])
  })

  it('converte parágrafos', () => {
    const blocos = htmlParaBlocos('<p>Primeiro.</p><p>Segundo.</p>')
    expect(blocos.map((b) => b.tipo)).toEqual(['paragrafo', 'paragrafo'])
    expect(blocos.map(txt)).toEqual(['Primeiro.', 'Segundo.'])
  })

  it('colapsa o espaço em branco da indentação do HTML', () => {
    const [bloco] = htmlParaBlocos('<p>\n   Um   texto\n   quebrado.\n</p>')
    expect(txt(bloco)).toBe('Um texto quebrado.')
  })

  it('marca negrito e itálico, inclusive aninhados', () => {
    const [bloco] = htmlParaBlocos('<p>Risco <strong>alto <em>mesmo</em></strong>.</p>')
    expect(bloco.pecas).toEqual([
      { tipo: 'texto', texto: 'Risco ' },
      { tipo: 'texto', texto: 'alto ', bold: true },
      { tipo: 'texto', texto: 'mesmo', bold: true, italics: true },
      { tipo: 'texto', texto: '.' },
    ])
  })

  it('aceita <b> e <i> como sinônimos', () => {
    const [bloco] = htmlParaBlocos('<p><b>a</b><i>b</i></p>')
    expect(bloco.pecas).toEqual([
      { tipo: 'texto', texto: 'a', bold: true },
      { tipo: 'texto', texto: 'b', italics: true },
    ])
  })

  it('vira quebra de linha no <br>', () => {
    const [bloco] = htmlParaBlocos('<p>Linha um<br>Linha dois</p>')
    expect(bloco.pecas).toEqual([
      { tipo: 'texto', texto: 'Linha um' },
      { tipo: 'quebra' },
      { tipo: 'texto', texto: 'Linha dois' },
    ])
  })

  it('decodifica entidades', () => {
    const [bloco] = htmlParaBlocos('<p>Hipoteca &amp; penhora &mdash; art. 1.473 &#167;2&ordm;</p>')
    expect(txt(bloco)).toBe('Hipoteca & penhora — art. 1.473 §2º')
  })

  it('converte lista não ordenada', () => {
    const blocos = htmlParaBlocos('<ul><li>Um</li><li>Dois</li></ul>')
    expect(blocos).toHaveLength(2)
    expect(blocos.every((b) => b.tipo === 'item')).toBe(true)
    expect(blocos.map((b) => (b as any).ordenada)).toEqual([false, false])
    expect(blocos.map((b) => (b as any).nivel)).toEqual([0, 0])
    expect(blocos.map(txt)).toEqual(['Um', 'Dois'])
  })

  it('distingue lista ordenada', () => {
    const blocos = htmlParaBlocos('<ol><li>Primeiro</li></ol>')
    expect((blocos[0] as any).ordenada).toBe(true)
  })

  it('preserva formatação dentro do item', () => {
    const [item] = htmlParaBlocos('<ul><li>Penhora <strong>ativa</strong></li></ul>')
    expect(item.pecas).toEqual([
      { tipo: 'texto', texto: 'Penhora ' },
      { tipo: 'texto', texto: 'ativa', bold: true },
    ])
  })

  it('aninha sublistas descendo de nível', () => {
    const blocos = htmlParaBlocos(
      '<ul><li>Pai<ul><li>Filho<ol><li>Neto</li></ol></li></ul></li><li>Tio</li></ul>',
    )
    expect(blocos.map((b) => [txt(b), (b as any).nivel, (b as any).ordenada])).toEqual([
      ['Pai', 0, false],
      ['Filho', 1, false],
      ['Neto', 2, true],
      ['Tio', 0, false],
    ])
  })

  it('achata aninhamento além de três níveis em vez de estourar', () => {
    const blocos = htmlParaBlocos(
      '<ul><li>a<ul><li>b<ul><li>c<ul><li>d</li></ul></li></ul></li></ul></li></ul>',
    )
    expect(blocos.map((b) => (b as any).nivel)).toEqual([0, 1, 2, 2])
  })

  it('não deixa o texto do item vazar para o parágrafo do pai', () => {
    const blocos = htmlParaBlocos('<p>Antes</p><ul><li>Item</li></ul><p>Depois</p>')
    expect(blocos.map((b) => [b.tipo, txt(b)])).toEqual([
      ['paragrafo', 'Antes'],
      ['item', 'Item'],
      ['paragrafo', 'Depois'],
    ])
  })

  it('trata cabeçalhos como título', () => {
    const blocos = htmlParaBlocos('<h3>Cadeia dominial</h3><p>corpo</p>')
    expect(blocos.map((b) => b.tipo)).toEqual(['titulo', 'paragrafo'])
  })

  it('recursa em bloco que contém bloco, sem juntar os parágrafos', () => {
    const blocos = htmlParaBlocos('<div><p>Um</p><p>Dois</p></div>')
    expect(blocos.map(txt)).toEqual(['Um', 'Dois'])
  })

  it('preserva o texto de tag fora da lista e descarta a marcação', () => {
    const [bloco] = htmlParaBlocos('<p>Valor <span class="x"><mark>relevante</mark></span></p>')
    expect(txt(bloco)).toBe('Valor relevante')
    expect(bloco.pecas.every((p) => p.tipo === 'quebra' || (!p.bold && !p.italics))).toBe(true)
  })

  it('descarta o CONTEÚDO de script e style, não só as tags', () => {
    const blocos = htmlParaBlocos(
      '<p>Antes</p><script>alert("xss")</script><style>.a{color:red}</style><p>Depois</p>',
    )
    const tudo = blocos.map(txt).join(' ')
    expect(tudo).toBe('Antes Depois')
    expect(tudo).not.toContain('alert')
    expect(tudo).not.toContain('color')
  })

  it('vira hiperlink só quando o destino é http(s)', () => {
    const [ok] = htmlParaBlocos('<p><a href="https://planalto.gov.br">Art. 1.245</a></p>')
    expect(ok.pecas).toEqual([
      { tipo: 'texto', texto: 'Art. 1.245', link: 'https://planalto.gov.br' },
    ])
  })

  it('não cria link para javascript: nem data:, mas mantém o texto', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd']) {
      const [bloco] = htmlParaBlocos(`<p><a href="${href}">clique</a></p>`)
      expect(bloco.pecas).toEqual([{ tipo: 'texto', texto: 'clique' }])
    }
  })

  it('sobrevive a HTML malformado', () => {
    expect(() => htmlParaBlocos('<p>aberto <strong>sem fechar')).not.toThrow()
    expect(htmlParaBlocos('<p>aberto <strong>sem fechar').map(txt).join('')).toContain('sem fechar')
  })
})

describe('htmlParaParagrafos', () => {
  it('produz um Paragraph do docx por bloco', () => {
    const paragrafos = htmlParaParagrafos('<p>a</p><ul><li>b</li></ul><h3>c</h3>')
    expect(paragrafos).toHaveLength(3)
    for (const p of paragrafos) expect(p.constructor.name).toBe('Paragraph')
  })

  it('não estoura com entrada vazia', () => {
    expect(htmlParaParagrafos('')).toEqual([])
  })
})

describe('htmlParaTexto', () => {
  it('achata para uma linha só, sem marcação', () => {
    expect(htmlParaTexto('<p>Um <strong>dois</strong></p><ul><li>três</li></ul>')).toBe(
      'Um dois três',
    )
  })

  it('ignora script', () => {
    expect(htmlParaTexto('<p>ok</p><script>roubar()</script>')).toBe('ok')
  })
})
