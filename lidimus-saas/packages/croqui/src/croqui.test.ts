import { describe, expect, it } from 'vitest'
import { fmtNum, gerarCroqui } from './index.ts'
import type { CroquiData, Segmento } from './index.ts'

const seg = (parcial: Partial<Segmento>): Segmento => ({
  de: 'frente',
  ate: 'lateral_direita',
  tipo: 'reta',
  distancia: null,
  confrontante: null,
  azimute_raw: null,
  rumo_raw: null,
  angulo_interno_raw: null,
  deflexao_lado: null,
  raio_m: null,
  desenvolvimento_m: null,
  ...parcial,
})

const base = (parcial: Partial<CroquiData>): CroquiData => ({
  formato: 'retangular',
  croqui_viavel: true,
  precisao: 'aproximada',
  sentido_descricao: 'horario',
  rua_frente: null,
  testada: null,
  profundidade: null,
  area_descrita_m2: null,
  area_calculada_m2: null,
  segmentos: [],
  vertices_utm: null,
  observacoes: null,
  ...parcial,
})

describe('retangular simples (exemplo da skill: 5,10m × 34,50m)', () => {
  const data = base({
    formato: 'retangular',
    rua_frente: 'Rua Luiz Gama',
    testada: 5.1,
    profundidade: 34.5,
    area_descrita_m2: 176,
    area_calculada_m2: 175.95,
    segmentos: [
      seg({ de: 'frente', ate: 'lateral_direita', confrontante: 'Rua Luiz Gama' }),
      seg({ de: 'lateral_direita', ate: 'fundos' }),
      seg({ de: 'fundos', ate: 'lateral_esquerda' }),
      seg({ de: 'lateral_esquerda', ate: 'frente' }),
    ],
  })

  it('desenha e calcula a área testada × profundidade', () => {
    const r = gerarCroqui(data)
    expect(r.ok).toBe(true)
    expect(r.areaCalculadaM2).toBeCloseTo(175.95, 2)
    expect(r.svg).toContain('5,10 m')
    expect(r.svg).toContain('34,50 m')
    expect(r.svg).toContain('Rua Luiz Gama')
  })

  it('não mostra seta norte — retângulo não tem orientação real', () => {
    const r = gerarCroqui(data)
    expect(r.svg).not.toContain('<g class="cro-norte"')
  })

  it('aceita números como string com vírgula (deslize comum do LLM)', () => {
    const r = gerarCroqui({ ...data, testada: '5,10', profundidade: '34,50' })
    expect(r.ok).toBe(true)
    expect(r.areaCalculadaM2).toBeCloseTo(175.95, 2)
  })
})

describe('retangular 4 lados (trapézio)', () => {
  it('resolve o trapézio com frente ≠ fundos', () => {
    const r = gerarCroqui(
      base({
        formato: 'retangular_4lados',
        area_descrita_m2: 225,
        segmentos: [
          seg({ de: 'frente', ate: 'lateral_direita', distancia: 10 }),
          seg({ de: 'lateral_direita', ate: 'fundos', distancia: 20.04 }),
          seg({ de: 'fundos', ate: 'lateral_esquerda', distancia: 12.5 }),
          seg({ de: 'lateral_esquerda', ate: 'frente', distancia: 20.04 }),
        ],
      }),
    )
    expect(r.ok).toBe(true)
    // trapézio de bases 10 e 12,5 com altura ~20 → área ~225 m²
    expect(r.areaCalculadaM2).toBeGreaterThan(220)
    expect(r.areaCalculadaM2).toBeLessThan(230)
    expect(r.avisos.join(' ')).toContain('trapézio')
  })

  it('desenha lote de esquina com frente ≠ fundos e chanfro sem medida (caso Av. Condessa de São Joaquim)', () => {
    // Matrícula 153.288: frente 17,30m, fundos 17,15m, 28,15m de ambos os lados,
    // chanfro na esquina não quantificado. As 4 medidas bastam — trapézio viável.
    const r = gerarCroqui(
      base({
        formato: 'retangular_4lados',
        rua_frente: 'Avenida Condessa de São Joaquim',
        segmentos: [
          seg({ de: 'frente', ate: 'lateral_direita', distancia: 17.3, confrontante: 'Avenida Condessa de São Joaquim' }),
          seg({ de: 'lateral_direita', ate: 'fundos', distancia: 28.15 }),
          seg({ de: 'fundos', ate: 'lateral_esquerda', distancia: 17.15 }),
          seg({ de: 'lateral_esquerda', ate: 'frente', distancia: 28.15 }),
          // chanfro citado mas sem medida — deve ser ignorado, não bloquear o croqui
          seg({ de: 'chanfro', ate: 'chanfro', tipo: 'chanfro', distancia: null }),
        ],
      }),
    )
    expect(r.ok).toBe(true)
    // trapézio de bases 17,30 e 17,15 com altura ~28,15 → área ~485 m²
    expect(r.areaCalculadaM2).toBeGreaterThan(480)
    expect(r.areaCalculadaM2).toBeLessThan(490)
    expect(r.avisos.join(' ')).toContain('trapézio')
    expect(r.svg).toContain('17,30 m')
    expect(r.svg).toContain('17,15 m')
  })

  it('corta o chanfro no canto', () => {
    const r = gerarCroqui(
      base({
        formato: 'retangular_4lados',
        segmentos: [
          seg({ de: 'frente', ate: 'chanfro', distancia: 10 }),
          seg({ de: 'chanfro', ate: 'lateral_direita', tipo: 'chanfro', distancia: 2 }),
          seg({ de: 'lateral_direita', ate: 'fundos', distancia: 20 }),
          seg({ de: 'fundos', ate: 'lateral_esquerda', distancia: 10 }),
          seg({ de: 'lateral_esquerda', ate: 'frente', distancia: 20 }),
        ],
      }),
    )
    expect(r.ok).toBe(true)
    // canto cortado: área = 200 − e²/2, com e = 2/(2·sen45°) ≈ 1,414 → ~199
    expect(r.areaCalculadaM2).toBeGreaterThan(195)
    expect(r.areaCalculadaM2).toBeLessThan(200)
    expect(r.svg).toContain('2,00 m')
  })
})

describe('confrontantes com medidas', () => {
  it('desenha o retângulo e rotula confrontantes', () => {
    const r = gerarCroqui(
      base({
        formato: 'confrontantes',
        segmentos: [
          seg({ de: 'frente', ate: 'lateral_direita', distancia: 12, confrontante: 'Rua das Flores' }),
          seg({ de: 'lateral_direita', ate: 'fundos', distancia: 25, confrontante: 'prédio nº 239' }),
          seg({ de: 'fundos', ate: 'lateral_esquerda', distancia: 12, confrontante: 'Espólio de Fulano' }),
          seg({ de: 'lateral_esquerda', ate: 'frente', distancia: 25 }),
        ],
      }),
    )
    expect(r.ok).toBe(true)
    expect(r.areaCalculadaM2).toBeCloseTo(300, 0)
    expect(r.svg).toContain('prédio nº 239')
    expect(r.svg).toContain('Espólio de Fulano')
  })
})

describe('deflexão com ângulo interno', () => {
  it('retângulo descrito por deflexões à direita fecha e mede certo', () => {
    const r = gerarCroqui(
      base({
        formato: 'deflexao',
        precisao: 'exata',
        segmentos: [
          seg({ de: 'Ponto 1', ate: 'Ponto 2', distancia: 10 }),
          seg({ de: 'Ponto 2', ate: 'Ponto 3', distancia: 30, angulo_interno_raw: '90°', deflexao_lado: 'direita' }),
          seg({ de: 'Ponto 3', ate: 'Ponto 4', distancia: 10, angulo_interno_raw: '90°', deflexao_lado: 'direita' }),
          seg({ de: 'Ponto 4', ate: 'Ponto 1', distancia: 30, angulo_interno_raw: '90°', deflexao_lado: 'direita' }),
        ],
      }),
    )
    expect(r.ok).toBe(true)
    expect(r.areaCalculadaM2).toBeCloseTo(300, 1)
    expect(r.erroFechamentoPct).toBeLessThan(0.1)
    expect(r.svg).toContain('Ponto 2')
  })

  it('perímetro que não fecha ganha aviso e aresta de fechamento', () => {
    const r = gerarCroqui(
      base({
        formato: 'deflexao',
        segmentos: [
          seg({ de: 'P1', ate: 'P2', distancia: 10 }),
          seg({ de: 'P2', ate: 'P3', distancia: 30, angulo_interno_raw: '90°', deflexao_lado: 'direita' }),
          seg({ de: 'P3', ate: 'P4', distancia: 14, angulo_interno_raw: '90°', deflexao_lado: 'direita' }),
          seg({ de: 'P4', ate: 'P1', distancia: 30, angulo_interno_raw: '90°', deflexao_lado: 'direita' }),
        ],
      }),
    )
    expect(r.ok).toBe(true)
    expect(r.erroFechamentoPct).toBeGreaterThan(2)
    expect(r.avisos.join(' ')).toContain('não fecha')
  })

  it('ângulo ilegível interrompe com erro claro', () => {
    const r = gerarCroqui(
      base({
        formato: 'deflexao',
        segmentos: [
          seg({ de: 'P1', ate: 'P2', distancia: 10 }),
          seg({ de: 'P2', ate: 'P3', distancia: 30, angulo_interno_raw: '83°66\'19"', deflexao_lado: 'direita' }),
          seg({ de: 'P3', ate: 'P1', distancia: 30, angulo_interno_raw: '90°', deflexao_lado: 'direita' }),
        ],
      }),
    )
    expect(r.ok).toBe(false)
    expect(r.motivo).toContain('ilegível')
  })
})

describe('azimute absoluto', () => {
  it('quadrado por azimutes fecha, mede 100 m² e mostra o norte', () => {
    const r = gerarCroqui(
      base({
        formato: 'azimute',
        precisao: 'exata',
        segmentos: [
          seg({ de: 'P1', ate: 'P2', distancia: 10, azimute_raw: '0°' }),
          seg({ de: 'P2', ate: 'P3', distancia: 10, azimute_raw: '90°' }),
          seg({ de: 'P3', ate: 'P4', distancia: 10, azimute_raw: '180°' }),
          seg({ de: 'P4', ate: 'P1', distancia: 10, azimute_raw: '270°' }),
        ],
      }),
    )
    expect(r.ok).toBe(true)
    expect(r.areaCalculadaM2).toBeCloseTo(100, 1)
    expect(r.erroFechamentoPct).toBeLessThan(0.1)
    expect(r.svg).toContain('cro-norte')
  })
})

describe('rumo N/S com E/W', () => {
  it('quadrado rotacionado por rumos fecha e mede 100 m²', () => {
    const r = gerarCroqui(
      base({
        formato: 'rumo',
        segmentos: [
          seg({ de: 'P1', ate: 'P2', distancia: 10, rumo_raw: "N 45° E" }),
          seg({ de: 'P2', ate: 'P3', distancia: 10, rumo_raw: "S 45° E" }),
          seg({ de: 'P3', ate: 'P4', distancia: 10, rumo_raw: "S 45° W" }),
          seg({ de: 'P4', ate: 'P1', distancia: 10, rumo_raw: "N 45° O" }),
        ],
      }),
    )
    expect(r.ok).toBe(true)
    expect(r.areaCalculadaM2).toBeCloseTo(100, 1)
    expect(r.erroFechamentoPct).toBeLessThan(0.1)
  })
})

describe('coordenadas UTM', () => {
  it('plota vértices, calcula distâncias e área', () => {
    const r = gerarCroqui(
      base({
        formato: 'utm',
        precisao: 'exata',
        segmentos: [],
        vertices_utm: [
          { e: 345600, n: 7401200, rotulo: 'P1' },
          { e: 345630, n: 7401200, rotulo: 'P2' },
          { e: 345630, n: 7401220, rotulo: 'P3' },
          { e: 345600, n: 7401220, rotulo: 'P4' },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    expect(r.areaCalculadaM2).toBeCloseTo(600, 1)
    expect(r.avisos.join(' ')).toContain('calculadas')
    expect(r.svg).toContain('P1')
    expect(r.svg).toContain('cro-norte')
  })
})

describe('polígono irregular', () => {
  it('desenha esquema fechado sem inventar área', () => {
    const r = gerarCroqui(
      base({
        formato: 'irregular',
        precisao: 'esquematica',
        segmentos: [10, 12, 8, 15, 9].map((d, i) =>
          seg({ de: `lado ${i + 1}`, ate: `lado ${i + 2}`, distancia: d }),
        ),
      }),
    )
    expect(r.ok).toBe(true)
    expect(r.areaCalculadaM2).toBeNull()
    expect(r.avisos.join(' ')).toContain('esquemático')
    expect(r.svg).toContain('15,00 m')
  })
})

describe('validações', () => {
  it('croqui_viavel=false devolve o motivo da skill', () => {
    const r = gerarCroqui(
      base({ croqui_viavel: false, observacoes: 'Descrição sem medidas lineares.' }),
    )
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('Descrição sem medidas lineares.')
    expect(r.svg).toBeNull()
  })

  it('formato desconhecido ou payload malformado falham sem lançar', () => {
    expect(gerarCroqui(null).ok).toBe(false)
    expect(gerarCroqui({ formato: 'xyz' }).ok).toBe(false)
    expect(gerarCroqui('texto').ok).toBe(false)
  })

  it('divergência de área acima de 5% gera aviso', () => {
    const r = gerarCroqui(
      base({ formato: 'retangular', testada: 10, profundidade: 10, area_descrita_m2: 90 }),
    )
    expect(r.ok).toBe(true)
    expect(r.divergenciaAreaPct).toBeGreaterThan(5)
    expect(r.avisos.join(' ')).toContain('diverge')
  })

  it('retangular sem medidas falha com mensagem clara', () => {
    const r = gerarCroqui(base({ formato: 'retangular' }))
    expect(r.ok).toBe(false)
    expect(r.motivo).toContain('Testada e profundidade')
  })
})

describe('fmtNum', () => {
  it('formata em pt-BR com milhares', () => {
    expect(fmtNum(1234.5)).toBe('1.234,50')
    expect(fmtNum(5.1)).toBe('5,10')
    expect(fmtNum(50, 0)).toBe('50')
  })
})
