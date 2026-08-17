// Da posição no texto para o lugar na página, e de volta.
//
// Os detectores trabalham só com texto — encontram "o CPF 123.456.789-00 não
// fecha" e sabem em que intervalo de caracteres isso está. Para mostrar a
// palavra ao usuário é preciso o caminho inverso: que tokens do OCR cobrem esse
// intervalo, em que página, e qual retângulo os contém. É isso que este módulo
// faz, e é o que permite que qualquer detector novo ganhe recorte de graça.

import type { TokenOcr } from './tipos.ts'

/** Caracteres de contexto guardados de cada lado, para re-ancorar a correção. */
export const CTX = 36

export type Ancora = {
  pagina: number
  caixa: [number, number, number, number]
}

/** Primeiro token cujo fim passa de `inicio` — busca binária na lista ordenada. */
function primeiroCandidato(tokens: TokenOcr[], inicio: number): number {
  let lo = 0
  let hi = tokens.length
  while (lo < hi) {
    const meio = (lo + hi) >> 1
    if (tokens[meio].e <= inicio) lo = meio + 1
    else hi = meio
  }
  return lo
}

/**
 * Página e retângulo que contêm o trecho [inicio, fim).
 *
 * Um trecho pode atravessar a virada de página (o cartório quebra frase no meio
 * da folha o tempo todo). Nesse caso vence a página que cobre mais caracteres do
 * trecho: mostrar meia palavra em duas imagens confundiria mais que ajudaria.
 *
 * A caixa recebe uma folga proporcional à própria altura — palavra recortada
 * rente ao próprio contorno fica ilegível, e o pouco de linha vizinha que entra
 * ajuda o usuário a reconhecer onde está no documento.
 */
export function ancorar(
  tokens: TokenOcr[],
  inicio: number,
  fim: number,
  folga = 0.35,
): Ancora | null {
  const porPagina = new Map<number, { cobertura: number; caixa: [number, number, number, number] }>()

  for (let i = primeiroCandidato(tokens, inicio); i < tokens.length; i++) {
    const t = tokens[i]
    if (t.s >= fim) break

    const cobertura = Math.min(t.e, fim) - Math.max(t.s, inicio)
    if (cobertura <= 0) continue

    const atual = porPagina.get(t.p)
    if (!atual) {
      porPagina.set(t.p, { cobertura, caixa: [...t.b] as [number, number, number, number] })
      continue
    }
    atual.cobertura += cobertura
    atual.caixa[0] = Math.min(atual.caixa[0], t.b[0])
    atual.caixa[1] = Math.min(atual.caixa[1], t.b[1])
    atual.caixa[2] = Math.max(atual.caixa[2], t.b[2])
    atual.caixa[3] = Math.max(atual.caixa[3], t.b[3])
  }

  if (porPagina.size === 0) return null

  let melhorPagina = -1
  let melhor: { cobertura: number; caixa: [number, number, number, number] } | null = null
  for (const [pagina, dados] of porPagina) {
    if (!melhor || dados.cobertura > melhor.cobertura) {
      melhor = dados
      melhorPagina = pagina
    }
  }
  if (!melhor) return null

  const [x0, y0, x1, y1] = melhor.caixa
  const altura = Math.max(y1 - y0, 0.004)
  const margemY = altura * folga
  // A folga horizontal usa a altura, e não a largura: proporcional à largura,
  // um número curto ("12") ganharia folga de dois pixels e uma linha inteira
  // ganharia meia página.
  const margemX = altura * folga * 2

  return {
    pagina: melhorPagina,
    caixa: [
      Math.max(0, x0 - margemX),
      Math.max(0, y0 - margemY),
      Math.min(1, x1 + margemX),
      Math.min(1, y1 + margemY),
    ],
  }
}

/** Teto para a expansão até a borda dos tokens — ver `expandirParaTokens`. */
const MAX_EXPANSAO = 40

/**
 * Estica o trecho até as bordas dos tokens que o cobrem.
 *
 * Sem isso, a imagem e o campo de texto discordam: o detector de alfabeto
 * estranho aponta um caractere só (o `ν` de "Aν."), mas o recorte sai da caixa do
 * token e mostra a palavra inteira. O usuário veria "Aν." na imagem e um campo
 * com um caractere solto dentro — e digitaria "Av." no lugar de "v", trocando um
 * erro de leitura por outro.
 *
 * O teto existe porque token do Document AI é palavra, mas em documento
 * datilografado ruim ele às vezes engole a linha inteira; esticar até lá daria um
 * campo de texto com uma frase para redigitar.
 */
export function expandirParaTokens(
  tokens: TokenOcr[],
  inicio: number,
  fim: number,
): { inicio: number; fim: number } {
  let s = inicio
  let e = fim
  for (let i = primeiroCandidato(tokens, inicio); i < tokens.length; i++) {
    const t = tokens[i]
    if (t.s >= fim) break
    if (t.e <= inicio) continue
    s = Math.min(s, t.s)
    e = Math.max(e, t.e)
  }
  if (e - s > MAX_EXPANSAO) return { inicio, fim }
  return { inicio: s, fim: e }
}

/** Vizinhança do trecho, para re-ancorar a correção se o índice não bater. */
export function contexto(texto: string, inicio: number, fim: number) {
  return {
    ctxAntes: texto.slice(Math.max(0, inicio - CTX), inicio),
    ctxDepois: texto.slice(fim, Math.min(texto.length, fim + CTX)),
  }
}
