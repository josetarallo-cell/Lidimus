// Render do croqui em SVG autocontido (estilos embutidos — o arquivo baixado
// abre igual fora do app). Coordenadas de terreno têm y para cima; o SVG
// espelha o y, então o desenho aparece como planta vista de cima.

import type { Desenho, Ponto, Precisao } from './types.ts'

export interface SvgMeta {
  ruaFrente?: string | null
  precisao?: Precisao | null
  areaM2?: number | null
  areaDescritaM2?: number | null
}

const MARGEM = 96
const DESENHO_MAX = 560
const RODAPE = 56

export function fmtNum(n: number, dec = 2): string {
  const [int, frac] = n.toFixed(dec).split('.')
  const milhares = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return frac ? `${milhares},${frac}` : milhares
}

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

const PRECISAO_LABEL: Record<Precisao, string> = {
  exata: 'Precisão: exata',
  aproximada: 'Precisão: aproximada',
  esquematica: 'Representação esquemática — sem escala fiel',
}

export function renderSvg(desenho: Desenho, meta: SvgMeta = {}): string {
  const { vertices, arestas } = desenho

  const xs = vertices.map((p) => p.x)
  const ys = vertices.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const bw = Math.max(maxX - minX, EPS_BB)
  const bh = Math.max(maxY - minY, EPS_BB)

  const escala = DESENHO_MAX / Math.max(bw, bh)
  const W = Math.round(bw * escala + 2 * MARGEM)
  const H = Math.round(bh * escala + 2 * MARGEM + RODAPE)

  // terreno (y para cima) → SVG (y para baixo)
  const P = (p: Ponto) => ({
    x: MARGEM + (p.x - minX) * escala,
    y: MARGEM + (maxY - p.y) * escala,
  })

  const cGround = {
    x: vertices.reduce((s, p) => s + p.x, 0) / vertices.length,
    y: vertices.reduce((s, p) => s + p.y, 0) / vertices.length,
  }
  const C = P(cGround)

  // ─── contorno ───────────────────────────────────────────────────────────────
  let path = ''
  arestas.forEach((ar, i) => {
    const a = P(ar.a)
    const b = P(ar.b)
    if (i === 0) path += `M ${fx(a.x)} ${fx(a.y)} `
    if (ar.tipo === 'curva' && ar.raioM) {
      const r = fx(ar.raioM * escala)
      const sweep = ar.curvaLado === 'esquerda' ? 0 : 1
      path += `A ${r} ${r} 0 0 ${sweep} ${fx(b.x)} ${fx(b.y)} `
    } else {
      path += `L ${fx(b.x)} ${fx(b.y)} `
    }
  })
  path += 'Z'

  const partes: string[] = []
  partes.push(`<path class="cro-lote" d="${path}" />`)

  // ─── rótulos das arestas ────────────────────────────────────────────────────
  const ruaNormalizada = meta.ruaFrente?.trim().toLowerCase() ?? null
  for (const ar of arestas) {
    const a = P(ar.a)
    const b = P(ar.b)
    const ex = b.x - a.x
    const ey = b.y - a.y
    const len = Math.hypot(ex, ey)
    if (len < 8) continue
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    // normal apontando para fora (longe do centroide)
    let nx = -ey / len
    let ny = ex / len
    if (nx * (mid.x - C.x) + ny * (mid.y - C.y) < 0) {
      nx = -nx
      ny = -ny
    }
    let ang = (Math.atan2(ey, ex) * 180) / Math.PI
    if (ang > 90) ang -= 180
    if (ang < -90) ang += 180

    if (ar.distancia != null) {
      const t = { x: mid.x + nx * 14, y: mid.y + ny * 14 }
      partes.push(
        `<text class="cro-dist" x="${fx(t.x)}" y="${fx(t.y)}" transform="rotate(${fx(ang)} ${fx(t.x)} ${fx(t.y)})">${escapeXml(fmtNum(ar.distancia))} m</text>`,
      )
    }
    // a rua da frente já ganha rótulo próprio abaixo do desenho — não duplicar
    const ehRuaFrente =
      !desenho.orientado && ruaNormalizada && ar.confrontante?.trim().toLowerCase() === ruaNormalizada
    if (ar.confrontante && !ehRuaFrente) {
      const texto = truncar(ar.confrontante, 44)
      const t = { x: mid.x + nx * 30, y: mid.y + ny * 30 }
      partes.push(
        `<text class="cro-conf" x="${fx(t.x)}" y="${fx(t.y)}" transform="rotate(${fx(ang)} ${fx(t.x)} ${fx(t.y)})">${escapeXml(texto)}</text>`,
      )
    }
  }

  // ─── rótulos de vértices (P1, M-02…) ────────────────────────────────────────
  for (const ar of arestas) {
    if (!ar.rotuloDe) continue
    const a = P(ar.a)
    const dx = a.x - C.x
    const dy = a.y - C.y
    const l = Math.hypot(dx, dy) || 1
    partes.push(`<circle class="cro-vertice" cx="${fx(a.x)}" cy="${fx(a.y)}" r="2.5" />`)
    partes.push(
      `<text class="cro-rotulo" x="${fx(a.x + (dx / l) * 12)}" y="${fx(a.y + (dy / l) * 12)}">${escapeXml(ar.rotuloDe)}</text>`,
    )
  }

  // ─── rua da frente (formatos sem orientação: frente é a primeira aresta) ────
  if (meta.ruaFrente && !desenho.orientado && arestas.length) {
    const a = P(arestas[0].a)
    const b = P(arestas[0].b)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const y = Math.max(a.y, b.y) + 52
    partes.push(
      `<text class="cro-via" x="${fx(mid.x)}" y="${fx(y)}">${escapeXml(truncar(meta.ruaFrente, 48))}</text>`,
    )
  }

  // ─── seta norte (só quando a orientação é real) ─────────────────────────────
  if (desenho.orientado) {
    const nx = W - 44
    const ny = 74
    partes.push(
      `<g class="cro-norte"><line x1="${nx}" y1="${ny}" x2="${nx}" y2="${ny - 30}" />` +
        `<path d="M ${nx - 5} ${ny - 24} L ${nx} ${ny - 36} L ${nx + 5} ${ny - 24} Z" />` +
        `<text x="${nx}" y="${ny + 14}">N</text></g>`,
    )
  }

  // ─── barra de escala ────────────────────────────────────────────────────────
  const alvoM = (bw > EPS_BB ? bw : bh) / 4
  const escalaM = passoRedondo(alvoM)
  const escalaPx = escalaM * escala
  const ex0 = MARGEM
  const ey0 = H - 26
  partes.push(
    `<g class="cro-escala"><line x1="${fx(ex0)}" y1="${ey0}" x2="${fx(ex0 + escalaPx)}" y2="${ey0}" />` +
      `<line x1="${fx(ex0)}" y1="${ey0 - 4}" x2="${fx(ex0)}" y2="${ey0 + 4}" />` +
      `<line x1="${fx(ex0 + escalaPx)}" y1="${ey0 - 4}" x2="${fx(ex0 + escalaPx)}" y2="${ey0 + 4}" />` +
      `<text x="${fx(ex0 + escalaPx / 2)}" y="${ey0 - 8}">${escapeXml(fmtNum(escalaM, escalaM < 1 ? 1 : 0))} m</text></g>`,
  )

  // ─── área e precisão ────────────────────────────────────────────────────────
  if (meta.areaM2 != null) {
    let texto = `Área: ${fmtNum(meta.areaM2)} m²`
    if (
      meta.areaDescritaM2 != null &&
      Math.abs(meta.areaDescritaM2 - meta.areaM2) > 0.005 * meta.areaDescritaM2
    ) {
      texto += ` · descrita: ${fmtNum(meta.areaDescritaM2)} m²`
    }
    partes.push(`<text class="cro-area" x="${W - MARGEM / 2}" y="${H - 20}">${escapeXml(texto)}</text>`)
  }
  if (meta.precisao) {
    partes.push(
      `<text class="cro-precisao" x="${MARGEM / 2}" y="34">${escapeXml(PRECISAO_LABEL[meta.precisao])}</text>`,
    )
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Croqui do terreno">` +
    `<style>
      .cro-lote { fill: rgba(47,107,79,0.07); stroke: #24312a; stroke-width: 1.6; stroke-linejoin: round; }
      text { font-family: Georgia, 'Times New Roman', serif; fill: #24312a; }
      .cro-dist { font-size: 13px; text-anchor: middle; font-variant-numeric: tabular-nums; }
      .cro-conf { font-size: 10.5px; text-anchor: middle; fill: #6b7a72; font-style: italic; }
      .cro-via { font-size: 13px; text-anchor: middle; fill: #2f6b4f; font-style: italic; letter-spacing: 0.04em; }
      .cro-vertice { fill: #24312a; }
      .cro-rotulo { font-size: 10px; text-anchor: middle; dominant-baseline: middle; fill: #6b7a72; }
      .cro-norte line, .cro-escala line { stroke: #24312a; stroke-width: 1.2; }
      .cro-norte path { fill: #24312a; }
      .cro-norte text { font-size: 12px; text-anchor: middle; }
      .cro-escala text { font-size: 10.5px; text-anchor: middle; fill: #6b7a72; }
      .cro-area { font-size: 13px; text-anchor: end; }
      .cro-precisao { font-size: 11px; fill: #6b7a72; letter-spacing: 0.06em; text-transform: uppercase; }
    </style>` +
    partes.join('') +
    '</svg>'
  )
}

const EPS_BB = 1e-6

const fx = (n: number) => String(Math.round(n * 100) / 100)

function truncar(s: string, max: number): string {
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// 1, 2 ou 5 × 10^k mais próximo (abaixo) do alvo — escala "de régua"
function passoRedondo(alvo: number): number {
  if (alvo <= 0) return 1
  const pot = Math.pow(10, Math.floor(Math.log10(alvo)))
  for (const m of [5, 2, 1]) {
    if (m * pot <= alvo) return m * pot
  }
  return pot
}
