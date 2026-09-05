import { describe, expect, it } from 'vitest'
import { gerarCroqui } from './index.ts'
import { fusoDoMeridiano, meridianoCentral, utmParaLatLon } from './utm.ts'

describe('utm', () => {
  it('converte E/N do fuso 23S para latitude e longitude', () => {
    // V-1 do memorial da matrícula 44.996, em Guararema/SP (≈ -23,41 / -46,03)
    const ll = utmParaLatLon(386509.8893, 7420035.359, 23, 'S')!
    expect(ll.lat).toBeGreaterThan(-23.5)
    expect(ll.lat).toBeLessThan(-23.3)
    expect(ll.lon).toBeGreaterThan(-46.2)
    expect(ll.lon).toBeLessThan(-45.9)
  })

  it('fecha o ciclo com o meridiano central', () => {
    expect(meridianoCentral(23)).toBe(-45)
    expect(fusoDoMeridiano(-45)).toBe(23)
    expect(fusoDoMeridiano(-44)).toBeNull()
  })

  it('recusa fuso fora de faixa', () => {
    expect(utmParaLatLon(386509, 7420035, 0, 'S')).toBeNull()
    expect(utmParaLatLon(386509, 7420035, 61, 'S')).toBeNull()
  })
})

const seg = (az: string, dist: number, de: string, ate: string) => ({
  de, ate, tipo: 'reta', distancia: dist, confrontante: null,
  azimute_raw: az, rumo_raw: null, angulo_interno_raw: null,
  deflexao_lado: null, raio_m: null, desenvolvimento_m: null,
})

// Quadrado de 100 m amarrado num vértice conhecido — geometria simples de conferir
const quadrado = {
  formato: 'azimute',
  croqui_viavel: true,
  precisao: 'exata',
  numero_matricula: '44996',
  segmentos: [
    seg("90°00'00\"", 100, 'V-1', 'V-2'),
    seg("180°00'00\"", 100, 'V-2', 'V-3'),
    seg("270°00'00\"", 100, 'V-3', 'V-4'),
    seg("0°00'00\"", 100, 'V-4', 'V-1'),
  ],
  georreferencia: {
    datum: 'SIRGAS2000',
    fuso: 23,
    hemisferio: 'S',
    origem: { rotulo: 'V-1', e: 386509.8893, n: 7420035.359 },
  },
}

describe('gerarKml', () => {
  it('gera o KML quando há amarração UTM e fuso', () => {
    const r = gerarCroqui(quadrado)
    expect(r.ok).toBe(true)
    expect(r.kmlMotivo).toBeNull()
    expect(r.kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">')
    expect(r.kml).toContain('Matrícula 44996')
    expect(r.kml).toContain('fuso 23S')

    // o anel fecha: 4 vértices + repetição do primeiro
    const anel = r.kml!.match(/<LinearRing><coordinates>([\s\S]*?)<\/coordinates>/)![1]
    const coords = anel.trim().split(/\s+/)
    expect(coords).toHaveLength(5)
    expect(coords[0]).toBe(coords[4])

    // um lado de 100 m no equador do fuso ≈ 0,001° de longitude
    const [lon1, lat1] = coords[0].split(',').map(Number)
    const [lon2] = coords[1].split(',').map(Number)
    expect(lat1).toBeGreaterThan(-23.5)
    expect(lat1).toBeLessThan(-23.3)
    expect(Math.abs(lon2 - lon1)).toBeGreaterThan(0.0008)
    expect(Math.abs(lon2 - lon1)).toBeLessThan(0.0012)
  })

  it('assume hemisfério sul e avisa quando o documento não declara', () => {
    const semHem = { ...quadrado, georreferencia: { ...quadrado.georreferencia, hemisferio: null } }
    const r = gerarCroqui(semHem)
    expect(r.kml).not.toBeNull()
    expect(r.avisos.join(' ')).toContain('hemisfério sul')
  })

  it('deriva o fuso do meridiano central quando o fuso não vem declarado', () => {
    const porMc = {
      ...quadrado,
      georreferencia: { ...quadrado.georreferencia, fuso: null, meridiano_central: -45 },
    }
    expect(gerarCroqui(porMc).kml).toContain('fuso 23S')
  })

  it('não gera KML sem fuso nem meridiano central', () => {
    const semFuso = {
      ...quadrado,
      georreferencia: { ...quadrado.georreferencia, fuso: null, meridiano_central: null },
    }
    const r = gerarCroqui(semFuso)
    expect(r.ok).toBe(true)
    expect(r.kml).toBeNull()
    expect(r.kmlMotivo).toContain('fuso UTM')
  })

  it('não gera KML sem coordenada de amarração', () => {
    const semOrigem = { ...quadrado, georreferencia: { fuso: 23, hemisferio: 'S' } }
    const r = gerarCroqui(semOrigem)
    expect(r.kml).toBeNull()
    expect(r.kmlMotivo).toContain('amarração')
  })

  it('não gera KML para desenho sem orientação geográfica', () => {
    const retangular = {
      formato: 'retangular',
      croqui_viavel: true,
      testada: 10,
      profundidade: 30,
      segmentos: [],
      georreferencia: { fuso: 23, hemisferio: 'S', origem: { e: 386509.8893, n: 7420035.359 } },
    }
    const r = gerarCroqui(retangular)
    expect(r.ok).toBe(true)
    expect(r.kml).toBeNull()
    expect(r.kmlMotivo).toContain('orientação geográfica')
  })

  it('sinaliza que só falta o fuso quando há amarração', () => {
    const semFuso = {
      ...quadrado,
      georreferencia: { ...quadrado.georreferencia, fuso: null, meridiano_central: null },
    }
    const r = gerarCroqui(semFuso)
    expect(r.kmlPendeFuso).toBe(true)
    // sem amarração nenhuma não adianta pedir fuso
    expect(gerarCroqui({ ...quadrado, georreferencia: null }).kmlPendeFuso).toBe(false)
  })

  it('usa o fuso informado na tela quando o documento não o declara', () => {
    const semFuso = {
      ...quadrado,
      georreferencia: { ...quadrado.georreferencia, fuso: null, meridiano_central: null },
    }
    const r = gerarCroqui(semFuso, { fusoUtm: 23, hemisferioUtm: 'S' })
    expect(r.kml).toContain('fuso 23S')
    expect(r.kmlPendeFuso).toBe(false)
    expect(r.avisos.join(' ')).toContain('informado na tela')
    // e a âncora volta para a tela conferir onde caiu
    expect(r.kmlAncora!.lat).toBeGreaterThan(-23.5)
    expect(r.kmlAncora!.lat).toBeLessThan(-23.3)
  })

  it('o fuso do documento vence o informado na tela', () => {
    const r = gerarCroqui(quadrado, { fusoUtm: 19, hemisferioUtm: 'S' })
    expect(r.kml).toContain('fuso 23S')
    expect(r.avisos.join(' ')).not.toContain('informado na tela')
  })

  it('fuso errado leva o lote para longe — é o que a conferência na tela mostra', () => {
    const semFuso = {
      ...quadrado,
      georreferencia: { ...quadrado.georreferencia, fuso: null, meridiano_central: null },
    }
    const certo = gerarCroqui(semFuso, { fusoUtm: 23, hemisferioUtm: 'S' })
    const errado = gerarCroqui(semFuso, { fusoUtm: 19, hemisferioUtm: 'S' })
    expect(Math.abs(certo.kmlAncora!.lon - errado.kmlAncora!.lon)).toBeGreaterThan(20)
  })

  it('escapa XML nos rótulos vindos do documento', () => {
    const comAspas = {
      ...quadrado,
      numero_matricula: 'A&B<x>',
    }
    const r = gerarCroqui(comAspas)
    expect(r.kml).toContain('A&amp;B&lt;x&gt;')
    expect(r.kml).not.toContain('A&B<x>')
  })
})
