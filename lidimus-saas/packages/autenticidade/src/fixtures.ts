// Fixtures para os testes de `analisarPdf` e `veredito`.
//
// As seis amostras do plano (`tmp/`) são matrículas reais com dado pessoal —
// nunca guardadas aqui. O que este arquivo fixa são só os METADADOS extraídos
// delas (ver a tabela do plano, seção "O que as amostras provam"), montados em
// PDFs sintéticos mínimos que reproduzem exatamente o que `analisarPdf` olha:
// header, `/Info`, contagem de `/Type /Page` e os marcadores de trailer. Nada
// do conteúdo real do documento entra aqui.

export type OpcoesPdfDeTeste = {
  paginas: number
  creationDate?: string // formato PDF: D:YYYYMMDDHHMMSS+HH'mm'
  modDate?: string
  producer?: string
  /** Se falso, omite trailer/startxref/%%EOF — simula arquivo cortado. */
  comTrailer?: boolean
  /** Duplica o %%EOF e adiciona /Prev — simula update incremental. */
  comUpdateIncremental?: boolean
}

export function construirPdfDeTeste(opcoes: OpcoesPdfDeTeste): Buffer {
  const { paginas, creationDate, modDate, producer, comTrailer = true, comUpdateIncremental = false } = opcoes

  const paginasStr = Array.from({ length: paginas }, () => '/Type /Page').join(' ')

  const campos: string[] = []
  if (creationDate) campos.push(`/CreationDate (${creationDate})`)
  if (modDate) campos.push(`/ModDate (${modDate})`)
  if (producer) campos.push(`/Producer (${producer})`)
  const infoObj = `1 0 obj<<${campos.join(' ')}>>endobj`

  let corpo = `%PDF-1.4\n${paginasStr}\n${infoObj}\n`

  if (comUpdateIncremental) {
    corpo += 'startxref\n100\n%%EOF\n2 0 obj<</Prev 50>>endobj\n'
  }
  if (comTrailer) {
    corpo += 'trailer<<>>\nstartxref\n200\n%%EOF'
  }

  return Buffer.from(corpo, 'latin1')
}

// ─── As seis amostras, só com os metadados da tabela do plano ──────────────

/** Documento editado no iLovePDF: sem CreationDate, com ModDate. 3 páginas. */
export const FIXTURE_COWBOY = construirPdfDeTeste({
  paginas: 3,
  modDate: "D:20260608193835-03'00'",
  producer: 'iLovePDF',
})

/** Mesmo documento reprocessado 16 min depois, com uma página a mais. */
export const FIXTURE_COWBOY3 = construirPdfDeTeste({
  paginas: 4,
  modDate: "D:20260608195419-03'00'",
  producer: 'iLovePDF',
})

/** Ghostscript por cima de uma assinatura achatada — reimpressão, não edição. */
export const FIXTURE_MAIRINQUE = construirPdfDeTeste({
  paginas: 23,
  creationDate: "D:20251013132211-03'00'",
  modDate: "D:20251013132211-03'00'",
  producer: 'GPL Ghostscript 9.06 / Acrobat 25.1',
})

/** Impressora virtual do Windows — reimpressão comum e legítima. */
export const FIXTURE_229216 = construirPdfDeTeste({
  paginas: 7,
  creationDate: "D:20251017115524-03'00'",
  modDate: "D:20251017115524-03'00'",
  producer: 'Microsoft: Print To PDF',
})

export const FIXTURE_61601 = construirPdfDeTeste({
  paginas: 2,
  creationDate: "D:20251013140032-03'00'",
  modDate: "D:20251013140032-03'00'",
  producer: 'Microsoft: Print To PDF',
})

/** Arquivo sem xref/trailer/%%EOF — o `C:\tmp\matricula.pdf` do plano. */
export const FIXTURE_TRUNCADO = construirPdfDeTeste({ paginas: 1, comTrailer: false })
