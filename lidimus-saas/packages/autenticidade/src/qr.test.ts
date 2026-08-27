import QRCode from 'qrcode'
import { describe, expect, it } from 'vitest'
import { decodificarQrDeBuffer, parseUrlSeloTjsp } from './qr.ts'

const SELO_VALIDO = '9999991CE0000000000030184'

describe('parseUrlSeloTjsp', () => {
  it('extrai selo, valor, iss e presença de assinatura da URL da spec', () => {
    const url = `https://selodigital.tjsp.jus.br?r=${encodeURIComponent(`${SELO_VALIDO}|150.00|12.34|QUJDMTIz`)}`
    const r = parseUrlSeloTjsp(url)
    expect(r).not.toBeNull()
    expect(r?.selo25).toBe(SELO_VALIDO)
    expect(r?.valorTotal).toBe('150.00')
    expect(r?.iss).toBe('12.34')
    expect(r?.assinaturaPresente).toBe(true)
  })

  it('devolve null quando o parâmetro "r" não existe', () => {
    expect(parseUrlSeloTjsp('https://selodigital.tjsp.jus.br?x=1')).toBeNull()
  })

  it('devolve null quando o conteúdo não é uma URL', () => {
    expect(parseUrlSeloTjsp('nem uma url')).toBeNull()
  })

  it('devolve null quando "r" não começa com 25 caracteres alfanuméricos', () => {
    const url = `https://selodigital.tjsp.jus.br?r=${encodeURIComponent('curto|1|2|3')}`
    expect(parseUrlSeloTjsp(url)).toBeNull()
  })

  it('devolve null para QR de outra coisa (ex.: link institucional sem "r")', () => {
    expect(parseUrlSeloTjsp('https://www.tjsp.jus.br/institucional')).toBeNull()
  })
})

describe('decodificarQrDeBuffer', () => {
  it('decodifica um QR real gerado com a mesma URL do selo TJSP', async () => {
    const conteudo = `https://selodigital.tjsp.jus.br?r=${encodeURIComponent(`${SELO_VALIDO}|150.00|12.34|QUJDMTIz`)}`
    const png = await QRCode.toBuffer(conteudo, { type: 'png', margin: 2 })

    const decodificado = decodificarQrDeBuffer(png)
    expect(decodificado).toBe(conteudo)

    const selo = parseUrlSeloTjsp(decodificado!)
    expect(selo?.selo25).toBe(SELO_VALIDO)
  })

  it('devolve null para um PNG válido sem nenhum QR', () => {
    // PNG 1x1 liso — arquivo válido, sem código nenhum para decodificar.
    const pngLiso = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    )
    expect(decodificarQrDeBuffer(pngLiso)).toBeNull()
  })

  it('devolve null para bytes que não são PNG, sem lançar', () => {
    expect(decodificarQrDeBuffer(Buffer.from('não é um png'))).toBeNull()
  })
})
