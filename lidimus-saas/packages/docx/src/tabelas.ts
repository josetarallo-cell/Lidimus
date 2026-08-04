// Tabelas do documento. São de verdade — tabela do Word, com cabeçalho que
// repete ao virar a página e célula que o cliente pode editar. A tela usa
// <dl>/<ol> para as mesmas informações; aqui o equivalente editável é a tabela.

import { BorderStyle, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import { E, FILETE, FUNDO_SUAVE, espaco } from './estilos.ts'

// `style: string` e não o literal inferido de E.corpo: o parâmetro recebe
// qualquer estilo da folha, e o default não deve estreitar o tipo.
export const p = (text: string, style: string = E.corpo) =>
  new Paragraph({ style, children: [new TextRun(text)] })

const fino = { style: BorderStyle.SINGLE, size: 2, color: FILETE }
const nenhuma = { style: BorderStyle.NONE, size: 0, color: 'auto' }

/** Rótulo → valor: o equivalente editável do `meta-grid` da tela. */
export function tabelaDados(linhas: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: fino,
      bottom: fino,
      left: nenhuma,
      right: nenhuma,
      insideHorizontal: fino,
      insideVertical: nenhuma,
    },
    rows: linhas.map(
      ([rotulo, valor]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              margins: { top: espaco(3), bottom: espaco(3), right: espaco(6) },
              children: [p(rotulo, E.rotulo)],
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              margins: { top: espaco(3), bottom: espaco(3) },
              children: [p(valor, E.corpoCompacto)],
            }),
          ],
        }),
    ),
  })
}

function celula(conteudo: string, largura: number, estilo: string, sombreado = false) {
  return new TableCell({
    width: { size: largura, type: WidthType.PERCENTAGE },
    margins: { top: espaco(3), bottom: espaco(3), left: espaco(4), right: espaco(4) },
    ...(sombreado ? { shading: { fill: FUNDO_SUAVE } } : {}),
    children: [p(conteudo, estilo)],
  })
}

export function tabelaCabecalhada(
  cabecalho: string[],
  linhas: string[][],
  larguras: number[],
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: fino,
      bottom: fino,
      left: fino,
      right: fino,
      insideHorizontal: fino,
      insideVertical: fino,
    },
    rows: [
      new TableRow({
        // Lote longo vira tabela de várias páginas; sem isto o leitor perde a
        // referência das colunas na segunda.
        tableHeader: true,
        children: cabecalho.map((c, i) => celula(c, larguras[i], E.rotulo, true)),
      }),
      ...linhas.map(
        (linha) =>
          new TableRow({ children: linha.map((c, i) => celula(c, larguras[i], E.corpoCompacto)) }),
      ),
    ],
  })
}

/** Índice da capa do lote: arquivo · nº da matrícula · situação. */
export function tabelaIndice(linhas: string[][]): Table {
  return tabelaCabecalhada(['Arquivo', 'Nº da matrícula', 'Situação'], linhas, [46, 20, 34])
}
