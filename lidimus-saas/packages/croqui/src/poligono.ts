// Construção do polígono do lote a partir do JSON estruturado da skill.
// Tudo em coordenadas de terreno (x = leste/da esquerda p/ direita, y para cima);
// o render SVG espelha o y no final.

import type { Aresta, CroquiData, Desenho, Ponto, Segmento } from './types.ts'
import { parseDms, rumoParaAzimute } from './angulos.ts'

const EPS = 1e-9
const rad = (g: number) => (g * Math.PI) / 180

export function shoelace(v: Ponto[]): number {
  let s = 0
  for (let i = 0; i < v.length; i++) {
    const a = v[i]
    const b = v[(i + 1) % v.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

function centroide(v: Ponto[]): Ponto {
  return {
    x: v.reduce((s, p) => s + p.x, 0) / v.length,
    y: v.reduce((s, p) => s + p.y, 0) / v.length,
  }
}

function aresta(a: Ponto, b: Ponto, seg?: Segmento | null, extra?: Partial<Aresta>): Aresta {
  return {
    a,
    b,
    distancia: seg?.distancia ?? null,
    confrontante: seg?.confrontante ?? null,
    tipo: seg?.tipo === 'curva' || seg?.tipo === 'chanfro' ? seg.tipo : 'reta',
    raioM: seg?.raio_m ?? null,
    curvaLado: null,
    rotuloDe: null,
    ...extra,
  }
}

type Construcao = { desenho: Desenho } | { erro: string }

// ─── Lados nomeados (lotes de até 4 lados) ───────────────────────────────────

const LADOS = ['frente', 'lateral_direita', 'fundos', 'lateral_esquerda'] as const
type Lado = (typeof LADOS)[number]

function ladoDoSegmento(seg: Segmento): Lado | 'chanfro' | null {
  const de = String(seg.de ?? '').toLowerCase()
  const ate = String(seg.ate ?? '').toLowerCase()
  // tipo decide primeiro: um lado normal pode COMEÇAR ou TERMINAR no chanfro
  // (ate: "chanfro") sem ser o chanfro
  if (seg.tipo === 'chanfro') return 'chanfro'
  if ((LADOS as readonly string[]).includes(de)) return de as Lado
  if ((LADOS as readonly string[]).includes(ate)) return ate as Lado
  if (de === 'chanfro' || ate === 'chanfro') return 'chanfro'
  return null
}

// ─── Retangular simples (testada × profundidade) ─────────────────────────────

export function construirRetangulo(data: CroquiData, avisos: string[]): Construcao {
  const porLado: Partial<Record<Lado, Segmento>> = {}
  for (const seg of data.segmentos) {
    const lado = ladoDoSegmento(seg)
    if (lado && lado !== 'chanfro' && !porLado[lado]) porLado[lado] = seg
  }

  const t = data.testada ?? porLado.frente?.distancia ?? null
  const p = data.profundidade ?? porLado.lateral_direita?.distancia ?? null
  if (!t || !p || t <= 0 || p <= 0) {
    return { erro: 'Testada e profundidade são necessárias para desenhar o lote retangular.' }
  }

  const v: Ponto[] = [
    { x: 0, y: 0 },
    { x: t, y: 0 },
    { x: t, y: p },
    { x: 0, y: p },
  ]
  const arestas: Aresta[] = [
    aresta(v[0], v[1], porLado.frente, { distancia: t }),
    aresta(v[1], v[2], porLado.lateral_direita, { distancia: p }),
    aresta(v[2], v[3], porLado.fundos, { distancia: t }),
    aresta(v[3], v[0], porLado.lateral_esquerda, { distancia: p }),
  ]
  return { desenho: { vertices: v, arestas, orientado: false } }
}

// ─── Retangular 4 lados / confrontantes (trapézio) ───────────────────────────

export function construirQuadrilatero(data: CroquiData, avisos: string[]): Construcao {
  const porLado: Partial<Record<Lado, Segmento>> = {}
  let chanfro: { seg: Segmento; aposLado: Lado } | null = null

  let anterior: Lado | null = null
  for (const seg of data.segmentos) {
    const lado = ladoDoSegmento(seg)
    if (lado === 'chanfro') {
      chanfro = { seg, aposLado: anterior ?? 'frente' }
    } else if (lado) {
      if (!porLado[lado]) porLado[lado] = seg
      anterior = lado
    }
  }

  const f = porLado.frente?.distancia ?? null
  const b = porLado.fundos?.distancia ?? null
  const dr = porLado.lateral_direita?.distancia ?? null
  const dl = porLado.lateral_esquerda?.distancia ?? null
  if (f == null || b == null || dr == null || dl == null || f <= 0 || b <= 0 || dr <= 0 || dl <= 0) {
    return { erro: 'As quatro medidas (frente, fundos e laterais) são necessárias para desenhar o lote.' }
  }

  // Convenção: frente e fundos paralelos (trapézio). Resolve a altura h e o
  // deslocamento t do topo pelas duas pernas: dl² = t² + h², dr² = (t+d)² + h²
  const d = b - f
  let topoEsq: Ponto | null = null
  let topoDir: Ponto | null = null
  if (Math.abs(d) > EPS) {
    const t = (dr * dr - dl * dl - d * d) / (2 * d)
    const h2 = dl * dl - t * t
    if (h2 > EPS) {
      const h = Math.sqrt(h2)
      topoEsq = { x: t, y: h }
      topoDir = { x: t + b, y: h }
    }
  } else if (Math.abs(dr - dl) <= 0.005 * Math.max(dr, dl)) {
    const h = (dr + dl) / 2
    topoEsq = { x: 0, y: h }
    topoDir = { x: b, y: h }
  }
  if (!topoEsq || !topoDir) {
    // As medidas não fecham um trapézio de lados paralelos — esquema com topo centrado
    topoEsq = { x: (f - b) / 2, y: dl }
    topoDir = { x: (f + b) / 2, y: dr }
    avisos.push('As medidas dos lados não fecham um trapézio exato — desenho esquemático.')
  }

  let vertices: Ponto[] = [{ x: 0, y: 0 }, { x: f, y: 0 }, topoDir, topoEsq]
  const segsPorAresta: (Segmento | undefined)[] = [
    porLado.frente,
    porLado.lateral_direita,
    porLado.fundos,
    porLado.lateral_esquerda,
  ]

  // Chanfro: corta o canto entre o lado descrito antes dele e o lado seguinte
  let arestas: Aresta[]
  const c = chanfro?.seg.distancia ?? null
  if (chanfro && c && c > 0) {
    const idxCanto = { frente: 1, lateral_direita: 2, fundos: 3, lateral_esquerda: 0 }[
      chanfro.aposLado
    ]
    const V = vertices[idxCanto]
    const ant = vertices[(idxCanto + 3) % 4]
    const seg = vertices[(idxCanto + 1) % 4]
    const u1 = unitario(V.x - ant.x, V.y - ant.y)
    const u2 = unitario(seg.x - V.x, seg.y - V.y)
    const cosTheta = -(u1.x * u2.x + u1.y * u2.y)
    const theta = Math.acos(Math.min(1, Math.max(-1, cosTheta)))
    const recuo = Math.min(c / (2 * Math.sin(theta / 2)), 0.4 * Math.min(f, b, dr, dl))
    const p1 = { x: V.x - u1.x * recuo, y: V.y - u1.y * recuo }
    const p2 = { x: V.x + u2.x * recuo, y: V.y + u2.y * recuo }

    const novoV: Ponto[] = []
    const novasArestas: Aresta[] = []
    for (let i = 0; i < 4; i++) {
      const ini = i === idxCanto ? p2 : vertices[i]
      const fim = (i + 1) % 4 === idxCanto ? p1 : vertices[(i + 1) % 4]
      novoV.push(ini)
      novasArestas.push(aresta(ini, fim, segsPorAresta[i]))
      if ((i + 1) % 4 === idxCanto) {
        novoV.push(p1)
        novasArestas.push(aresta(p1, p2, chanfro.seg, { tipo: 'chanfro', distancia: c }))
      }
    }
    vertices = novoV
    arestas = novasArestas
    avisos.push('Chanfro representado no canto entre os lados descritos — posição aproximada.')
  } else {
    arestas = vertices.map((v, i) => aresta(v, vertices[(i + 1) % 4], segsPorAresta[i]))
  }

  if (Math.abs(d) > EPS) {
    avisos.push('Frente e fundos com medidas diferentes — lote desenhado como trapézio.')
  }
  return { desenho: { vertices, arestas, orientado: false } }
}

function unitario(x: number, y: number): Ponto {
  const l = Math.hypot(x, y) || 1
  return { x: x / l, y: y / l }
}

// ─── Caminhamento (deflexão, azimute, rumo) ──────────────────────────────────

export function construirCaminhada(
  data: CroquiData,
  avisos: string[],
): (Construcao & { erroFechamentoPct?: number | null }) | { erro: string } {
  const segs = data.segmentos
  if (segs.length < 3) return { erro: 'Menos de três segmentos descritos — não há polígono.' }

  const porAzimute = data.formato === 'azimute' || data.formato === 'rumo'
  const pontos: Ponto[] = [{ x: 0, y: 0 }]
  const meta: { seg: Segmento; curvaLado: 'direita' | 'esquerda' | null }[] = []
  let heading = 0 // graus CCW a partir de +x, em coords de terreno (y para cima)

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]
    let dist = seg.distancia ?? null

    if (porAzimute) {
      const az =
        data.formato === 'azimute' ? parseDms(seg.azimute_raw) : rumoParaAzimute(seg.rumo_raw)
      if (az == null) {
        return {
          erro: `Segmento ${i + 1}: ângulo "${seg.azimute_raw ?? seg.rumo_raw ?? ''}" ilegível.`,
        }
      }
      heading = 90 - az // azimute (do norte, horário) → ângulo CCW a partir do leste
    } else if (i > 0) {
      // deflexão: o ângulo interno no vértice inicial do segmento define a virada
      const interno = parseDms(seg.angulo_interno_raw)
      if (interno == null) {
        return { erro: `Segmento ${i + 1}: ângulo interno "${seg.angulo_interno_raw ?? ''}" ilegível.` }
      }
      const virada = 180 - interno
      const lado = seg.deflexao_lado ?? 'direita'
      heading += lado === 'direita' ? -virada : virada
    }

    let curvaLado: 'direita' | 'esquerda' | null = null
    if (seg.tipo === 'curva' && seg.raio_m && seg.desenvolvimento_m) {
      // curva circular: avança pela corda, virando metade do ângulo central
      // antes e metade depois — o arco em si é desenhado pelo SVG
      const delta = seg.desenvolvimento_m / seg.raio_m
      const corda = 2 * seg.raio_m * Math.sin(delta / 2)
      const lado = seg.deflexao_lado ?? 'direita'
      const meio = ((lado === 'direita' ? -1 : 1) * (delta / 2) * 180) / Math.PI
      heading += meio
      avancar(pontos, heading, corda)
      heading += meio
      curvaLado = lado
      dist = seg.desenvolvimento_m
    } else {
      if (seg.tipo === 'curva' && dist == null) dist = seg.desenvolvimento_m ?? null
      if (seg.tipo === 'curva') {
        avisos.push(`Segmento ${i + 1}: curva sem raio — trecho desenhado como reta.`)
      }
      if (dist == null || dist <= 0) return { erro: `Segmento ${i + 1}: sem distância declarada.` }
      avancar(pontos, heading, dist)
    }
    meta.push({ seg, curvaLado })
  }

  // Fechamento: caminhamentos reais raramente fecham no milímetro
  const inicio = pontos[0]
  const fim = pontos[pontos.length - 1]
  const gap = Math.hypot(fim.x - inicio.x, fim.y - inicio.y)
  let perimetro = 0
  for (let i = 1; i < pontos.length; i++) {
    perimetro += Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y)
  }
  const erroFechamentoPct = perimetro > 0 ? (gap / perimetro) * 100 : null

  let vertices: Ponto[]
  const arestas: Aresta[] = []
  const fechaSozinho = erroFechamentoPct != null && erroFechamentoPct < 0.5
  if (fechaSozinho) {
    vertices = pontos.slice(0, -1)
  } else {
    vertices = pontos
    avisos.push(
      `O perímetro descrito não fecha exatamente (diferença de ${(erroFechamentoPct ?? 0).toFixed(1)}% do perímetro) — o desenho une o último ponto ao primeiro.`,
    )
  }
  for (let i = 0; i < meta.length; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % vertices.length]
    arestas.push(
      aresta(a, b, meta[i].seg, {
        curvaLado: meta[i].curvaLado,
        rotuloDe: rotuloDePonto(meta[i].seg),
      }),
    )
  }
  if (!fechaSozinho) {
    // aresta de fechamento sem medida (a linha pontilhada da praxe topográfica)
    arestas.push(aresta(vertices[vertices.length - 1], vertices[0], null))
  }

  const desenho: Desenho = { vertices, arestas, orientado: porAzimute }
  if (!porAzimute) reorientar(desenho)
  return { desenho, erroFechamentoPct }
}

function avancar(pontos: Ponto[], headingGraus: number, dist: number) {
  const ultimo = pontos[pontos.length - 1]
  pontos.push({
    x: ultimo.x + Math.cos(rad(headingGraus)) * dist,
    y: ultimo.y + Math.sin(rad(headingGraus)) * dist,
  })
}

function rotuloDePonto(seg: Segmento): string | null {
  const de = String(seg.de ?? '')
  // rótulos de levantamento (P1, M-02, "ponto 3") valem; lados nomeados não
  if (!de || (LADOS as readonly string[]).includes(de.toLowerCase())) return null
  return de
}

// Gira o desenho para o primeiro segmento ficar horizontal (a frente na base)
// e espelha se o polígono ficou abaixo dela. Só para formatos sem norte real.
function reorientar(desenho: Desenho) {
  const v = desenho.vertices
  if (v.length < 2) return
  const alpha = Math.atan2(v[1].y - v[0].y, v[1].x - v[0].x)
  const cos = Math.cos(-alpha)
  const sin = Math.sin(-alpha)
  const girar = (p: Ponto) => {
    const x = p.x * cos - p.y * sin
    const y = p.x * sin + p.y * cos
    p.x = x
    p.y = y
  }
  for (const p of v) girar(p)
  // arestas compartilham as referências dos vértices, exceto pontos de fechamento
  for (const ar of desenho.arestas) {
    if (!v.includes(ar.a)) girar(ar.a)
    if (!v.includes(ar.b)) girar(ar.b)
  }

  if (centroide(v).y < 0) {
    for (const p of v) p.y = -p.y
    for (const ar of desenho.arestas) {
      if (!v.includes(ar.a)) ar.a.y = -ar.a.y
      if (!v.includes(ar.b)) ar.b.y = -ar.b.y
      // espelhar troca o lado das curvas
      if (ar.curvaLado) ar.curvaLado = ar.curvaLado === 'direita' ? 'esquerda' : 'direita'
    }
  }
}

// ─── UTM ─────────────────────────────────────────────────────────────────────

export function construirUtm(data: CroquiData, avisos: string[]): Construcao {
  const vs = (data.vertices_utm ?? []).filter(
    (v) => Number.isFinite(v?.e) && Number.isFinite(v?.n),
  )
  if (vs.length < 3) return { erro: 'Menos de três vértices UTM legíveis.' }

  const vertices: Ponto[] = vs.map((v) => ({ x: v.e, y: v.n }))
  const arestas: Aresta[] = []
  let distanciasCalculadas = false
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % vertices.length]
    const seg = data.segmentos[i]
    let dist = seg?.distancia ?? null
    if (dist == null) {
      dist = Math.hypot(b.x - a.x, b.y - a.y)
      distanciasCalculadas = true
    }
    const rotulo = vs[i].rotulo ?? (seg ? rotuloDePonto(seg) : null)
    arestas.push(aresta(a, b, seg, { distancia: dist, rotuloDe: rotulo }))
  }
  if (distanciasCalculadas) {
    avisos.push('Distâncias calculadas a partir das coordenadas UTM.')
  }
  return { desenho: { vertices, arestas, orientado: true } }
}

// ─── Irregular (esquemático) ─────────────────────────────────────────────────

export function construirIrregular(data: CroquiData, avisos: string[]): Construcao {
  const lados = data.segmentos.filter((s) => (s.distancia ?? 0) > 0)
  if (lados.length < 3) return { erro: 'Menos de três lados com medida — não há polígono.' }

  // Vértices sobre um círculo, com arcos proporcionais às medidas: sempre fecha,
  // e as proporções entre lados se preservam aproximadamente. É um esquema.
  const perimetro = lados.reduce((s, l) => s + (l.distancia ?? 0), 0)
  const R = perimetro / (2 * Math.PI)
  const vertices: Ponto[] = []
  // começa no nadir para o primeiro lado correr na base do desenho
  let phi = (3 * Math.PI) / 2 - (Math.PI * (lados[0].distancia ?? 0)) / perimetro
  for (const lado of lados) {
    vertices.push({ x: R * Math.cos(phi), y: R * Math.sin(phi) })
    phi += (2 * Math.PI * (lado.distancia ?? 0)) / perimetro
  }
  const arestas = lados.map((seg, i) =>
    aresta(vertices[i], vertices[(i + 1) % vertices.length], seg),
  )
  avisos.push('Descrição sem dados angulares — desenho esquemático, proporções aproximadas.')
  return { desenho: { vertices, arestas, orientado: false } }
}
