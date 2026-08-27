// Perícia do arquivo PDF — §1 do plano. Sem rede, sem dependência de imagem:
// só os bytes do PDF, lidos como o próprio formato define (`/Info`, XMP,
// trailer). O parser de `/Info` é portado do nó "Check PDF Metadata" de
// `n8n/PDF Report Analyzer.json` (findInfoBlock/extractPDFValue/
// decodePDFLiteral/decodeUtf16IfBom/parsePDFDate) em vez de reescrito — ali já
// tratava literal `(...)`, hex `<...>` e UTF-16BE com BOM.
//
// A calibragem dos indícios segue a leitura das seis amostras reais do plano:
// `produtor_rerender` e `sem_assinatura_digital` descrevem a maioria das
// matrículas legítimas (Ghostscript, Print To PDF) e por isso pesam médio ou
// informativo, nunca alto — sozinhos não podem produzir alarme. O caso que
// realmente importa, `criacao_ausente` (CreationDate ausente com ModDate
// presente — a assinatura do iLovePDF e ferramentas parecidas), pesa alto.

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import type { CodigoIndicioArquivo, ContagensPdf, Indicio, InfoPdf, PericiaArquivo, XmpPdf } from './tipos.ts'

const exec = promisify(execFile)

// ─── Portado de n8n/PDF Report Analyzer.json, nó "Check PDF Metadata" ───────

function decodePdfLiteral(s: string): string {
  return s.replace(/\\([0-7]{1,3}|n|r|t|b|f|\(|\)|\\)/g, (_m, c: string) => {
    if (c === 'n') return '\n'
    if (c === 'r') return '\r'
    if (c === 't') return '\t'
    if (c === 'b') return '\b'
    if (c === 'f') return '\f'
    if (c === '(' || c === ')' || c === '\\') return c
    const code = Number.parseInt(c, 8)
    try {
      return Buffer.from([code]).toString('latin1')
    } catch {
      return String.fromCharCode(code)
    }
  })
}

function decodeUtf16IfBom(s: string): string {
  if (s.length >= 2 && s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) {
    let out = ''
    for (let k = 2; k + 1 < s.length; k += 2) {
      out += String.fromCharCode((s.charCodeAt(k) << 8) | s.charCodeAt(k + 1))
    }
    return out
  }
  return s
}

function extractPdfValue(str: string, pos: number): { value: string; end: number } | null {
  let i = pos
  while (i < str.length && /[ \t\r\n]/.test(str[i])) i++

  if (str[i] === '(') {
    let depth = 0
    let j = i
    while (j < str.length) {
      if (str[j] === '\\') {
        j += 2
        continue
      }
      if (str[j] === '(') depth++
      else if (str[j] === ')') {
        depth--
        if (depth === 0) {
          return { value: decodeUtf16IfBom(decodePdfLiteral(str.slice(i + 1, j))), end: j + 1 }
        }
      }
      j++
    }
    return null
  }

  if (str[i] === '<' && str[i + 1] !== '<') {
    const end = str.indexOf('>', i)
    if (end >= 0) {
      const hex = str.slice(i + 1, end).replace(/\s/g, '')
      let decoded: string
      try {
        const bytes = Buffer.from(hex, 'hex')
        if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
          decoded = ''
          for (let k = 2; k + 1 < bytes.length; k += 2) {
            decoded += String.fromCharCode((bytes[k] << 8) | bytes[k + 1])
          }
        } else {
          decoded = bytes.toString('utf8')
          if (decoded.includes('�')) decoded = bytes.toString('latin1')
        }
      } catch {
        decoded = hex
      }
      return { value: decoded, end: end + 1 }
    }
    return null
  }

  if (str[i] === '/') {
    const match = str.slice(i).match(/^\/([^\s/<>[\]()]+)/)
    if (match) return { value: match[1], end: i + match[0].length }
    return null
  }

  const match = str.slice(i).match(/^([^\s/<>[\]()]+)/)
  if (match) return { value: match[1], end: i + match[0].length }
  return null
}

function findInfoBlock(pdf: string): string {
  const infoRef = pdf.match(/\/Info\s+(\d+)\s+(\d+)\s+R/)
  if (infoRef) {
    const [, n, g] = infoRef
    const rx = new RegExp(String.raw`\b${n}\s+${g}\s+obj\s*<<([\s\S]*?)>>`)
    const m = pdf.match(rx)
    if (m) return m[1]
  }
  for (const k of ['/Author', '/Creator', '/Producer', '/CreationDate', '/ModDate']) {
    const ki = pdf.indexOf(k)
    if (ki < 0) continue
    const start = pdf.lastIndexOf('<<', ki)
    const end = pdf.indexOf('>>', ki)
    if (start >= 0 && end > start) return pdf.slice(start + 2, end)
  }
  return ''
}

const STANDARD_KEYS = new Set([
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
  'Trapped',
  'Type',
])

function parseInfoDict(infoBlock: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!infoBlock) return out
  const keyRx = /\/([A-Za-z][A-Za-z0-9_.-]*)/g
  let km: RegExpExecArray | null
  while ((km = keyRx.exec(infoBlock)) !== null) {
    const key = km[1]
    if (key === 'Type') continue
    const result = extractPdfValue(infoBlock, km.index + km[0].length)
    if (result !== null && STANDARD_KEYS.has(key)) out[key] = result.value
  }
  return out
}

/** `D:20260813120000Z` (ou variantes com offset) → ISO 8601, ou null se ilegível. */
function parsePdfDate(d: string | undefined): string | null {
  if (!d) return null
  const s = String(d).replace('D:', '').replace(/'/g, '')
  const y = s.slice(0, 4)
  const mo = s.slice(4, 6) || '01'
  const dy = s.slice(6, 8) || '01'
  const h = s.slice(8, 10) || '00'
  const mi = s.slice(10, 12) || '00'
  const sc = s.slice(12, 14) || '00'
  if (!/^\d{4}$/.test(y)) return null
  const ts = Date.parse(`${y}-${mo}-${dy}T${h}:${mi}:${sc}Z`)
  return Number.isNaN(ts) ? null : new Date(ts).toISOString()
}

// ─── XMP (`<x:xmpmeta>…</x:xmpmeta>`) ────────────────────────────────────────

function extractXmpField(xmp: string, campo: string): string | null {
  // Duas formas possíveis: atributo (`xmp:CreateDate="…"`) ou elemento
  // (`<xmp:CreateDate>…</xmp:CreateDate>`).
  const atributo = xmp.match(new RegExp(`${campo}\\s*=\\s*"([^"]*)"`))
  if (atributo) return atributo[1]
  const elemento = xmp.match(new RegExp(`<${campo}>([^<]*)</${campo}>`))
  if (elemento) return elemento[1].trim()
  return null
}

function parseXmp(raw: string): XmpPdf | null {
  const inicio = raw.indexOf('<x:xmpmeta')
  const fimTag = '</x:xmpmeta>'
  const fim = raw.indexOf(fimTag)
  if (inicio < 0 || fim < 0 || fim < inicio) return null
  const bloco = raw.slice(inicio, fim + fimTag.length)

  const createDateRaw = extractXmpField(bloco, 'xmp:CreateDate')
  const modifyDateRaw = extractXmpField(bloco, 'xmp:ModifyDate')

  return {
    createDate: createDateRaw ? isoOuNull(createDateRaw) : null,
    modifyDate: modifyDateRaw ? isoOuNull(modifyDateRaw) : null,
    creatorTool: extractXmpField(bloco, 'xmp:CreatorTool'),
    documentId: extractXmpField(bloco, 'xmpMM:DocumentID'),
    instanceId: extractXmpField(bloco, 'xmpMM:InstanceID'),
  }
}

function isoOuNull(valor: string): string | null {
  const ts = Date.parse(valor)
  return Number.isNaN(ts) ? null : new Date(ts).toISOString()
}

// ─── Contagem de páginas (fallback quando o chamador não informa) ──────────
//
// Mesma técnica de apps/web/server/lib/pdfPages.ts — portada, não importada:
// pacotes não dependem de `apps/`. Quando o chamador já rodou countPdfPages
// (o caso normal em criarAnaliseMatricula.ts), passe o resultado em
// `opcoes.paginasConhecidas` e esta contagem é pulada.

function contarPaginasFallback(raw: string, tamanhoBytes: number): number {
  const porObjetos = (raw.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length
  let porArvore = 0
  for (const m of raw.matchAll(/\/Count\s+(\d+)/g)) {
    const n = Number.parseInt(m[1], 10)
    if (Number.isFinite(n) && n > porArvore) porArvore = n
  }
  const detectado = Math.max(porObjetos, porArvore)
  if (detectado > 0) return detectado
  return Math.max(1, Math.round(tamanhoBytes / 45_000))
}

// ─── Blocklists de produtor/criador ──────────────────────────────────────────

// Peso alto: ferramenta de edição de PDF. É o sinal mais forte do plano — as
// duas amostras "Cowboy" (mesmo documento, contagem de página diferente, 16
// min de diferença) têm Producer "iLovePDF".
const EDITORES = [
  'ilovepdf',
  'smallpdf',
  'pdf24',
  'sejda',
  'foxit editor',
  'nitro',
  'pdfescape',
  'canva',
  'libreoffice',
  'microsoft word',
  'word',
  'pikepdf',
  'pypdf',
  'reportlab',
]

// Peso médio: reimpressão/achatamento, não edição — perde a garantia de
// assinatura viva, mas não é indício de conteúdo alterado. A maioria das
// matrículas reais (Ghostscript, Print To PDF) cai aqui.
const RERENDER = ['ghostscript', 'microsoft: print to pdf', 'print to pdf', 'cutepdf', 'acrobat']

function achaSinal(valor: string | null, lista: string[]): string | null {
  if (!valor) return null
  const lower = valor.toLowerCase()
  return lista.find((sig) => lower.includes(sig)) ?? null
}

// ─── Indícios ─────────────────────────────────────────────────────────────

function pesoDosIndicios(dados: {
  info: InfoPdf
  xmp: XmpPdf | null
  contagens: ContagensPdf
  truncado: boolean
}): Indicio[] {
  const { info, xmp, contagens, truncado } = dados
  const indicios: Indicio[] = []
  const add = (codigo: CodigoIndicioArquivo, peso: Indicio['peso'], evidencia: string) => {
    indicios.push({ codigo, peso, evidencia })
  }

  if (truncado) {
    add(
      'arquivo_truncado',
      'alto',
      'O arquivo não tem os marcadores que todo PDF válido termina com (xref/trailer/%%EOF) — parece cortado ou corrompido.',
    )
    // Um arquivo cortado não permite avaliar datas/produtor com confiança — os
    // demais indícios ainda são calculados, mas o veredito trata este como
    // decisivo (ver veredito.ts).
  }

  const criacaoTs = info.creationDate ? Date.parse(info.creationDate) : NaN
  const modTs = info.modDate ? Date.parse(info.modDate) : NaN

  if (!Number.isNaN(criacaoTs) && !Number.isNaN(modTs) && criacaoTs > modTs + 60_000) {
    add(
      'mod_antes_da_criacao',
      'alto',
      `A data de criação do arquivo (${info.creationDate}) é posterior à de modificação (${info.modDate}) — as datas foram manipuladas.`,
    )
  }

  if (info.modDate && !info.creationDate) {
    add(
      'criacao_ausente',
      'alto',
      'O arquivo tem data de modificação mas não tem data de criação — assinatura típica de um documento que passou por um editor online, que reescreve os metadados e não repõe a data original.',
    )
  }

  if (xmp?.modifyDate && info.modDate) {
    const xmpTs = Date.parse(xmp.modifyDate)
    if (!Number.isNaN(xmpTs) && !Number.isNaN(modTs) && Math.abs(xmpTs - modTs) > 60_000) {
      add(
        'xmp_diverge_do_info',
        'alto',
        `A data de modificação no XMP (${xmp.modifyDate}) diverge da data de modificação no /Info (${info.modDate}) — indício de que só uma das duas foi atualizada por um editor.`,
      )
    }
  }

  const sinalEditor = achaSinal(info.producer, EDITORES) ?? achaSinal(info.creator, EDITORES)
  if (sinalEditor) {
    add(
      'produtor_editor',
      'alto',
      `O software que gerou o arquivo ("${info.producer ?? info.creator}") é um editor de PDF, não um scanner ou impressora — o documento pode ter sido montado ou alterado.`,
    )
  }

  if (contagens.prev > 0 || contagens.eof > 1) {
    add(
      'updates_incrementais',
      'alto',
      `O arquivo tem ${contagens.eof} marcador(es) de fim de arquivo — mecanismo clássico de editar um PDF já existente (inclusive um já assinado) sem reescrevê-lo do zero.`,
    )
  }

  if (contagens.byteRange > 0 && contagens.tipoSig > 0) {
    // A checagem forte (parse de /ByteRange contra o tamanho real) fica fora
    // de escopo aqui — ver "Fora de escopo" no plano. O que dá para afirmar
    // sem parse de PKCS#7 é só a presença dos dois marcadores.
  }

  const sinalRerender = !sinalEditor ? (achaSinal(info.producer, RERENDER) ?? achaSinal(info.creator, RERENDER)) : null
  if (sinalRerender) {
    add(
      'produtor_rerender',
      'medio',
      `O arquivo foi reimpresso ou achatado por "${info.producer ?? info.creator}" — perde a garantia de assinatura viva, mas isso por si só não indica alteração de conteúdo.`,
    )
  }

  if (!Number.isNaN(criacaoTs) && !Number.isNaN(modTs) && Math.abs(modTs - criacaoTs) > 60_000 && criacaoTs <= modTs) {
    add(
      'datas_divergentes',
      'medio',
      `Criação (${info.creationDate}) e modificação (${info.modDate}) diferem em mais de um minuto.`,
    )
  }

  const agora = Date.now()
  if (!Number.isNaN(criacaoTs) && criacaoTs > agora + 86_400_000) {
    add('data_futura', 'medio', `A data de criação (${info.creationDate}) está no futuro.`)
  }
  if (!Number.isNaN(modTs) && modTs > agora + 86_400_000) {
    add('data_futura', 'medio', `A data de modificação (${info.modDate}) está no futuro.`)
  }

  if (contagens.tipoSig === 0) {
    add(
      'sem_assinatura_digital',
      'informativo',
      'O arquivo não carrega uma assinatura digital PAdES — comum em documentos escaneados ou reimpressos, não é por si só indício de problema.',
    )
  }

  return indicios
}

export type OpcoesAnalisarPdf = {
  /** Contagem de páginas já feita pelo chamador (ver pdfPages.ts) — evita recontar. */
  paginasConhecidas?: number
}

/**
 * Perícia do arquivo a partir só dos bytes — sem rede, sem processo externo.
 * `paginas_heterogeneas` (dimensão/rotação por página) fica fora daqui porque
 * exige `pdfinfo` sobre o arquivo em disco; ver `detectarPaginasHeterogeneas`,
 * usado só pelo worker, que já tem poppler disponível.
 */
export function analisarPdf(buffer: Buffer, opcoes: OpcoesAnalisarPdf = {}): PericiaArquivo {
  const raw = buffer.toString('latin1')

  const versaoIdx = raw.indexOf('%PDF-')
  const versaoHeader = versaoIdx >= 0 ? raw.slice(versaoIdx + 5, versaoIdx + 8).trim() : null

  const infoRaw = parseInfoDict(findInfoBlock(raw))
  const info: InfoPdf = {
    creationDate: parsePdfDate(infoRaw.CreationDate),
    modDate: parsePdfDate(infoRaw.ModDate),
    producer: infoRaw.Producer ?? null,
    creator: infoRaw.Creator ?? null,
    author: infoRaw.Author ?? null,
    title: infoRaw.Title ?? null,
  }

  const xmp = parseXmp(raw)

  const contagens: ContagensPdf = {
    eof: (raw.match(/%%EOF/g) ?? []).length,
    startxref: (raw.match(/startxref/g) ?? []).length,
    prev: (raw.match(/\/Prev\s+\d+/g) ?? []).length,
    tipoSig: (raw.match(/\/Type\s*\/Sig(?![a-zA-Z])/g) ?? []).length,
    byteRange: (raw.match(/\/ByteRange/g) ?? []).length,
    acroForm: (raw.match(/\/AcroForm/g) ?? []).length,
    encrypt: (raw.match(/\/Encrypt\b/g) ?? []).length,
    subtypeImage: (raw.match(/\/Subtype\s*\/Image/g) ?? []).length,
    tipoFont: (raw.match(/\/Type\s*\/Font/g) ?? []).length,
  }

  const truncado = contagens.eof === 0 || contagens.startxref === 0 || !raw.includes('trailer')

  const paginas = opcoes.paginasConhecidas ?? contarPaginasFallback(raw, buffer.length)

  const sha256 = createHash('sha256').update(buffer).digest('hex')

  const indicios = pesoDosIndicios({ info, xmp, contagens, truncado })

  return { versaoHeader, info, xmp, contagens, sha256, paginas, truncado, indicios }
}

// ─── Páginas heterogêneas (só o worker, que tem poppler) ────────────────────
//
// Mesma chamada de `pdfinfo -f n -l n` que packages/workers/src/lib/recorte.ts
// já usa para medir a página antes de recortar — aqui é para comparar
// dimensão e rotação entre páginas, não para recortar nada. Uma página com
// tamanho ou rotação destoante do resto do documento é o sinal físico de uma
// página inserida ou substituída.

const TIMEOUT_PDFINFO_MS = 20_000

type DimensaoPagina = { largura: number; altura: number; rotacao: number }

async function medirPagina(caminhoPdf: string, pagina: number): Promise<DimensaoPagina | null> {
  try {
    const { stdout } = await exec(
      'pdfinfo',
      ['-f', String(pagina), '-l', String(pagina), caminhoPdf],
      { timeout: TIMEOUT_PDFINFO_MS },
    )
    const tamanho = stdout.match(/Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/)
    const rotacao = stdout.match(/Page\s+\d+\s+rot:\s+(-?\d+)/)
    if (!tamanho) return null
    return {
      largura: Math.round(Number(tamanho[1])),
      altura: Math.round(Number(tamanho[2])),
      rotacao: rotacao ? Number(rotacao[1]) : 0,
    }
  } catch {
    return null
  }
}

/** Tolerância em pontos para variação de tamanho entre páginas — digitalização não é perfeita. */
const TOLERANCIA_PT = 5

/**
 * Compara dimensão e rotação de todas as páginas de `caminhoPdf` (já em disco
 * — o chamador baixa do GCS antes). Devolve o indício `paginas_heterogeneas`
 * quando alguma página destoa da moda do documento, ou `null` quando não dá
 * para medir (poppler ausente, PDF ilegível) ou tudo é homogêneo. Nunca lança.
 */
export async function detectarPaginasHeterogeneas(
  caminhoPdf: string,
  totalPaginas: number,
): Promise<Indicio | null> {
  if (totalPaginas <= 1) return null

  const medidas: DimensaoPagina[] = []
  for (let p = 1; p <= totalPaginas; p++) {
    const m = await medirPagina(caminhoPdf, p)
    if (m) medidas.push(m)
  }
  if (medidas.length < 2) return null

  // Moda pelo par (largura arredondada à tolerância, rotação) — o formato mais
  // comum no documento é o "normal"; o resto é comparado contra ele.
  const chaves = medidas.map((m) => `${Math.round(m.largura / TOLERANCIA_PT)}x${Math.round(m.altura / TOLERANCIA_PT)}:${m.rotacao}`)
  const contagem = new Map<string, number>()
  for (const c of chaves) contagem.set(c, (contagem.get(c) ?? 0) + 1)
  const moda = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0]

  const destoantes = chaves.filter((c) => c !== moda).length
  if (destoantes === 0) return null

  return {
    // Peso alto por definição do plano (§1): é evidência física, não uma
    // inferência de metadado que um editor possa ter deixado por descuido.
    codigo: 'paginas_heterogeneas',
    peso: 'alto',
    evidencia: `${destoantes} de ${medidas.length} página(s) têm tamanho ou orientação diferente do resto do documento — pode ser uma página inserida ou substituída, ou só uma digitalização em lote com folhas de tamanhos diferentes.`,
  }
}
