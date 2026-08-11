// Exportação do parecer de matrícula em .docx.
//
// O botão "Exportar PDF" da tela chama window.print(): produz um papel — bonito
// de arquivar, impossível de editar. Este módulo produz a outra metade: um
// documento do Word com estilos nativos, feito para ser aberto, ajustado e ter
// trechos colados numa petição.
//
// Nada de LLM aqui: a entrada é o JSON que o pipeline já montou, e a conversão
// é código determinístico e testável — pelo mesmo motivo de @lidimus/croqui.

import {
  Document,
  Header,
  Footer,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TextRun,
  AlignmentType,
} from 'docx'
import { E, MARGEM_PAGINA, TINTA_SUAVE, estilos, numeracao, pt } from './estilos.ts'
import { corpoDoParecer, matriculaIncompleta, nomeDoParecer } from './parecer.ts'
import type { Documento, MetaParecer } from './parecer.ts'
import { riscoLabel } from './risco.ts'
import { tabelaIndice } from './tabelas.ts'

export type { Documento, MetaParecer } from './parecer.ts'
export type { NivelRisco } from './risco.ts'
export { nivelRisco, riscoLabel, LABEL_POR_NIVEL } from './risco.ts'
export { corpoDoParecer, matriculaIncompleta, nomeDoParecer, rotuloCertidao, valorDoAto } from './parecer.ts'
export { htmlParaBlocos, htmlParaParagrafos, htmlParaTexto } from './html.ts'

const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const DOCX_MIME = MIME

function rodapePaginado(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES],
            size: pt(8.5),
            color: TINTA_SUAVE,
          }),
        ],
      }),
    ],
  })
}

function cabecalhoCorrido(rotulo: string): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: rotulo, size: pt(8.5), color: TINTA_SUAVE })],
      }),
    ],
  })
}

function documentoBase(secoes: {
  children: (Paragraph | Table)[]
  headers?: { default: Header }
}[]): Document {
  return new Document({
    styles: estilos,
    numbering: numeracao,
    sections: secoes.map((s) => ({
      properties: { page: { margin: MARGEM_PAGINA } },
      headers: s.headers,
      footers: { default: rodapePaginado() },
      children: s.children,
    })),
  })
}

/** Um parecer de matrícula em .docx. */
export async function pareceMatriculaDocx(
  doc: Documento,
  meta: MetaParecer = {},
): Promise<Buffer> {
  const numero = doc?.cabecalho?.numero_matricula
  const documento = documentoBase([
    {
      children: corpoDoParecer(doc, meta),
      headers: { default: cabecalhoCorrido(`Relatório técnico de matrícula${numero ? ` · MAT ${numero}` : ''}`) },
    },
  ])
  return Packer.toBuffer(documento)
}

// ── Lote ─────────────────────────────────────────────────────────────────────

export type ItemDoLote = {
  id: string
  status: string
  arquivoOriginal?: string | null
  emitidoEm?: string | null
  documento?: Documento | null
}

export type MetaLote = {
  loteId: string
  enviadoEm?: string | null
}

/**
 * O lote inteiro num arquivo só: capa com o índice do envio e, em seguida, um
 * parecer por página. Análises que não concluíram aparecem no índice com o
 * motivo — sumir com elas faria o arquivo parecer completo quando não é.
 */
export async function loteMatriculasDocx(itens: ItemDoLote[], meta: MetaLote): Promise<Buffer> {
  const prontos = itens.filter((i) => i.status === 'done' && i.documento)

  const capa: (Paragraph | Table)[] = [
    new Paragraph({ style: E.capaTitulo, children: [new TextRun('Relatórios técnicos de matrícula')] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      style: E.subtitulo,
      children: [
        new TextRun(
          [
            `${prontos.length} de ${itens.length} análise(s) concluída(s)`,
            meta.enviadoEm ? `enviado em ${meta.enviadoEm}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
      ],
    }),
    new Paragraph({ style: E.corpo, children: [] }),
    ...indiceDoLote(itens),
  ]

  if (!prontos.length) {
    capa.push(
      new Paragraph({
        style: E.vazio,
        children: [new TextRun('Nenhuma análise deste lote foi concluída — não há relatório a exportar.')],
      }),
    )
  }

  const secoes: { children: (Paragraph | Table)[]; headers?: { default: Header } }[] = [
    { children: capa, headers: { default: cabecalhoCorrido(`Lote de matrículas`) } },
  ]

  for (const item of prontos) {
    const numero = item.documento?.cabecalho?.numero_matricula
    secoes.push({
      children: corpoDoParecer(item.documento!, {
        emitidoEm: item.emitidoEm,
        arquivoOriginal: item.arquivoOriginal,
      }),
      headers: {
        default: cabecalhoCorrido(`Relatório técnico de matrícula${numero ? ` · MAT ${numero}` : ''}`),
      },
    })
  }

  return Packer.toBuffer(documentoBase(secoes))
}

function indiceDoLote(itens: ItemDoLote[]): (Paragraph | Table)[] {
  const linhas = itens.map((item) => {
    const doc = item.documento
    const numero = doc?.cabecalho?.numero_matricula
    let situacao: string
    if (item.status === 'error') situacao = 'Não concluída — falhou'
    else if (item.status !== 'done') situacao = 'Não concluída — em processamento'
    else if (!doc) situacao = 'Não concluída — sem relatório'
    // Regras 1 e 7: incompleta não tem risco; risco sai sempre em português
    else if (matriculaIncompleta(doc)) situacao = 'Matrícula incompleta — relatório não emitido'
    else situacao = riscoLabel(doc.cabecalho?.classificacao_risco)

    return [item.arquivoOriginal || '—', numero ? String(numero) : '—', situacao]
  })

  return [tabelaIndice(linhas)]
}

export function nomeDoArquivoParecer(doc: Documento, jobId?: string): string {
  return `${nomeDoParecer(doc, jobId)}.docx`
}

export function nomeDoArquivoLote(enviadoEm?: string | null): string {
  const data = (enviadoEm ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
  const sufixo = data ? `-${data[3]}-${data[2]}-${data[1]}` : ''
  return `lote-matriculas${sufixo}.docx`
}
