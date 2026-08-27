import { describe, expect, it } from 'vitest'
import { analisarPdf } from './arquivo.ts'
import {
  FIXTURE_229216,
  FIXTURE_61601,
  FIXTURE_COWBOY,
  FIXTURE_COWBOY3,
  FIXTURE_MAIRINQUE,
  FIXTURE_TRUNCADO,
  construirPdfDeTeste,
} from './fixtures.ts'
import type { Ancoras, Cnm, ConsultaOnr, PericiaArquivo, RespostaOnr, SeloTjsp } from './tipos.ts'
import { calcularAutenticidade } from './veredito.ts'

const SEM_ANCORAS: Ancoras = { selo: null, cnm: null }

function selo(overrides: Partial<SeloTjsp> = {}): SeloTjsp {
  return {
    codigo: '9999991CE0000000000030184',
    cns: '999999',
    natureza: '1',
    ato: 'CE',
    infoAto: '0000000000030',
    ano: '18',
    dv: '4',
    dvFecha: true,
    corrigidoPorDv: false,
    origem: 'texto_ocr',
    ...overrides,
  }
}

function cnm(overrides: Partial<Cnm> = {}): Cnm {
  return {
    codigo: '14557.2.0000001-72',
    cns: '14557',
    livro: '2',
    numeroOrdem: '0000001',
    dv: '72',
    dvFecha: true,
    livroEhRegistroGeral: true,
    corrigidoPorDv: false,
    origem: 'texto_ocr',
    ...overrides,
  }
}

function respostaOnr(overrides: Partial<RespostaOnr> = {}): RespostaOnr {
  return {
    cartorio: 'OFICIAL DE REGISTRO DE IMÓVEIS DA COMARCA DE MAIRINQUE - SP',
    cns: '145573',
    validade: '2099-01-01',
    signingTime: '2025-10-13T13:10:34Z',
    nomeSignatario: null,
    politicaAssinatura: 'PA_PAdES_AD_RT_v1_0',
    temErrosDeValidacao: false,
    temAvisosDeValidacao: false,
    consultadoEm: new Date().toISOString(),
    ...overrides,
  }
}

describe('calcularAutenticidade — os seis casos do plano', () => {
  it('Cowboy: iLovePDF sem CreationDate → editado', () => {
    const r = calcularAutenticidade({
      pericia: analisarPdf(FIXTURE_COWBOY),
      ancoras: SEM_ANCORAS,
      onr: null,
    })
    expect(r.classificacao).toBe('editado')
    expect(r.score).toBe(20)
  })

  it('Cowboy3: mesmo padrão da Cowboy → editado', () => {
    const r = calcularAutenticidade({
      pericia: analisarPdf(FIXTURE_COWBOY3),
      ancoras: SEM_ANCORAS,
      onr: null,
    })
    expect(r.classificacao).toBe('editado')
  })

  it('Mairinque: Ghostscript + ONR confirma → copia_verificavel, com aviso de vencimento', () => {
    const onr: ConsultaOnr = {
      status: 'consultado',
      resposta: respostaOnr({ validade: '2025-11-12' }), // vencida em relação a "hoje" do teste
    }
    const r = calcularAutenticidade({
      pericia: analisarPdf(FIXTURE_MAIRINQUE),
      ancoras: SEM_ANCORAS,
      onr,
      onrCodigo: 'FT8Y4-MP5ZW-347UB-ULSG2',
    })
    expect(r.classificacao).toBe('copia_verificavel')
    expect(r.indicios.some((i) => i.codigo === 'certidao_vencida')).toBe(true)
    expect(r.linksDeConferencia).toContainEqual({
      rotulo: 'Conferir a assinatura na ONR',
      url: 'https://assinador-web.onr.org.br/docs/FT8Y4-MP5ZW-347UB-ULSG2',
    })
  })

  it('229.216 e 61601: Print To PDF sem âncora nenhuma → reimpresso', () => {
    for (const fixture of [FIXTURE_229216, FIXTURE_61601]) {
      const r = calcularAutenticidade({
        pericia: analisarPdf(fixture),
        ancoras: SEM_ANCORAS,
        onr: null,
      })
      expect(r.classificacao).toBe('reimpresso')
    }
  })

  it('arquivo truncado → arquivo_danificado, mesmo que tudo mais pareça bom', () => {
    const r = calcularAutenticidade({
      pericia: analisarPdf(FIXTURE_TRUNCADO),
      ancoras: { selo: selo(), cnm: cnm() }, // âncoras válidas não salvam um arquivo cortado
      onr: { status: 'consultado', resposta: respostaOnr() },
    })
    expect(r.classificacao).toBe('arquivo_danificado')
    expect(r.score).toBe(0)
  })
})

describe('calcularAutenticidade — cruzamentos e prioridade', () => {
  it('selo que não fecha vira indicios_de_adulteracao mesmo com ONR confirmando', () => {
    const r = calcularAutenticidade({
      pericia: analisarPdf(construirPdfDeTeste({ paginas: 1 })),
      ancoras: { selo: selo({ dvFecha: false }), cnm: null },
      onr: { status: 'consultado', resposta: respostaOnr() },
    })
    expect(r.classificacao).toBe('indicios_de_adulteracao')
    expect(r.indicios.some((i) => i.codigo === 'selo_nao_fecha')).toBe(true)
  })

  it('CNM não fecha vira indicios_de_adulteracao', () => {
    const r = calcularAutenticidade({
      pericia: analisarPdf(construirPdfDeTeste({ paginas: 1 })),
      ancoras: { selo: null, cnm: cnm({ dvFecha: false }) },
      onr: null,
    })
    expect(r.classificacao).toBe('indicios_de_adulteracao')
    expect(r.indicios.some((i) => i.codigo === 'cnm_nao_fecha')).toBe(true)
  })

  it('número da matrícula do cabeçalho divergindo do CNM é adulteração', () => {
    const r = calcularAutenticidade({
      pericia: analisarPdf(construirPdfDeTeste({ paginas: 1 })),
      ancoras: { selo: null, cnm: cnm({ numeroOrdem: '0000001' }) },
      onr: null,
      cabecalho: { numeroMatricula: '9.999.999' },
    })
    expect(r.classificacao).toBe('indicios_de_adulteracao')
    expect(r.indicios.some((i) => i.codigo === 'numero_matricula_diverge_do_cnm')).toBe(true)
  })

  it('cartório do cabeçalho divergindo do confirmado pela ONR é adulteração', () => {
    const r = calcularAutenticidade({
      pericia: analisarPdf(construirPdfDeTeste({ paginas: 1 })),
      ancoras: SEM_ANCORAS,
      onr: { status: 'consultado', resposta: respostaOnr({ cartorio: 'CARTÓRIO DE OUTRA COMARCA' }) },
      cabecalho: { cartorio: 'OFICIAL DE REGISTRO DE IMÓVEIS DA COMARCA DE MAIRINQUE' },
    })
    expect(r.classificacao).toBe('indicios_de_adulteracao')
    expect(r.indicios.some((i) => i.codigo === 'cartorio_diverge_da_onr')).toBe(true)
  })

  it('CNS divergente entre selo e ONR é adulteração', () => {
    const r = calcularAutenticidade({
      pericia: analisarPdf(construirPdfDeTeste({ paginas: 1 })),
      ancoras: { selo: selo({ cns: '111111' }), cnm: null },
      onr: { status: 'consultado', resposta: respostaOnr({ cns: '999999' }) },
    })
    expect(r.classificacao).toBe('indicios_de_adulteracao')
    expect(r.indicios.some((i) => i.codigo === 'cns_diverge_entre_fontes')).toBe(true)
  })

  it('reimpressão detectada pela diferença entre signingTime da ONR e ModDate do arquivo', () => {
    const pdf = construirPdfDeTeste({ paginas: 1, modDate: "D:20251013162200Z" })
    const r = calcularAutenticidade({
      pericia: analisarPdf(pdf),
      ancoras: SEM_ANCORAS,
      onr: { status: 'consultado', resposta: respostaOnr({ signingTime: '2025-10-13T13:10:34Z' }) },
    })
    expect(r.indicios.some((i) => i.codigo === 'reimpressao_pos_assinatura')).toBe(true)
  })

  it('não aponta divergência quando falta um dos dois lados a comparar', () => {
    const r = calcularAutenticidade({
      pericia: analisarPdf(construirPdfDeTeste({ paginas: 1 })),
      ancoras: SEM_ANCORAS,
      onr: { status: 'consultado', resposta: respostaOnr({ cartorio: null }) },
      cabecalho: { cartorio: 'QUALQUER CARTÓRIO' },
    })
    expect(r.indicios.some((i) => i.codigo === 'cartorio_diverge_da_onr')).toBe(false)
  })

  it('original_assinado quando a assinatura local cobre o arquivo e não há rerender/editor', () => {
    const pericia: PericiaArquivo = {
      versaoHeader: '1.7',
      info: { creationDate: null, modDate: null, producer: null, creator: null, author: null, title: null },
      xmp: null,
      contagens: {
        eof: 1,
        startxref: 1,
        prev: 0,
        tipoSig: 1,
        byteRange: 1,
        acroForm: 1,
        encrypt: 0,
        subtypeImage: 0,
        tipoFont: 2,
      },
      sha256: 'x'.repeat(64),
      paginas: 3,
      truncado: false,
      indicios: [],
    }
    const r = calcularAutenticidade({ pericia, ancoras: SEM_ANCORAS, onr: null })
    expect(r.classificacao).toBe('original_assinado')
    expect(r.score).toBe(100)
  })

  it('nunca lança para entrada mínima (sem âncoras, sem ONR, arquivo comum)', () => {
    expect(() =>
      calcularAutenticidade({
        pericia: analisarPdf(construirPdfDeTeste({ paginas: 1 })),
        ancoras: SEM_ANCORAS,
        onr: null,
      }),
    ).not.toThrow()
  })
})

describe('linksDeConferencia', () => {
  it('inclui o link do TJSP quando há selo, mesmo sem ONR', () => {
    const r = calcularAutenticidade({
      pericia: analisarPdf(construirPdfDeTeste({ paginas: 1 })),
      ancoras: { selo: selo(), cnm: null },
      onr: null,
    })
    expect(r.linksDeConferencia).toContainEqual({
      rotulo: 'Conferir o Selo Digital no site do TJSP',
      url: 'https://selodigital.tjsp.jus.br/?r=9999991CE0000000000030184',
    })
  })

  it('não inventa links quando não há nem selo nem código da ONR', () => {
    const r = calcularAutenticidade({
      pericia: analisarPdf(construirPdfDeTeste({ paginas: 1 })),
      ancoras: SEM_ANCORAS,
      onr: null,
    })
    expect(r.linksDeConferencia).toHaveLength(0)
  })
})
