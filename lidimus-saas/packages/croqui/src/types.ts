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

// Amarração do perímetro ao globo, quando o documento a declara. Sem fuso não
// há como converter UTM em latitude/longitude: os mesmos E/N caem em qualquer
// um dos 60 fusos. Por isso nada aqui é inferido — só o que o texto declara.
export interface Georreferencia {
  datum?: string | null
  fuso?: number | null
  hemisferio?: 'N' | 'S' | null
  meridiano_central?: number | null
  // Coordenada do vértice de partida, nos levantamentos que descrevem o
  // perímetro por azimutes a partir de um ponto amarrado
  origem?: VerticeUtm | null
}

export interface CroquiData {
  // Número da matrícula do documento (só dígitos), extraído do cabeçalho. Não
  // participa da geometria — serve para identificar o documento no painel.
  numero_matricula?: string | null
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
  georreferencia?: Georreferencia | null
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
  // KML do perímetro em coordenadas geográficas, quando o desenho pôde ser
  // georreferenciado. `kmlMotivo` diz por que não, para a tela explicar.
  kml: string | null
  kmlMotivo: string | null
}
