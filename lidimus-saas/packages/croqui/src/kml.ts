// KML do perímetro, para abrir o lote no Google Earth / QGIS.
//
// O croqui é um polígono local em metros; KML é latitude/longitude. A ponte é a
// amarração UTM do documento, e ela só existe em dois casos:
//
//   • formato `utm` — os vértices JÁ são coordenadas UTM;
//   • formato `azimute`/`rumo` com coordenada de origem — o caminhamento nasce
//     em (0,0) com +x para leste e +y para norte (ver construirCaminhada), ou
//     seja, é um plano topocêntrico: basta somar E/N da origem.
//
// Em `deflexao` o desenho é girado por reorientar() e não tem norte absoluto;
// em `retangular`/`confrontantes`/`irregular` nunca houve norte. Nesses casos
// não se produz KML: um polígono no lugar errado do planeta é pior que nenhum.

import type { CroquiData, Desenho, Ponto } from './types.ts'
import { fusoDoMeridiano, utmParaLatLon, type LatLon } from './utm.ts'

export interface ResultadoKml {
  kml: string | null
  motivo: string | null
  avisos: string[]
  // true quando o perímetro TEM amarração UTM e só falta saber o fuso — a tela
  // então pede o fuso ao usuário em vez de simplesmente esconder a exportação
  pendeFuso: boolean
  // onde o primeiro vértice caiu, para a tela conferir o fuso antes de baixar
  ancora: LatLon | null
}

export interface OpcoesKml {
  // fuso e hemisfério informados na tela, quando o documento não os declara
  fusoUtm?: number | null
  hemisferioUtm?: 'N' | 'S' | null
}

const semKml = (motivo: string, pendeFuso = false): ResultadoKml => ({
  kml: null,
  motivo,
  avisos: [],
  pendeFuso,
  ancora: null,
})

export function gerarKml(data: CroquiData, desenho: Desenho, opcoes?: OpcoesKml): ResultadoKml {
  const geo = data.georreferencia ?? null

  // o que o documento declara tem precedência; o informado na tela é o socorro
  const fuso =
    geo?.fuso ??
    (geo?.meridiano_central != null ? fusoDoMeridiano(geo.meridiano_central) : null) ??
    (opcoes?.fusoUtm ?? null)
  const fusoVeioDaTela = geo?.fuso == null && geo?.meridiano_central == null && opcoes?.fusoUtm != null
  const avisos: string[] = []

  // Os vértices em UTM, conforme o caminho de amarração disponível
  let utm: Ponto[] | null = null
  if (data.formato === 'utm') {
    utm = desenho.vertices.map((v) => ({ x: v.x, y: v.y }))
  } else if (desenho.orientado && geo?.origem && Number.isFinite(geo.origem.e) && Number.isFinite(geo.origem.n)) {
    const { e, n } = geo.origem
    utm = desenho.vertices.map((v) => ({ x: e + v.x, y: n + v.y }))
  }

  if (!utm) {
    return semKml(
      desenho.orientado
        ? 'O documento não traz coordenada UTM de amarração do perímetro — sem ela o desenho não tem posição no globo.'
        : 'A descrição do perímetro não tem orientação geográfica. Só levantamentos por azimute, rumo ou coordenadas UTM podem virar KML.',
    )
  }
  if (fuso == null) {
    return semKml(
      'O documento não informa o fuso UTM (nem o meridiano central). Os mesmos valores de E/N existem nos 60 fusos, então situar o terreno exigiria adivinhar o fuso.',
      true,
    )
  }
  if (fusoVeioDaTela) {
    avisos.push(
      `Fuso ${fuso} informado na tela, não no documento — confira a posição do lote ao abrir o KML.`,
    )
  }

  // Quase todo o Brasil está no hemisfério sul; só Amapá, Roraima e o norte do
  // Pará e do Amazonas ficam ao norte. Sem declaração, assume-se sul e avisa-se.
  let hemisferio = geo?.hemisferio ?? opcoes?.hemisferioUtm ?? null
  if (!hemisferio) {
    hemisferio = 'S'
    avisos.push('Hemisfério não declarado no documento — o KML assume hemisfério sul.')
  }

  const datum = (geo?.datum ?? '').trim()
  if (/sad|corrego|córrego/i.test(datum)) {
    avisos.push(
      `Coordenadas em ${datum}: o KML é gerado em WGS84 sem transformação de datum, o que desloca o lote em algumas dezenas de metros.`,
    )
  }

  const pontos: LatLon[] = []
  for (const p of utm) {
    const ll = utmParaLatLon(p.x, p.y, fuso, hemisferio)
    if (!ll) return semKml('As coordenadas UTM do documento não formam um ponto válido no fuso declarado.')
    pontos.push(ll)
  }
  if (pontos.length < 3) return semKml('Menos de três vértices georreferenciados — não há polígono.')

  const rotulos = rotulosDeVertice(desenho, pontos.length)
  return {
    kml: montarKml(data, pontos, rotulos, fuso, hemisferio, datum),
    motivo: null,
    avisos,
    pendeFuso: false,
    ancora: pontos[0],
  }
}

// Rótulos dos vértices (V-1, P2…) na ordem do desenho, quando o texto os traz
function rotulosDeVertice(desenho: Desenho, total: number): (string | null)[] {
  const out: (string | null)[] = []
  for (let i = 0; i < total; i++) out.push(desenho.arestas[i]?.rotuloDe ?? null)
  return out
}

function montarKml(
  data: CroquiData,
  pontos: LatLon[],
  rotulos: (string | null)[],
  fuso: number,
  hemisferio: 'N' | 'S',
  datum: string,
): string {
  const nome = data.numero_matricula ? `Matrícula ${data.numero_matricula}` : 'Croqui do terreno'
  const area = data.area_descrita_m2
  const descricao = [
    data.rua_frente ? `Frente para ${data.rua_frente}.` : null,
    area != null ? `Área descrita: ${area.toLocaleString('pt-BR')} m².` : null,
    `Amarração UTM fuso ${fuso}${hemisferio}${datum ? `, datum ${datum}` : ''}.`,
    'Croqui gerado pelo Lidimus a partir da descrição do perímetro — desenho de conferência, não substitui levantamento topográfico.',
  ]
    .filter(Boolean)
    .join(' ')

  // O anel do KML precisa repetir o primeiro ponto no fim
  const anel = [...pontos, pontos[0]]
    .map((p) => `${p.lon.toFixed(8)},${p.lat.toFixed(8)},0`)
    .join('\n            ')

  const marcos = pontos
    .map((p, i) => {
      const rotulo = rotulos[i] ?? `V-${i + 1}`
      return `      <Placemark>
        <name>${esc(rotulo)}</name>
        <styleUrl>#lidimus-vertice</styleUrl>
        <Point><coordinates>${p.lon.toFixed(8)},${p.lat.toFixed(8)},0</coordinates></Point>
      </Placemark>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(nome)}</name>
    <description>${esc(descricao)}</description>
    <Style id="lidimus-perimetro">
      <LineStyle><color>ff2f2fd8</color><width>2.5</width></LineStyle>
      <PolyStyle><color>402f2fd8</color></PolyStyle>
    </Style>
    <Style id="lidimus-vertice">
      <IconStyle><scale>0.7</scale></IconStyle>
    </Style>
    <Placemark>
      <name>${esc(nome)}</name>
      <styleUrl>#lidimus-perimetro</styleUrl>
      <Polygon>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <outerBoundaryIs><LinearRing><coordinates>
            ${anel}
        </coordinates></LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Folder>
      <name>Vértices</name>
${marcos}
    </Folder>
  </Document>
</kml>
`
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
