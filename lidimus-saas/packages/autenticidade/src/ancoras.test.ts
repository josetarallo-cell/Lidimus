import { describe, expect, it } from 'vitest'
import { extrairCnm, extrairSelo, seloDoQr, tentarComCorrecaoDv } from './ancoras.ts'
import { luhnModNFecha } from './luhn.ts'

const SELO_VALIDO = '9999991CE0000000000030184' // spec §4.9, DV confirmado em luhn.test.ts
// CNS(6) + Livro(1) + ordem(7) + DV(2) — o CNS tem seis dígitos, e a fixture
// anterior ('14557.2.0000001-72') tinha cinco. Como o regex fora escrito com o
// mesmo erro, o teste passava enquanto nenhum CNM real era reconhecido. DV
// calculado pelo próprio ISO 7064 MOD 97-10 sobre '14557320000001'.
const CNM_VALIDO = '145573.2.0000001-39'

describe('extrairSelo', () => {
  it('encontra o selo rotulado e confirma que o DV fecha', () => {
    const texto = `Certidão emitida. Selo Digital: ${SELO_VALIDO} Consulte a validade em selodigital.tjsp.jus.br`
    const selo = extrairSelo(texto)
    expect(selo).not.toBeNull()
    expect(selo?.codigo).toBe(SELO_VALIDO)
    expect(selo?.dvFecha).toBe(true)
    expect(selo?.corrigidoPorDv).toBe(false)
  })

  it('decompõe os 6 campos corretamente', () => {
    const selo = extrairSelo(`Selo Digital ${SELO_VALIDO}`)
    expect(selo?.cns).toBe('999999')
    expect(selo?.natureza).toBe('1')
    expect(selo?.ato).toBe('CE')
    expect(selo?.infoAto).toBe('0000000000030')
    expect(selo?.ano).toBe('18')
    expect(selo?.dv).toBe('4')
  })

  it('encontra sem rótulo, quando o DV fecha sozinho', () => {
    const selo = extrairSelo(`texto qualquer ${SELO_VALIDO} mais texto`)
    expect(selo?.codigo).toBe(SELO_VALIDO)
  })

  it('corrige confusão canônica de OCR (0 lido como O) perto do rótulo', () => {
    const comErro = SELO_VALIDO.slice(0, 9) + 'O' + SELO_VALIDO.slice(10) // posição 9: '0' → 'O'
    expect(comErro).not.toBe(SELO_VALIDO)
    const selo = extrairSelo(`Selo Digital: ${comErro}`)
    expect(selo?.codigo).toBe(SELO_VALIDO)
    expect(selo?.corrigidoPorDv).toBe(true)
  })

  it('candidato rotulado que não fecha nem corrigido volta como achado inválido, não como ausência', () => {
    // Alfabeto sem nenhum caractere das confusões canônicas (0/O, 1/I, 2/Z,
    // 5/S, 6/G, 8/B) — garante que nenhuma correção de até 2 substituições
    // pode salvá-lo, então o teste não depende de sorte no DV.
    const invalido = 'CDEFHJKLMNPQRTUVWXY3479CD' // 25 chars, não fecha Luhn mod 36
    expect(luhnModNFecha(invalido)).toBe(false)
    const selo = extrairSelo(`Selo Digital: ${invalido}`)
    expect(selo).not.toBeNull()
    expect(selo?.dvFecha).toBe(false)
    expect(selo?.corrigidoPorDv).toBe(false)
  })

  it('sem rótulo e sem nada que feche o DV: null (não é achado)', () => {
    expect(extrairSelo('nenhum selo por aqui, só texto de matrícula comum')).toBeNull()
  })

  it('não lança para texto vazio', () => {
    expect(extrairSelo('')).toBeNull()
  })
})

describe('seloDoQr', () => {
  it('decompõe o selo vindo do QR com origem "qr"', () => {
    const selo = seloDoQr(SELO_VALIDO)
    expect(selo?.origem).toBe('qr')
    expect(selo?.dvFecha).toBe(true)
  })

  it('marca dvFecha=false quando o conteúdo do QR não é um selo válido', () => {
    const selo = seloDoQr('DHLPTW39EJMQUX4CFKNRVY7DH') // sem caracteres confusíveis, não fecha
    expect(selo?.dvFecha).toBe(false)
  })
})

describe('extrairCnm', () => {
  it('encontra e valida o CNM pontuado', () => {
    const cnm = extrairCnm(`Matrícula registrada sob CNM ${CNM_VALIDO}.`)
    expect(cnm).not.toBeNull()
    expect(cnm?.cns).toBe('145573')
    expect(cnm?.livro).toBe('2')
    expect(cnm?.numeroOrdem).toBe('0000001')
    expect(cnm?.dv).toBe('39')
    expect(cnm?.dvFecha).toBe(true)
    expect(cnm?.livroEhRegistroGeral).toBe(true)
  })

  // Guarda contra a regressão que motivou a correção de 07/09/2026: os dois
  // códigos abaixo saíram de matrículas reais lidas pelo pipeline (a 119.908 e
  // a 2.853) e não eram reconhecidos enquanto o CNS era lido com cinco dígitos.
  it.each(['111252.2.0119908-34', '145573.2.0002653-37'])(
    'reconhece o CNM real %s, com CNS de seis dígitos',
    (codigo) => {
      const cnm = extrairCnm(`MATRÍCULA (CNM) ${codigo}`)
      expect(cnm?.codigo).toBe(codigo)
      expect(cnm?.cns).toHaveLength(6)
      expect(cnm?.dvFecha).toBe(true)
    },
  )

  it('CNM com DV errado volta como achado inválido', () => {
    const cnm = extrairCnm('CNM 145573.2.0000001-00')
    expect(cnm).not.toBeNull()
    expect(cnm?.dvFecha).toBe(false)
  })

  it('encontra CNM sem pontuação, só quando o DV fecha', () => {
    const semPontuacao = '1455732000000139'
    const cnm = extrairCnm(`bloco de dígitos ${semPontuacao} no meio do texto`)
    expect(cnm?.codigo).toBe(CNM_VALIDO)
  })

  it('não confunde 16 dígitos aleatórios com CNM (DV não fecha)', () => {
    expect(extrairCnm('numero qualquer 1234567890123456 aqui')).toBeNull()
  })

  it('livroEhRegistroGeral é false quando o livro não é 2', () => {
    // Mesma base do CNM_VALIDO, trocando livro=2 por livro=1 — DV recalculado
    // pelo próprio algoritmo (ISO 7064 MOD 97-10) para fechar de verdade.
    const cnm = extrairCnm('145573.1.0000001-73')
    expect(cnm?.dvFecha).toBe(true)
    expect(cnm?.livroEhRegistroGeral).toBe(false)
  })

  it('não lança para texto vazio', () => {
    expect(extrairCnm('')).toBeNull()
  })
})

describe('tentarComCorrecaoDv', () => {
  it('devolve corrigido=false quando já fecha', () => {
    const r = tentarComCorrecaoDv(SELO_VALIDO, luhnModNFecha)
    expect(r).toEqual({ codigo: SELO_VALIDO, corrigido: false })
  })

  it('devolve null quando nada fecha, mesmo com 2 substituições', () => {
    expect(tentarComCorrecaoDv('AAAAAAAAAAAAAAAAAAAAAAAAA', luhnModNFecha)).toBeNull()
  })
})
