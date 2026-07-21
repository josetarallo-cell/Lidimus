// Motor determinístico do croqui: recebe o JSON estruturado que a skill
// croqui-matricula extrai da matrícula e devolve o desenho em SVG + validações.
// Nenhum LLM aqui — toda a geometria é código, testável e versionada.

import type { CroquiData, CroquiResultado, Desenho, Formato, Precisao, Segmento } from './types.ts'
import {
  construirCaminhada,
  construirIrregular,
  construirQuadrilatero,
  construirRetangulo,
  construirUtm,
  shoelace,
} from './poligono.ts'
import { renderSvg } from './svg.ts'

export type { CroquiData, CroquiResultado, Segmento, Formato, Precisao } from './types.ts'
export { parseDms, rumoParaAzimute } from './angulos.ts'
export { fmtNum } from './svg.ts'

const FORMATOS: Formato[] = [
  'retangular',
  'retangular_4lados',
  'deflexao',
  'azimute',
  'rumo',
  'utm',
  'confrontantes',
  'irregular',
  'nao_identificado',
]

export function gerarCroqui(bruto: unknown): CroquiResultado {
  const data = normalizar(bruto)
  if (!data) return falha('Dados do croqui ausentes ou malformados.')

  if (data.formato === 'nao_identificado' || !data.croqui_viavel) {
    return falha(
      data.observacoes?.trim() ||
        'A descrição do perímetro na matrícula não traz medidas suficientes para desenhar o croqui.',
      data,
    )
  }

  const avisos: string[] = []
  let construcao: { desenho: Desenho; erroFechamentoPct?: number | null } | { erro: string }

  switch (data.formato) {
    case 'retangular':
      construcao = construirRetangulo(data, avisos)
      break
    case 'retangular_4lados':
    case 'confrontantes':
      construcao = construirQuadrilatero(data, avisos)
      break
    case 'deflexao':
    case 'azimute':
    case 'rumo':
      construcao = construirCaminhada(data, avisos)
      break
    case 'utm':
      construcao = construirUtm(data, avisos)
      break
    case 'irregular':
      construcao = construirIrregular(data, avisos)
      break
    default:
      return falha(`Formato de descrição desconhecido: ${data.formato}`, data)
  }

  if ('erro' in construcao) return falha(construcao.erro, data)

  const { desenho } = construcao
  const erroFechamentoPct =
    'erroFechamentoPct' in construcao ? (construcao.erroFechamentoPct ?? null) : null

  // Área: shoelace do polígono desenhado — exceto no irregular, cujo desenho é
  // só proporção (medir o esquema seria inventar número)
  const areaCalculada = data.formato === 'irregular' ? null : arred2(shoelace(desenho.vertices))
  const areaDescrita = data.area_descrita_m2 ?? null

  let divergenciaAreaPct: number | null = null
  if (areaCalculada != null && areaDescrita != null && areaDescrita > 0) {
    divergenciaAreaPct = arred2((Math.abs(areaCalculada - areaDescrita) / areaDescrita) * 100)
    if (divergenciaAreaPct > 5) {
      avisos.push(
        `Área do desenho (${areaCalculada.toFixed(2).replace('.', ',')} m²) diverge da descrita na matrícula em ${divergenciaAreaPct.toFixed(1).replace('.', ',')}% — confira a descrição.`,
      )
    }
  }

  const svg = renderSvg(desenho, {
    ruaFrente: data.rua_frente,
    precisao: data.precisao ?? null,
    areaM2: areaCalculada ?? areaDescrita,
    areaDescritaM2: areaDescrita,
  })

  return {
    ok: true,
    motivo: null,
    svg,
    areaCalculadaM2: areaCalculada,
    areaDescritaM2: areaDescrita,
    divergenciaAreaPct,
    erroFechamentoPct: erroFechamentoPct != null ? arred2(erroFechamentoPct) : null,
    precisao: data.precisao ?? null,
    avisos,
  }
}

function falha(motivo: string, data?: CroquiData): CroquiResultado {
  return {
    ok: false,
    motivo,
    svg: null,
    areaCalculadaM2: null,
    areaDescritaM2: data?.area_descrita_m2 ?? null,
    divergenciaAreaPct: null,
    erroFechamentoPct: null,
    precisao: data?.precisao ?? null,
    avisos: [],
  }
}

const arred2 = (n: number) => Math.round(n * 100) / 100

// ─── Normalização do JSON do LLM ─────────────────────────────────────────────
// A skill pede números com ponto decimal, mas LLM escorrega ("5,10", número em
// string) — coagir aqui é mais barato que reprocessar.

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    // "1.234,56" → 1234.56 · "5,10" → 5.10 · "5.10" → 5.10
    const s = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function normalizar(bruto: unknown): CroquiData | null {
  if (!bruto || typeof bruto !== 'object') return null
  const d = bruto as Record<string, unknown>
  const formato = FORMATOS.includes(d.formato as Formato) ? (d.formato as Formato) : null
  if (!formato) return null

  const segmentos: Segmento[] = Array.isArray(d.segmentos)
    ? (d.segmentos as Record<string, unknown>[]).filter(Boolean).map((s) => ({
        de: str(s.de) ?? '',
        ate: str(s.ate) ?? '',
        tipo: s.tipo === 'curva' || s.tipo === 'chanfro' ? s.tipo : 'reta',
        distancia: num(s.distancia),
        confrontante: str(s.confrontante),
        azimute_raw: str(s.azimute_raw),
        rumo_raw: str(s.rumo_raw),
        angulo_interno_raw: str(s.angulo_interno_raw),
        deflexao_lado:
          s.deflexao_lado === 'direita' || s.deflexao_lado === 'esquerda' ? s.deflexao_lado : null,
        raio_m: num(s.raio_m),
        desenvolvimento_m: num(s.desenvolvimento_m),
      }))
    : []

  const verticesUtm = Array.isArray(d.vertices_utm)
    ? (d.vertices_utm as Record<string, unknown>[])
        .filter(Boolean)
        .map((v) => ({ e: num(v.e) ?? NaN, n: num(v.n) ?? NaN, rotulo: str(v.rotulo) }))
    : null

  const precisao: Precisao | null =
    d.precisao === 'exata' || d.precisao === 'aproximada' || d.precisao === 'esquematica'
      ? d.precisao
      : null

  return {
    numero_matricula: str(d.numero_matricula),
    formato,
    croqui_viavel: d.croqui_viavel === true,
    precisao,
    sentido_descricao:
      d.sentido_descricao === 'horario' || d.sentido_descricao === 'antihorario'
        ? d.sentido_descricao
        : 'indeterminado',
    rua_frente: str(d.rua_frente),
    testada: num(d.testada),
    profundidade: num(d.profundidade),
    area_descrita_m2: num(d.area_descrita_m2),
    area_calculada_m2: num(d.area_calculada_m2),
    segmentos,
    vertices_utm: verticesUtm,
    observacoes: str(d.observacoes),
  }
}
