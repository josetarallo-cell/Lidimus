// QR Code do Selo Digital TJSP — §3 do plano. O QR é imune a erro de OCR e
// carrega mais que o selo: pela spec §4.8–4.9, o conteúdo é
//
//   https://selodigital.tjsp.jus.br?r=<selo25>|<valorTotal>|<iss>|<assinaturaRSA base64>
//
// com os parâmetros em URL-encoding (RFC 3986). Quando o QR resolve, ele vira
// fonte primária do selo (ver ancoras.ts: `seloDoQr`) e o texto do OCR passa a
// ser conferência, não a única fonte.
//
// Renderização usa `pdftoppm` (poppler), do mesmo jeito que
// packages/workers/src/lib/recorte.ts — por isso só roda no worker, que já tem
// o binário no Dockerfile. Falha aqui (poppler ausente, PDF corrompido,
// timeout, nenhum QR nas páginas tentadas) nunca derruba o job: devolve null.

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import type { QrSelo } from './tipos.ts'

const exec = promisify(execFile)

const DPI = 300
const TIMEOUT_MS = 15_000

/**
 * Decodifica o conteúdo de um QR a partir dos bytes de um PNG já renderizado.
 * Separado de `lerQrDoPdf` de propósito: esta parte não depende de poppler e
 * é testável com qualquer PNG contendo QR (ver qr.test.ts).
 */
export function decodificarQrDeBuffer(png: Buffer): string | null {
  let imagem: PNG
  try {
    imagem = PNG.sync.read(png)
  } catch {
    return null
  }
  const resultado = jsQR(new Uint8ClampedArray(imagem.data), imagem.width, imagem.height)
  return resultado?.data ?? null
}

/**
 * Interpreta o conteúdo de um QR como o do Selo Digital TJSP. `null` quando o
 * QR não tem essa forma — é comum um documento ter QR de outra coisa (código
 * de barras de boleto, link institucional).
 */
export function parseUrlSeloTjsp(
  conteudo: string,
): { selo25: string; valorTotal: string | null; iss: string | null; assinaturaPresente: boolean } | null {
  let url: URL
  try {
    url = new URL(conteudo)
  } catch {
    return null
  }
  const r = url.searchParams.get('r')
  if (!r) return null

  const partes = r.split('|')
  const selo25 = (partes[0] ?? '').toUpperCase()
  if (!/^[0-9A-Z]{25}$/.test(selo25)) return null

  return {
    selo25,
    valorTotal: partes[1] || null,
    iss: partes[2] || null,
    assinaturaPresente: Boolean(partes[3]),
  }
}

async function renderizarPagina(caminhoPdf: string, pagina: number): Promise<Buffer | null> {
  const pasta = await mkdtemp(join(tmpdir(), 'lidimus-qr-'))
  const prefixo = join(pasta, 'pagina')
  try {
    await exec(
      'pdftoppm',
      ['-png', '-r', String(DPI), '-f', String(pagina), '-l', String(pagina), '-singlefile', caminhoPdf, prefixo],
      { timeout: TIMEOUT_MS },
    )
    return await readFile(`${prefixo}.png`)
  } catch {
    return null
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {})
  }
}

/** 1ª, 2ª e última página, sem repetir — é onde o selo TJSP costuma estar. */
function paginasCandidatas(totalPaginas: number): number[] {
  const paginas = [1, 2, totalPaginas].filter((p) => p >= 1 && p <= totalPaginas)
  return [...new Set(paginas)]
}

/**
 * Procura o QR do selo TJSP no PDF em `caminhoPdf` (arquivo já em disco — o
 * chamador baixa do GCS antes). Para no primeiro QR que resolver como selo
 * TJSP; nunca lança.
 */
export async function lerQrDoPdf(caminhoPdf: string, totalPaginas: number): Promise<QrSelo | null> {
  for (const pagina of paginasCandidatas(totalPaginas)) {
    const png = await renderizarPagina(caminhoPdf, pagina)
    if (!png) continue

    const conteudo = decodificarQrDeBuffer(png)
    if (!conteudo) continue

    const selo = parseUrlSeloTjsp(conteudo)
    if (!selo) continue

    return { ...selo, pagina }
  }
  return null
}
