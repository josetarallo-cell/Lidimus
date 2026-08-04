// Folha de estilos do DOCX.
//
// O arquivo exportado é feito para ser EDITADO no Word, não para imitar a tela:
// nada de guilhoché, folha verde ou carimbo colorido. Em troca, tudo é estilo
// nativo — quem abrir o arquivo pode trocar a fonte do documento inteiro num
// clique, e um trecho colado numa petição chega como parágrafo de verdade.
//
// Calibri/Cambria acompanham o Word em qualquer instalação. Fonte da marca
// (Archivo, Besley) não: cairia numa substituição feia na máquina do cliente.

import { AlignmentType, BorderStyle, LevelFormat, convertInchesToTwip } from 'docx'
import type { INumberingOptions, IStylesOptions } from 'docx'

// docx mede fonte em meio-ponto e espaço em twips (1/20 de ponto)
export const pt = (n: number) => Math.round(n * 2)
export const espaco = (n: number) => Math.round(n * 20)

export const FONTE_TITULO = 'Calibri'
export const FONTE_CORPO = 'Cambria'

// Escala de cinzas — o único destaque cromático do documento é o preto do texto.
// Risco não vira cor aqui: vira palavra ("Risco alto"), que sobrevive a
// fotocópia, a leitor de tela e a colagem em outro documento.
export const TINTA = '1A1A1A'
export const TINTA_SUAVE = '5A5A5A'
export const FILETE = 'C8C8C8'
export const FUNDO_SUAVE = 'F2F2F2'

// Identificadores usados pelo construtor do parecer
export const E = {
  titulo: 'LdTitulo',
  subtitulo: 'LdSubtitulo',
  h1: 'Heading1',
  h2: 'Heading2',
  h3: 'Heading3',
  corpo: 'LdCorpo',
  corpoCompacto: 'LdCorpoCompacto',
  nota: 'LdNota',
  alerta: 'LdAlerta',
  rotulo: 'LdRotulo',
  vazio: 'LdVazio',
  veredito: 'LdVeredito',
  rodape: 'LdRodape',
  capaTitulo: 'LdCapaTitulo',
} as const

export const LISTA_BULLET = 'ld-lista-bullet'
export const LISTA_NUMERO = 'ld-lista-numero'

export const estilos: IStylesOptions = {
  default: {
    document: {
      run: { font: FONTE_CORPO, size: pt(10.5), color: TINTA },
      paragraph: { spacing: { after: espaco(6), line: 276 } },
    },
  },
  paragraphStyles: [
    {
      id: E.titulo,
      name: 'Lidimus Titulo',
      basedOn: 'Normal',
      next: E.subtitulo,
      quickFormat: true,
      run: { font: FONTE_TITULO, size: pt(22), bold: true, color: TINTA },
      paragraph: { spacing: { before: espaco(0), after: espaco(2) } },
    },
    {
      id: E.subtitulo,
      name: 'Lidimus Subtitulo',
      basedOn: 'Normal',
      next: E.corpo,
      run: { font: FONTE_TITULO, size: pt(11), color: TINTA_SUAVE },
      paragraph: { spacing: { after: espaco(10) } },
    },
    {
      id: E.capaTitulo,
      name: 'Lidimus Capa Titulo',
      basedOn: 'Normal',
      next: E.corpo,
      run: { font: FONTE_TITULO, size: pt(28), bold: true, color: TINTA },
      paragraph: { alignment: AlignmentType.CENTER, spacing: { before: espaco(120), after: espaco(8) } },
    },
    // Os três níveis de cabeçalho são os built-in do Word: assim o painel de
    // navegação e o sumário automático funcionam sem o cliente configurar nada.
    {
      id: E.h1,
      name: 'Heading 1',
      basedOn: 'Normal',
      next: E.corpo,
      quickFormat: true,
      run: { font: FONTE_TITULO, size: pt(15), bold: true, color: TINTA },
      paragraph: {
        spacing: { before: espaco(20), after: espaco(6) },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: FILETE, space: 4 } },
        keepNext: true,
      },
    },
    {
      id: E.h2,
      name: 'Heading 2',
      basedOn: 'Normal',
      next: E.corpo,
      quickFormat: true,
      run: { font: FONTE_TITULO, size: pt(12), bold: true, color: TINTA },
      paragraph: { spacing: { before: espaco(12), after: espaco(4) }, keepNext: true },
    },
    {
      id: E.h3,
      name: 'Heading 3',
      basedOn: 'Normal',
      next: E.corpo,
      quickFormat: true,
      run: { font: FONTE_TITULO, size: pt(10.5), bold: true, color: TINTA_SUAVE },
      paragraph: { spacing: { before: espaco(10), after: espaco(3) }, keepNext: true },
    },
    {
      id: E.corpo,
      name: 'Lidimus Corpo',
      basedOn: 'Normal',
      next: E.corpo,
      quickFormat: true,
      paragraph: { alignment: AlignmentType.JUSTIFIED, spacing: { after: espaco(6) } },
    },
    {
      id: E.corpoCompacto,
      name: 'Lidimus Corpo Compacto',
      basedOn: 'Normal',
      next: E.corpo,
      paragraph: { spacing: { after: espaco(1) } },
    },
    {
      id: E.nota,
      name: 'Lidimus Nota',
      basedOn: 'Normal',
      next: E.corpo,
      run: { size: pt(9), color: TINTA_SUAVE, italics: true },
      paragraph: { spacing: { before: espaco(3), after: espaco(6) } },
    },
    // Ressalvas que mudam a leitura do laudo (matrícula incompleta, titularidade
    // não confirmada). Não são nota de rodapé: são condição de validade.
    {
      id: E.alerta,
      name: 'Lidimus Alerta',
      basedOn: 'Normal',
      next: E.corpo,
      run: { size: pt(10), bold: false },
      paragraph: {
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: espaco(4), after: espaco(4) },
        indent: { left: espaco(10) },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: TINTA, space: 8 } },
      },
    },
    {
      id: E.rotulo,
      name: 'Lidimus Rotulo',
      basedOn: 'Normal',
      next: E.corpo,
      run: { font: FONTE_TITULO, size: pt(8.5), bold: true, color: TINTA_SUAVE, allCaps: true },
      paragraph: { spacing: { after: espaco(0) } },
    },
    {
      id: E.vazio,
      name: 'Lidimus Vazio',
      basedOn: 'Normal',
      next: E.corpo,
      run: { italics: true, color: TINTA_SUAVE },
      paragraph: { spacing: { after: espaco(6) } },
    },
    {
      id: E.veredito,
      name: 'Lidimus Veredito',
      basedOn: 'Normal',
      next: E.corpo,
      run: { font: FONTE_TITULO, size: pt(13), bold: true, allCaps: true },
      paragraph: { spacing: { before: espaco(2), after: espaco(8) } },
    },
    {
      id: E.rodape,
      name: 'Lidimus Rodape',
      basedOn: 'Normal',
      next: E.rodape,
      run: { size: pt(8.5), color: TINTA_SUAVE },
      paragraph: { alignment: AlignmentType.JUSTIFIED, spacing: { after: espaco(3) } },
    },
  ],
}

// Três níveis bastam: a prosa do parecer não aninha mais que isso, e o
// conversor de HTML achata o que passar disso no último nível.
const recuo = (nivel: number) => ({
  indent: { left: convertInchesToTwip(0.25 + nivel * 0.25), hanging: convertInchesToTwip(0.2) },
})

export const numeracao: INumberingOptions = {
  config: [
    {
      reference: LISTA_BULLET,
      levels: [0, 1, 2].map((level) => ({
        level,
        format: LevelFormat.BULLET,
        text: ['•', '◦', '▪'][level],
        alignment: AlignmentType.LEFT,
        style: { paragraph: recuo(level) },
      })),
    },
    {
      reference: LISTA_NUMERO,
      levels: [0, 1, 2].map((level) => ({
        level,
        format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level],
        text: [`%1.`, `%2.`, `%3.`][level],
        alignment: AlignmentType.LEFT,
        style: { paragraph: recuo(level) },
      })),
    },
  ],
}

export const MARGEM_PAGINA = {
  top: convertInchesToTwip(0.9),
  right: convertInchesToTwip(0.8),
  bottom: convertInchesToTwip(0.9),
  left: convertInchesToTwip(0.8),
}
