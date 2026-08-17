// Reconciliação dos offsets do Document AI com índices de string do JavaScript.
//
// O `textAnchor.textSegments` de cada token traz startIndex/endIndex "no
// Document.text". A documentação do Google chama isso de "UTF-8 char index", e
// a prática é que vêm como *offsets de byte* na codificação UTF-8. Enquanto o
// documento é ASCII puro os dois valores coincidem e ninguém percebe a
// diferença; matrícula brasileira é cheia de "matrícula", "São", "imóvel", e a
// partir do primeiro acento as duas leituras divergem — e a divergência cresce a
// cada acento seguinte.
//
// Apostar na leitura errada não dá erro: dá um recorte que mostra uma palavra e
// uma correção que emenda outra, alguns caracteres à frente. Por isso aqui não
// se aposta: as duas hipóteses são testadas contra o texto real e ganha a que
// produz fatias que parecem palavras.

import type { TokenOcr } from './tipos.ts'

/** Quantos tokens a amostragem examina para decidir a hipótese. */
const AMOSTRA = 300

/**
 * A fatia parece um token de verdade?
 *
 * Token do Document AI é uma palavra — nunca começa em espaço e nunca tem
 * espaço no meio. O fim é tolerante porque a quebra detectada depois da palavra
 * (espaço, fim de linha) às vezes entra no segmento.
 */
function pareceToken(fatia: string): boolean {
  if (!fatia) return false
  if (/^\s/.test(fatia)) return false
  const semQuebra = fatia.replace(/\s+$/, '')
  if (!semQuebra) return false
  return !/\s/.test(semQuebra)
}

/** Há caractere fora do ASCII? Só nesse caso byte e caractere divergem. */
function temNaoAscii(texto: string): boolean {
  for (let i = 0; i < texto.length; i++) {
    if (texto.charCodeAt(i) > 127) return true
  }
  return false
}

/**
 * Mapa offset-de-byte → índice de string JS.
 *
 * O valor em cada posição de byte é o índice da unidade UTF-16 onde aquele byte
 * começa; bytes de continuação de um caractere multibyte apontam para o mesmo
 * índice, que é o comportamento desejado (offset no meio de um caractere
 * resolve para o começo dele, e não para o caractere seguinte).
 */
function mapaDeBytes(texto: string): Int32Array {
  const bytesTotais = Buffer.byteLength(texto, 'utf8')
  const mapa = new Int32Array(bytesTotais + 1)
  let b = 0
  for (let i = 0; i < texto.length; ) {
    const cp = texto.codePointAt(i)!
    const unidades = cp > 0xffff ? 2 : 1
    const largura = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
    for (let k = 0; k < largura; k++) mapa[b + k] = i
    b += largura
    i += unidades
  }
  mapa[bytesTotais] = texto.length
  return mapa
}

function pontuar(texto: string, tokens: TokenOcr[], converter: (off: number) => number): number {
  const passo = Math.max(1, Math.floor(tokens.length / AMOSTRA))
  let limpos = 0
  let vistos = 0
  for (let i = 0; i < tokens.length; i += passo) {
    const t = tokens[i]
    const s = converter(t.s)
    const e = converter(t.e)
    if (e <= s) continue
    vistos++
    if (pareceToken(texto.slice(s, e))) limpos++
  }
  return vistos === 0 ? 0 : limpos / vistos
}

/**
 * Devolve os tokens com `s`/`e` em índices de string JS, descartando os que não
 * apontam para trecho nenhum.
 *
 * Quando as duas hipóteses empatam (documento ASCII puro, ou índice degenerado)
 * a identidade ganha: é a que não move nada.
 */
export function reconciliarOffsets(texto: string, tokens: TokenOcr[]): TokenOcr[] {
  if (tokens.length === 0) return []

  const identidade = (off: number) => Math.max(0, Math.min(off, texto.length))

  // Sem caractere fora do ASCII as duas leituras são a mesma coisa — nem vale
  // construir o mapa de bytes de um texto de 200 KB para descobrir isso.
  if (!temNaoAscii(texto)) return normalizar(texto, tokens, identidade)

  const mapa = mapaDeBytes(texto)
  const porBytes = (off: number) => mapa[Math.max(0, Math.min(off, mapa.length - 1))]

  const notaIdentidade = pontuar(texto, tokens, identidade)
  const notaBytes = pontuar(texto, tokens, porBytes)

  return normalizar(texto, tokens, notaBytes > notaIdentidade ? porBytes : identidade)
}

function normalizar(
  texto: string,
  tokens: TokenOcr[],
  converter: (off: number) => number,
): TokenOcr[] {
  const saida: TokenOcr[] = []
  for (const t of tokens) {
    const s = converter(t.s)
    const e = converter(t.e)
    if (e <= s || s >= texto.length) continue
    saida.push({ ...t, s, e: Math.min(e, texto.length) })
  }
  saida.sort((a, b) => a.s - b.s)
  return saida
}
