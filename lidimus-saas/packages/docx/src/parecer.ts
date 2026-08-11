// Monta o parecer de matrícula em parágrafos do Word.
//
// A ordem e o conteúdo seguem a página do parecer (pages/matriculas/[id].vue) —
// não por gosto de simetria, mas porque as ressalvas daquela tela são o que
// impede o laudo de afirmar o que não pode. Um DOCX que as perca vira um
// documento mais confiante que a análise que o gerou. Cada uma delas está
// marcada abaixo com o comentário da regra.

import { AlignmentType, BorderStyle, HeadingLevel, ImageRun, Paragraph, Table, TextRun } from 'docx'
import { E, FILETE, TINTA_SUAVE, espaco } from './estilos.ts'
import { htmlParaParagrafos } from './html.ts'
import { riscoLabel } from './risco.ts'
import { p, tabelaCabecalhada, tabelaDados } from './tabelas.ts'

export type Documento = Record<string, any>

export type MetaParecer = {
  /** Data/hora de conclusão do job, já formatada em America/Sao_Paulo */
  emitidoEm?: string | null
  /** Nome do arquivo enviado — o parecer de lote precisa dele para se localizar */
  arquivoOriginal?: string | null
}

const NADA = '—'

function texto(valor: unknown): string | null {
  if (valor == null) return null
  const t = String(valor).trim()
  return t ? t : null
}

// ── Regra 6: data da certidão ────────────────────────────────────────────────
// Sem data de expedição ainda dá para dizer algo útil: a certidão é
// necessariamente posterior ao último ato que ela própria certifica.
export function rotuloCertidao(doc: Documento): string {
  const c = doc?.cabecalho?.certidao
  if (!c?.data) return c?.posterior_a ? `Posterior a ${c.posterior_a}` : 'Não identificada'
  return c.hora ? `${c.data} · ${c.hora}` : String(c.data)
}

// ── Regra 4: moeda como o documento a escreveu ───────────────────────────────
// "Cr$ 12.000.000" de 1966 não é "R$ 120.000,00". Converter inventa um número
// que não existe em documento nenhum. Laudos antigos não têm `valor_display`;
// para eles o real corrente segue sendo a leitura correta.
export function valorDoAto(a: Record<string, any>): string | null {
  if (a?.valor_display) return String(a.valor_display)
  if (!a?.valor) return null
  return `${a.moeda ?? 'R$'} ${a.valor}`
}

export function matriculaIncompleta(doc: Documento): boolean {
  return doc?.cabecalho?.matricula_incompleta === true
}

/** Nome de arquivo sugerido, sem extensão. */
export function nomeDoParecer(doc: Documento, jobId?: string): string {
  const numero = texto(doc?.cabecalho?.numero_matricula)
  const slug = numero
    ? numero
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\w.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
    : ''
  if (slug) return `relatorio-matricula-${slug}`
  return `relatorio-${(jobId ?? '').slice(0, 8) || 'matricula'}`
}

// ── Peças de montagem ────────────────────────────────────────────────────────

function h1(titulo: string, contagem?: number): Paragraph {
  return new Paragraph({
    style: E.h1,
    heading: HeadingLevel.HEADING_1,
    children: [
      new TextRun(titulo),
      ...(contagem == null
        ? []
        : [new TextRun({ text: `  (${contagem})`, bold: false, color: TINTA_SUAVE })]),
    ],
  })
}

const h2 = (titulo: string) =>
  new Paragraph({ style: E.h2, heading: HeadingLevel.HEADING_2, children: [new TextRun(titulo)] })

// ── Seções ───────────────────────────────────────────────────────────────────

function secaoTitulo(doc: Documento, meta: MetaParecer): (Paragraph | Table)[] {
  const cab = doc?.cabecalho ?? {}
  const incompleta = matriculaIncompleta(doc)
  const saida: (Paragraph | Table)[] = []

  saida.push(
    new Paragraph({
      style: E.titulo,
      children: [new TextRun(`Matrícula ${texto(cab.numero_matricula) ?? NADA}`)],
    }),
  )

  const subtitulo = [texto(cab.cartorio), texto(cab.titulo)].filter(Boolean).join(' · ')
  if (subtitulo) saida.push(p(subtitulo, E.subtitulo))

  // ── Regra 7: o veredito sai em português, nunca o enum do pipeline ─────────
  // ── Regra 1: matrícula incompleta não recebe classificação de risco ───────
  if (!incompleta) {
    saida.push(
      new Paragraph({
        style: E.veredito,
        children: [new TextRun(riscoLabel(cab.classificacao_risco))],
      }),
    )
  }

  const dados: [string, string][] = [
    ['Documento', `Relatório técnico de matrícula${meta.arquivoOriginal ? ` · ${meta.arquivoOriginal}` : ''}`],
    ['Certidão', rotuloCertidao(doc)],
  ]
  if (meta.emitidoEm) dados.push(['Emitido em', meta.emitidoEm])
  if (texto(cab.data_abertura)) dados.push(['Abertura', String(cab.data_abertura)])
  if (texto(cab.livro_folha)) dados.push(['Livro / Folha', String(cab.livro_folha)])
  if (texto(cab.matricula_anterior)) dados.push(['Matrícula anterior', String(cab.matricula_anterior)])
  if (texto(cab.sql_iptu)) dados.push(['SQL / IPTU', String(cab.sql_iptu)])
  saida.push(tabelaDados(dados), p(''))

  return saida
}

// ── Regra 1: matrícula incompleta ────────────────────────────────────────────
// Vem antes de tudo. O leitor precisa saber que não há parecer antes de ler
// qualquer dado.
function secaoIncompleta(doc: Documento): (Paragraph | Table)[] {
  if (!matriculaIncompleta(doc)) return []
  const integridade = doc?.integridade ?? null
  const saida: (Paragraph | Table)[] = [
    new Paragraph({
      style: E.alerta,
      children: [new TextRun({ text: 'Matrícula incompleta — relatório técnico não emitido', bold: true })],
    }),
  ]

  const aviso = texto(doc?.cabecalho?.aviso_matricula_incompleta)
  if (aviso) saida.push(p(aviso, E.alerta))

  const dados: [string, string][] = []
  if (integridade?.paginas_declaradas) {
    dados.push(['Páginas', `${integridade.paginas_lidas ?? '?'} de ${integridade.paginas_declaradas}`])
  }
  if (integridade?.atos_faltantes?.length) {
    dados.push(['Atos ausentes', integridade.atos_faltantes.join(', ')])
  }
  if (integridade?.atos_apenas_citados?.length) {
    dados.push(['Citados, não transcritos', integridade.atos_apenas_citados.join(', ')])
  }
  if (dados.length) saida.push(tabelaDados(dados), p(''))

  saida.push(
    p(
      'O que fazer: solicitar ao cartório a certidão de inteiro teor. Não é falha de leitura do ' +
        'arquivo — são páginas que não constam do documento enviado, e reprocessá-lo não as traz.',
      E.alerta,
    ),
  )
  return saida
}

function secaoImovel(doc: Documento): (Paragraph | Table)[] {
  const imovel = doc?.imovel ?? {}
  const saida: (Paragraph | Table)[] = [h1('Imóvel')]

  saida.push(p(texto(imovel.endereco) ?? 'Endereço não identificado no documento.'))

  const dados: [string, string][] = []
  if (texto(imovel.area_total_display)) dados.push(['Área total', String(imovel.area_total_display)])
  if (texto(imovel.area_construida_display)) {
    dados.push(['Área construída', String(imovel.area_construida_display)])
  }
  if (texto(imovel.testada)) dados.push(['Testada', String(imovel.testada)])
  dados.push(['Ônus ativos', texto(imovel.tem_onus_display) ?? NADA])

  // ── Regra 5: confrontação sai como a matrícula a escreve ──────────────────
  // Sem rumo cardeal no documento, traduzir "de um lado" para Norte é inventar
  // o dado — e dado de divisa inventado vira retificação e georreferenciamento
  // errados.
  const confrontantes = imovel.confrontantes as Record<string, unknown> | undefined
  const temConfrontantes = confrontantes && Object.values(confrontantes).some(Boolean)
  const descricao = (imovel.confrontantes_descricao ?? []) as { lado: string; confrontante: string }[]

  if (temConfrontantes) {
    for (const [dir, lado] of Object.entries(confrontantes!)) {
      if (lado) dados.push([String(dir), String(lado)])
    }
  } else if (descricao.length) {
    for (const c of descricao) dados.push([c.lado, c.confrontante])
  }

  saida.push(tabelaDados(dados))

  if (!temConfrontantes && descricao.length) {
    saida.push(
      p(
        'A matrícula não indica rumo cardeal; as divisas são reproduzidas como constam do documento.',
        E.nota,
      ),
    )
  }
  return saida
}

// O croqui da tela é SVG, que o Word não lê. Só entra quando o pipeline
// disponibiliza a versão rasterizada (data_uri). Sem ela, a seção é omitida —
// melhor não ter croqui no DOCX que ter um retângulo quebrado.
function secaoCroqui(doc: Documento): (Paragraph | Table)[] {
  const croqui = doc?.croqui
  if (!croqui?.disponivel) return []
  const uri = texto(croqui.data_uri)
  const m = uri?.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/i)
  if (!m) return []

  let dados: Buffer
  try {
    dados = Buffer.from(m[2], 'base64')
  } catch {
    return []
  }
  if (!dados.length) return []

  const saida: (Paragraph | Table)[] = [h1('Croqui do terreno')]
  if (texto(croqui.precisao)) saida.push(p(`Precisão: ${croqui.precisao}`, E.nota))
  saida.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          data: dados,
          type: m[1].toLowerCase() === 'png' ? 'png' : m[1].toLowerCase() === 'gif' ? 'gif' : 'jpg',
          transformation: { width: 440, height: 330 },
        }),
      ],
    }),
  )
  return saida
}

function pessoa(pes: Record<string, any>, ordem: number): Paragraph[] {
  const saida: Paragraph[] = [
    new Paragraph({
      style: E.corpoCompacto,
      children: [new TextRun({ text: `${pes.ordem ?? ordem}. ${pes.nome ?? NADA}`, bold: true })],
    }),
  ]
  const linhas: string[] = []
  if (texto(pes.natureza)) linhas.push(String(pes.natureza))
  if (pes.documento_tipo && pes.documento_numero) {
    linhas.push(`${pes.documento_tipo} ${pes.documento_numero}`)
  }
  if (texto(pes.estado_civil)) {
    linhas.push(pes.regime_bens ? `${pes.estado_civil} — ${pes.regime_bens}` : String(pes.estado_civil))
  }
  if (texto(pes.ato_aquisitivo)) {
    const extra = [texto(pes.data_aquisicao), texto(pes.percentual)].filter(Boolean).join(' — ')
    linhas.push(`Adquirido em ${pes.ato_aquisitivo}${extra ? ` — ${extra}` : ''}`)
  }
  if (texto(pes.endereco_domicilio)) linhas.push(`Domicílio: ${pes.endereco_domicilio}`)
  if (texto(pes.observacao)) linhas.push(String(pes.observacao))

  for (const linha of linhas) saida.push(p(linha, E.corpoCompacto))
  saida.push(p('', E.corpoCompacto))
  return saida
}

function secaoProprietarios(doc: Documento): (Paragraph | Table)[] {
  const prop = doc?.proprietarios ?? {}
  const saida: (Paragraph | Table)[] = [h1('Proprietários atuais')]

  const lista = (prop.lista ?? []) as Record<string, any>[]
  if (lista.length) {
    lista.forEach((pes, i) => saida.push(...pessoa(pes, i + 1)))
  } else {
    saida.push(
      p(
        'Não foi possível identificar os proprietários automaticamente. Confira o documento original.',
        E.vazio,
      ),
    )
  }

  // ── Regra 3: título aquisitivo não lido ──────────────────────────────────
  // Titular sem título aquisitivo lido é indicação, não afirmação: é exatamente
  // o ponto em que o laudo não pode dizer "100%".
  if (prop.titulo_aquisitivo_lido === false) {
    saida.push(
      p(
        'O ato aquisitivo não consta das páginas analisadas. Os nomes acima são os indicados pelo ' +
          'documento recebido, e não confirmam a titularidade do domínio.',
        E.alerta,
      ),
    )
  }

  // Titulares de direitos registrados que NÃO são donos: promitente comprador,
  // cessionário. Separá-los evita confundi-los com o titular.
  const promissarios = (prop.promissarios?.lista ?? []) as Record<string, any>[]
  if (promissarios.length) {
    saida.push(h2('Promitentes compradores e cessionários'))
    saida.push(
      p('Titulares de direitos registrados sobre o imóvel — não são os proprietários.', E.nota),
    )
    promissarios.forEach((pes, i) => saida.push(...pessoa(pes, i + 1)))
  }

  return saida
}

// ── Regra 1 (continuação): o lugar do parecer ────────────────────────────────
// Em matrícula incompleta não há veredito a dar: o lugar do parecer é ocupado
// pela razão de não haver parecer.
function secaoParecer(doc: Documento): (Paragraph | Table)[] {
  const saida: (Paragraph | Table)[] = [h1('Conclusão técnica')]

  if (matriculaIncompleta(doc)) {
    saida.push(
      p(
        'Não emitida. A certidão analisada está incompleta, e concluir sobre propriedade, ônus ou ' +
          'cadeia dominial exigiria o documento inteiro. As seções seguintes trazem apenas os dados ' +
          'que constam das páginas recebidas.',
      ),
    )
    return saida
  }

  saida.push(
    new Paragraph({
      style: E.veredito,
      children: [new TextRun(riscoLabel(doc?.parecer?.classificacao_risco))],
    }),
  )

  const corpo = texto(doc?.parecer?.texto)
  saida.push(corpo ? p(corpo) : p('Conclusão não disponível para esta análise.', E.vazio))
  return saida
}

// ── Regra 1 (continuação): análise suprimida em matrícula incompleta ─────────
// Exceto as inconsistências, que são justamente o inventário das lacunas.
function secaoAnalise(doc: Documento): (Paragraph | Table)[] {
  const analise = doc?.analise_juridica ?? {}
  const incompleta = matriculaIncompleta(doc)
  const saida: (Paragraph | Table)[] = [h1(incompleta ? 'Lacunas do documento' : 'Análise jurídica')]

  const antes = saida.length

  if (!incompleta && texto(analise.resumo_executivo)) {
    saida.push(h2('Resumo executivo'), p(String(analise.resumo_executivo)))
  }

  const bloco = (titulo: string, html: unknown) => {
    const paragrafos = htmlParaParagrafos(html)
    if (!paragrafos.length) return
    saida.push(h2(titulo), ...paragrafos)
  }

  if (!incompleta) bloco('Riscos', analise.riscos_html)
  bloco('Inconsistências', analise.inconsistencias_html)
  if (!incompleta) {
    bloco('Possíveis problemas', analise.problemas_html)
    bloco('Cadeia dominial', analise.cadeia_dominial_html)
    bloco('Fundamentação legal', analise.fundamentacao_html)
  }

  // Seção sem nenhum conteúdo é um título órfão no meio do laudo
  if (saida.length === antes) return []
  return saida
}

function secaoAtos(doc: Documento): (Paragraph | Table)[] {
  const atos = doc?.historico_atos ?? {}
  const lista = (atos.lista ?? []) as Record<string, any>[]
  const saida: (Paragraph | Table)[] = [h1('Histórico de atos', atos.total ?? lista.length)]

  if (!lista.length) {
    saida.push(p('Nenhum ato registrado.', E.vazio))
    return saida
  }

  saida.push(
    tabelaCabecalhada(
      ['Seq.', 'Ato', 'Partes', 'Valor', 'Data'],
      lista.map((a) => {
        const rotulo = [
          texto(a.tipo_label) ?? NADA,
          a.status === 'cancelado' ? '[CANCELADO]' : '',
          texto(a.cancelado_por) ? `(cancelado por ${a.cancelado_por})` : '',
        ]
          .filter(Boolean)
          .join(' ')
        return [
          texto(a.sequencia) ?? NADA,
          rotulo,
          texto(a.partes) ?? NADA,
          valorDoAto(a) ?? NADA,
          texto(a.data) ?? NADA,
        ]
      }),
      [8, 26, 38, 16, 12],
    ),
  )
  return saida
}

function secaoOnus(doc: Documento): (Paragraph | Table)[] {
  const onus = doc?.onus ?? {}
  const ativos = (onus.ativos ?? []) as Record<string, any>[]
  const incompleta = matriculaIncompleta(doc)
  const saida: (Paragraph | Table)[] = [h1('Ônus e gravames ativos', onus.total ?? ativos.length)]

  // ── Regra 2: em documento incompleto a lista não é exaustiva ─────────────
  if (incompleta) {
    saida.push(
      p(
        'Lista não exaustiva: cobre apenas os atos das páginas recebidas. Gravames registrados nas ' +
          'páginas ausentes não aparecem aqui.',
        E.alerta,
      ),
    )
  }

  if (ativos.length) {
    saida.push(
      tabelaCabecalhada(
        ['Seq.', 'Gravame', 'Partes', 'Valor', 'Data'],
        ativos.map((o) => [
          texto(o.sequencia) ?? NADA,
          texto(o.tipo_label) ?? NADA,
          texto(o.partes) ?? NADA,
          valorDoAto(o) ?? NADA,
          texto(o.data) ?? NADA,
        ]),
        [8, 26, 38, 16, 12],
      ),
    )
    return saida
  }

  // ── Regra 2 (continuação) ────────────────────────────────────────────────
  // "Nenhum ônus" só é notícia boa quando o documento inteiro foi lido. Em
  // matrícula incompleta, o que há é ausência de informação.
  saida.push(
    incompleta
      ? p('Nenhum ônus nos atos lidos — o que não significa que o imóvel esteja livre.', E.vazio)
      : p('Nenhum ônus ativo identificado.'),
  )
  return saida
}

// ── Regra 8: rodapé de isenção ───────────────────────────────────────────────
function rodapeDoParecer(doc: Documento): (Paragraph | Table)[] {
  const meta = doc?.metadados ?? {}
  const saida: (Paragraph | Table)[] = []
  const avisos = (meta.validacao?.avisos ?? []) as string[]

  if (avisos.length) {
    saida.push(h2('Avisos da extração'))
    for (const aviso of avisos) saida.push(p(`• ${aviso}`, E.nota))
  }

  saida.push(
    new Paragraph({
      style: E.rodape,
      spacing: { before: espaco(14) },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: FILETE, space: 8 } },
      children: [
        new TextRun(
          [
            texto(meta.data_extracao) ? `Extraído em ${meta.data_extracao}` : null,
            meta.total_paginas ? `${meta.total_paginas} página(s) analisada(s)` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
      ],
    }),
  )
  saida.push(
    p(
      'Documento gerado automaticamente pela Lidimus. É uma ferramenta de apoio e não substitui a ' +
        'certidão oficial do cartório nem o parecer de profissional habilitado.',
      E.rodape,
    ),
  )
  return saida
}

/**
 * O parecer inteiro, na ordem da tela. Devolve os filhos de uma seção do
 * documento — quem chama decide se vira arquivo único ou entra num lote.
 */
export function corpoDoParecer(doc: Documento, meta: MetaParecer = {}): (Paragraph | Table)[] {
  return [
    ...secaoTitulo(doc, meta),
    ...secaoIncompleta(doc),
    ...secaoImovel(doc),
    ...secaoCroqui(doc),
    ...secaoProprietarios(doc),
    ...secaoParecer(doc),
    ...secaoAnalise(doc),
    ...secaoAtos(doc),
    ...secaoOnus(doc),
    ...rodapeDoParecer(doc),
  ]
}
