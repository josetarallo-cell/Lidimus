// Converte a prosa em HTML do parecer (analise_juridica.*_html) em parágrafos
// do Word.
//
// O HTML aqui vem do LLM, que processa texto controlado pelo cliente — a mesma
// razão pela qual a tela passa tudo por DOMPurify antes de renderizar. Aqui a
// sanitização é a própria conversão: nada de HTML atravessa. Só as tags da
// lista abaixo viram formatação; qualquer outra tem o texto preservado e a
// marcação descartada. Tag desconhecida não é erro — é texto.
//
// A exceção são <script>/<style> e afins: nesses o conteúdo textual TAMBÉM é
// descartado, senão o código-fonte apareceria como prosa dentro do laudo.
//
// A conversão passa por uma representação intermediária (Bloco/Peca) em vez de
// montar objetos do docx direto. Assim o teste afere o que a conversão entendeu
// do HTML sem depender do formato interno da biblioteca.

import { ExternalHyperlink, Paragraph, TextRun } from 'docx'
import { NodeType, parse } from 'node-html-parser'
import type { HTMLElement as NoParserElement, Node as NoParserNode } from 'node-html-parser'
import { E, LISTA_BULLET, LISTA_NUMERO } from './estilos.ts'

/** Trecho de texto já formatado, ou uma quebra de linha dentro do parágrafo. */
export type Peca =
  | { tipo: 'texto'; texto: string; bold?: boolean; italics?: boolean; link?: string }
  | { tipo: 'quebra' }

export type Bloco =
  | { tipo: 'paragrafo'; pecas: Peca[] }
  | { tipo: 'titulo'; pecas: Peca[] }
  | { tipo: 'item'; pecas: Peca[]; ordenada: boolean; nivel: number }

type Formato = { bold?: boolean; italics?: boolean; link?: string }

const BLOCOS = new Set(['p', 'div', 'section', 'article', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const CABECALHOS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const LISTAS = new Set(['ul', 'ol'])
const MUDOS = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'svg'])

const NIVEL_MAX = 2

function tagDe(no: NoParserNode): string {
  return no.nodeType === NodeType.ELEMENT_NODE
    ? ((no as NoParserElement).rawTagName || '').toLowerCase()
    : ''
}

// HTML colapsa espaço em branco; o Word não. Sem normalizar, a indentação do
// HTML gerado vira buracos no meio das frases.
function normalizar(texto: string): string {
  return texto.replace(/\s+/g, ' ')
}

function temTexto(pecas: Peca[]): boolean {
  return pecas.some((p) => p.tipo === 'texto' && p.texto.trim() !== '')
}

// Um parágrafo não deve começar nem terminar com o espaço herdado da
// indentação do HTML
function aparar(pecas: Peca[]): Peca[] {
  const saida = [...pecas]
  const branco = (p: Peca | undefined) => p?.tipo === 'texto' && p.texto.trim() === ''
  while (branco(saida[0])) saida.shift()
  while (branco(saida[saida.length - 1])) saida.pop()
  if (saida[0]?.tipo === 'texto') saida[0] = { ...saida[0], texto: saida[0].texto.replace(/^ +/, '') }
  const ultimo = saida[saida.length - 1]
  if (ultimo?.tipo === 'texto') {
    saida[saida.length - 1] = { ...ultimo, texto: ultimo.texto.replace(/ +$/, '') }
  }
  return saida
}

/** Junta o texto formatado dos filhos de um nó, sem quebrar parágrafo. */
function pecasDe(no: NoParserNode, fmt: Formato, pularListas = false): Peca[] {
  const pecas: Peca[] = []

  for (const filho of no.childNodes) {
    if (filho.nodeType === NodeType.TEXT_NODE) {
      const texto = normalizar(filho.text)
      if (texto) pecas.push({ tipo: 'texto', texto, ...fmt })
      continue
    }
    if (filho.nodeType !== NodeType.ELEMENT_NODE) continue

    const tag = tagDe(filho)
    const el = filho as NoParserElement

    if (MUDOS.has(tag)) continue
    if (pularListas && LISTAS.has(tag)) continue

    switch (tag) {
      case 'br':
        pecas.push({ tipo: 'quebra' })
        break
      case 'strong':
      case 'b':
        pecas.push(...pecasDe(el, { ...fmt, bold: true }, pularListas))
        break
      case 'em':
      case 'i':
        pecas.push(...pecasDe(el, { ...fmt, italics: true }, pularListas))
        break
      case 'a': {
        const href = el.getAttribute('href')
        // Só vira hiperlink se o destino for http(s): javascript: e data: não
        // têm lugar num documento, e o Word os abriria.
        const link = href && /^https?:\/\//i.test(href) ? href : undefined
        pecas.push(...pecasDe(el, { ...fmt, ...(link ? { link } : {}) }, pularListas))
        break
      }
      default:
        // Tag fora da lista: perde a marcação, mantém o texto
        pecas.push(...pecasDe(el, fmt, pularListas))
    }
  }

  return pecas
}

function lista(el: NoParserElement, ordenada: boolean, nivel: number, saida: Bloco[]): void {
  for (const filho of el.childNodes) {
    if (tagDe(filho) !== 'li') continue
    const li = filho as NoParserElement

    const pecas = aparar(pecasDe(li, {}, true))
    if (temTexto(pecas)) {
      saida.push({ tipo: 'item', pecas, ordenada, nivel: Math.min(nivel, NIVEL_MAX) })
    }

    // Sublista: um nível abaixo, até o teto de três níveis
    for (const neto of li.childNodes) {
      const tagNeto = tagDe(neto)
      if (LISTAS.has(tagNeto)) {
        lista(neto as NoParserElement, tagNeto === 'ol', nivel + 1, saida)
      }
    }
  }
}

function percorrer(no: NoParserNode, saida: Bloco[]): void {
  let acumulado: Peca[] = []

  const descarregar = () => {
    const pecas = aparar(acumulado)
    acumulado = []
    if (temTexto(pecas)) saida.push({ tipo: 'paragrafo', pecas })
  }

  for (const filho of no.childNodes) {
    if (filho.nodeType === NodeType.TEXT_NODE) {
      const texto = normalizar(filho.text)
      if (texto) acumulado.push({ tipo: 'texto', texto })
      continue
    }
    if (filho.nodeType !== NodeType.ELEMENT_NODE) continue

    const tag = tagDe(filho)
    const el = filho as NoParserElement

    if (MUDOS.has(tag)) continue

    if (LISTAS.has(tag)) {
      descarregar()
      lista(el, tag === 'ol', 0, saida)
      continue
    }

    if (CABECALHOS.has(tag)) {
      descarregar()
      const pecas = aparar(pecasDe(el, {}))
      if (temTexto(pecas)) saida.push({ tipo: 'titulo', pecas })
      continue
    }

    if (BLOCOS.has(tag)) {
      descarregar()
      // Bloco que contém outro bloco (div > p) é recursão, não parágrafo:
      // achatar aqui juntaria num parágrafo só os parágrafos de dentro.
      if (el.childNodes.some((n) => BLOCOS.has(tagDe(n)) || LISTAS.has(tagDe(n)))) {
        percorrer(el, saida)
      } else {
        const pecas = aparar(pecasDe(el, {}))
        if (temTexto(pecas)) saida.push({ tipo: 'paragrafo', pecas })
      }
      continue
    }

    if (tag === 'br') {
      acumulado.push({ tipo: 'quebra' })
      continue
    }
    // Inline solto entre blocos: acumula até o próximo bloco fechar
    acumulado.push(...pecasDe(el, {}))
  }

  descarregar()
}

/** HTML → blocos. Exposto para teste; a conversão para Word usa o de baixo. */
export function htmlParaBlocos(html: unknown): Bloco[] {
  if (html == null) return []
  const bruto = String(html).trim()
  if (!bruto) return []
  const saida: Bloco[] = []
  percorrer(parse(bruto), saida)
  return saida
}

function pecasParaRuns(pecas: Peca[]): (TextRun | ExternalHyperlink)[] {
  return pecas.map((p) => {
    if (p.tipo === 'quebra') return new TextRun({ text: '', break: 1 })
    const run = new TextRun({
      text: p.texto,
      bold: p.bold,
      italics: p.italics,
      ...(p.link ? { style: 'Hyperlink' } : {}),
    })
    return p.link ? new ExternalHyperlink({ link: p.link, children: [run] }) : run
  })
}

/**
 * Converte um trecho de HTML do parecer em parágrafos do Word.
 * Devolve lista vazia para entrada nula, vazia ou sem texto.
 */
export function htmlParaParagrafos(html: unknown, estiloCorpo: string = E.corpo): Paragraph[] {
  return htmlParaBlocos(html).map((bloco) => {
    const children = pecasParaRuns(bloco.pecas)
    if (bloco.tipo === 'titulo') return new Paragraph({ style: E.h3, children })
    if (bloco.tipo === 'item') {
      return new Paragraph({
        style: E.corpoCompacto,
        numbering: {
          reference: bloco.ordenada ? LISTA_NUMERO : LISTA_BULLET,
          level: bloco.nivel,
        },
        children,
      })
    }
    return new Paragraph({ style: estiloCorpo, children })
  })
}

/** Mesmo tratamento, mas devolvendo só o texto — para índices e resumos. */
export function htmlParaTexto(html: unknown): string {
  return htmlParaBlocos(html)
    .map((b) => b.pecas.map((p) => (p.tipo === 'texto' ? p.texto : ' ')).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
