import { afterEach, describe, expect, it, vi } from 'vitest'
import { consultarOnr, extrairCodigoOnrDoTexto, limparCacheOnr } from './onr.ts'

const CODIGO = 'FT8Y4-MP5ZW-347UB-ULSG2'

// Réplica do formato investigado no plano (§4), incluindo os campos sensíveis
// que a resposta real traz e que este módulo tem que descartar.
const RESPOSTA_BRUTA_ONR = {
  document: {
    metadata: {
      cartorio: 'OFICIAL DE REGISTRO DE IMÓVEIS DA COMARCA DE MAIRINQUE - SP',
      cns: '145573',
      validade: '2025-11-12',
    },
    originalFile: {
      name: 'matricula.pdf',
      length: 123456,
      url: 'https://assinador-web.onr.org.br/download?access_ticket=SEGREDO-TEMPORARIO',
    },
  },
  signers: [
    {
      signingTime: '2025-10-13T13:10:34Z',
      name: 'FULANO DE TAL',
      cpf: '***.456.789-**',
      birthDate: '1980-01-01',
      rg: '12.345.678-9',
      signature: 'QUJDMTIzYmFzZTY0Zmlyd2E9PQ==',
      certificate: { issuer: 'AC Certisign RFB G5', type: 'A3', subjectName: 'FULANO DE TAL' },
      signaturePolicy: 'PA_PAdES_AD_RT_v1_0',
      validationResults: { errors: [], warnings: [] },
    },
  ],
  availableUntil: '2026-10-13T00:00:00Z',
}

afterEach(() => {
  limparCacheOnr()
  vi.restoreAllMocks()
})

describe('extrairCodigoOnrDoTexto', () => {
  it('extrai o código do link completo', () => {
    const texto = `Confira em https://assinador-web.onr.org.br/docs/${CODIGO} a autenticidade.`
    expect(extrairCodigoOnrDoTexto(texto)).toBe(CODIGO)
  })

  it('extrai o código solto, sem o link em volta', () => {
    expect(extrairCodigoOnrDoTexto(`Código de verificação: ${CODIGO}`)).toBe(CODIGO)
  })

  it('devolve null quando não há nada parecido no texto', () => {
    expect(extrairCodigoOnrDoTexto('matrícula sem nenhum código de assinatura')).toBeNull()
  })
})

describe('consultarOnr', () => {
  it('nao_aplicavel quando o feature flag está desligado, sem chamar fetch', async () => {
    const fetchImpl = vi.fn()
    const r = await consultarOnr(CODIGO, { habilitado: false, fetchImpl })
    expect(r.status).toBe('nao_aplicavel')
    expect(r.resposta).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('extrai só os campos permitidos, mesmo com CPF/RG/nascimento/assinatura/url na resposta bruta', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => RESPOSTA_BRUTA_ONR,
    })
    const r = await consultarOnr(CODIGO, { habilitado: true, fetchImpl })
    expect(r.status).toBe('consultado')
    expect(r.resposta).toMatchObject({
      cartorio: RESPOSTA_BRUTA_ONR.document.metadata.cartorio,
      cns: '145573',
      validade: '2025-11-12',
      signingTime: '2025-10-13T13:10:34Z',
      nomeSignatario: 'FULANO DE TAL',
      politicaAssinatura: 'PA_PAdES_AD_RT_v1_0',
      temErrosDeValidacao: false,
      temAvisosDeValidacao: false,
    })

    const serializado = JSON.stringify(r.resposta)
    expect(serializado).not.toContain('456.789') // CPF
    expect(serializado).not.toContain('1980-01-01') // nascimento
    expect(serializado).not.toContain('12.345.678-9') // RG
    expect(serializado).not.toContain('QUJDMTIz') // assinatura base64
    expect(serializado).not.toContain('access_ticket') // url temporária do arquivo original
  })

  it('indisponivel quando a resposta HTTP não é ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    const r = await consultarOnr(CODIGO, { habilitado: true, fetchImpl })
    expect(r).toEqual({ status: 'indisponivel', resposta: null })
  })

  it('indisponivel quando o corpo não é JSON válido, sem lançar', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('bad json')
      },
    })
    const r = await consultarOnr(CODIGO, { habilitado: true, fetchImpl })
    expect(r).toEqual({ status: 'indisponivel', resposta: null })
  })

  it('indisponivel quando o formato mudou e não há document nem signers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ algumaCoisa: 1 }) })
    const r = await consultarOnr(CODIGO, { habilitado: true, fetchImpl })
    expect(r).toEqual({ status: 'indisponivel', resposta: null })
  })

  it('tenta de novo uma vez em erro de rede, e desiste depois disso', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'))
    const r = await consultarOnr(CODIGO, { habilitado: true, fetchImpl, timeoutMs: 10 })
    expect(r.status).toBe('indisponivel')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('nunca lança mesmo quando fetchImpl lança um erro genérico', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      throw new Error('boom')
    })
    await expect(consultarOnr(CODIGO, { habilitado: true, fetchImpl })).resolves.toMatchObject({
      status: 'indisponivel',
    })
  })

  it('usa cache: a segunda consulta do mesmo código não chama fetch de novo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => RESPOSTA_BRUTA_ONR })
    await consultarOnr(CODIGO, { habilitado: true, fetchImpl })
    await consultarOnr(CODIGO, { habilitado: true, fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('não usa cache entre códigos diferentes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => RESPOSTA_BRUTA_ONR })
    await consultarOnr(CODIGO, { habilitado: true, fetchImpl })
    await consultarOnr('OUTRO-CODI-GODI-FEREN', { habilitado: true, fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
