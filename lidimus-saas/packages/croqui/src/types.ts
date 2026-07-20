// Tipos do JSON estruturado que a skill croqui-matricula devolve (ver
// apps/web/server/assets/skills/croqui-matricula.md, seção "SAÍDA OBRIGATÓRIA").
// A skill extrai; a geometria é calculada aqui, por código determinístico.

export type Formato =
  | 'retangular'
  | 'retangular_4lados'
  | 'deflexao'
  | 'azimute'
  | 'rumo'
  | 'utm'
  | 'confrontantes'
  | 'irregular'
  | 'nao_identificado'

export type Precisao = 'exata' | 'aproximada' | 'esquematica'

export interface Segmento {
  de: string
  ate: string
  tipo?: 'reta' | 'curva' | 'chanfro' | null
  distancia?: number | null
  confrontante?: string | null
  azimute_raw?: string | null
  rumo_raw?: string | null
  angulo_interno_raw?: string | null
  deflexao_lado?: 'direita' | 'esquerda' | null
  raio_m?: number | null
  desenvolvimento_m?: number | null
}

export interface VerticeUtm {
  e: number
  n: number
  rotulo?: string | null
}

export interface CroquiData {
  formato: Formato
  croqui_viavel: boolean
  precisao?: Precisao | null
  sentido_descricao?: 'horario' | 'antihorario' | 'indeterminado' | null
  rua_frente?: string | null
  testada?: number | null
  profundidade?: number | null
  area_descrita_m2?: number | null
  area_calculada_m2?: number | null
  segmentos: Segmento[]
  vertices_utm?: VerticeUtm[] | null
  observacoes?: string | null
}

// ─── Geometria interna ────────────────────────────────────────────────────────

export interface Ponto {
  x: number
  y: number
}

// Aresta pronta para desenho: geometria em coords de terreno (y para cima) + rótulos
export interface Aresta {
  a: Ponto
  b: Ponto
  distancia: number | null
  confrontante: string | null
  tipo: 'reta' | 'curva' | 'chanfro'
  raioM: number | null
  // lado da curva em relação ao caminhamento, já na orientação final do desenho
  curvaLado: 'direita' | 'esquerda' | null
  rotuloDe: string | null
}

export interface Desenho {
  vertices: Ponto[]
  arestas: Aresta[]
  // true = o desenho tem orientação geográfica real (azimute/rumo/utm) — mostra o norte
  orientado: boolean
}

export interface CroquiResultado {
  ok: boolean
  motivo: string | null
  svg: string | null
  areaCalculadaM2: number | null
  areaDescritaM2: number | null
  divergenciaAreaPct: number | null
  erroFechamentoPct: number | null
  precisao: Precisao | null
  avisos: string[]
}
