// Tira do texto o que o carimbo escreveu.
//
// Isto NÃO é o filtro de candidatos (giro.ts). Aquele decide o que não vale
// perguntar ao usuário; se errar, o custo é uma conferência a menos. Este apaga
// trecho do documento que fundamenta o parecer — se errar, o custo é uma análise
// feita sobre um texto mutilado, e ninguém percebe.
//
// Por isso aqui tudo é conservador e nada é silencioso:
//
//   • a remoção só acontece onde a mediana da página é confiável (giro.ts);
//   • se o "carimbo" for grande demais numa página, a medição está errada e a
//     página inteira fica intacta;
//   • se a remoção total passar de um quinto do documento, nada é removido;
//   • o que sai fica registrado, e o texto original é guardado ao lado.
//
// O problema que justifica isso: a certidão eletrônica do ONR carimba cada
// página na diagonal, e o OCR transcreve o carimbo intercalado no conteúdo —
//
//     A(O) escrevente:-
//     PARA SIMPLES CONSU      ← carimbo
//     Cavalhieri
//     UTORIZADO               ← carimbo
//     NAO VALE COMO CERTIDAU  ← carimbo
//
// — de modo que "ESCREVENTE AUTORIZADO Cavalhieri" chega despedaçado à análise.

import { LIMITE_GIRO, baseDasPaginas, estaGirado } from './giro.ts'
import type { TokenOcr } from './tipos.ts'

/**
 * Fração de tokens girados a partir da qual a página é deixada em paz.
 *
 * Carimbo é minoria: são poucas palavras atravessadas sobre um corpo de texto.
 * Se a medição aponta um terço da página como girada, o que está errado é a
 * medição — página em paisagem, digitalização em ângulo estranho, tabela em
 * coluna vertical. Nesses casos o certo é não tocar em nada.
 */
const MAX_FRACAO_GIRADA = 0.3

/** Teto de remoção sobre o documento inteiro. Passou disso, nada é removido. */
const MAX_FRACAO_DO_TEXTO = 0.2

export type TextoSemCarimbo = {
  /** Texto sem os trechos girados */
  texto: string
  /** Tokens sobreviventes, com os offsets já corrigidos para o novo texto */
  tokens: TokenOcr[]
  /** O que saiu, para auditoria no stageData */
  removidos: string[]
  /** Preenchido quando a limpeza foi abortada, com o motivo */
  aborto?: string
}

function intacto(texto: string, tokens: TokenOcr[], aborto?: string): TextoSemCarimbo {
  return { texto, tokens, removidos: [], ...(aborto ? { aborto } : {}) }
}

/**
 * Remove do texto os trechos escritos na diagonal.
 *
 * `tokens` precisa chegar com offsets já reconciliados (ver offsets.ts) — são
 * eles que dizem onde cada palavra está no texto.
 */
export function removerCarimbo(
  texto: string,
  tokens: TokenOcr[],
  limite = LIMITE_GIRO,
): TextoSemCarimbo {
  if (!texto || tokens.length === 0) return intacto(texto, tokens)
  if (!tokens.some((t) => typeof t.a === 'number')) {
    // Workflow de OCR anterior: sem ângulo não há o que decidir, e supor seria
    // apagar texto por achismo.
    return intacto(texto, tokens, 'sem angulo no indice de tokens')
  }

  const base = baseDasPaginas(tokens)

  // Páginas em que a medição não se sustenta ficam inteiras.
  const suspeitasPorPagina = new Map<number, number>()
  const totalPorPagina = new Map<number, number>()
  for (const t of tokens) {
    totalPorPagina.set(t.p, (totalPorPagina.get(t.p) ?? 0) + 1)
    if (estaGirado(t, base, limite)) {
      suspeitasPorPagina.set(t.p, (suspeitasPorPagina.get(t.p) ?? 0) + 1)
    }
  }
  const paginasConfiaveis = new Set(
    [...totalPorPagina.entries()]
      .filter(([p, total]) => (suspeitasPorPagina.get(p) ?? 0) / total <= MAX_FRACAO_GIRADA)
      .map(([p]) => p),
  )

  const girados = tokens.filter((t) => paginasConfiaveis.has(t.p) && estaGirado(t, base, limite))
  if (girados.length === 0) return intacto(texto, tokens)

  // Trechos a remover, fundidos quando encostam um no outro na MESMA linha (o
  // carimbo vem em palavras vizinhas, e removê-las de uma vez evita deixar
  // pontuação órfã). A quebra de linha não funde: cada linha vira um registro de
  // auditoria separado, que é como alguém conferindo vai querer ler.
  const faixas: { inicio: number; fim: number }[] = []
  for (const t of [...girados].sort((a, b) => a.s - b.s)) {
    const ultima = faixas[faixas.length - 1]
    const vao = ultima ? texto.slice(ultima.fim, t.s) : null
    if (ultima && vao !== null && vao.length <= 1 && !vao.includes('\n')) {
      ultima.fim = Math.max(ultima.fim, t.e)
      continue
    }
    faixas.push({ inicio: t.s, fim: t.e })
  }

  const totalRemovido = faixas.reduce((soma, f) => soma + (f.fim - f.inicio), 0)
  if (totalRemovido > texto.length * MAX_FRACAO_DO_TEXTO) {
    return intacto(
      texto,
      tokens,
      `remocao de ${totalRemovido} de ${texto.length} caracteres excede o teto`,
    )
  }

  // Reconstrói o texto pulando as faixas, e vai anotando quanto foi cortado
  // antes de cada ponto — é o que permite reposicionar os tokens que ficam.
  const removidos: string[] = []
  let saida = ''
  let cursor = 0
  const cortesAcumulados: { ate: number; corte: number }[] = []
  let acumulado = 0

  for (const f of faixas) {
    removidos.push(texto.slice(f.inicio, f.fim).trim())
    saida += texto.slice(cursor, f.inicio)

    // A linha que só continha carimbo viraria uma linha em branco; a quebra que
    // sobrou some junto, para o texto não ganhar buracos.
    let fim = f.fim
    if (saida.endsWith('\n') && texto[fim] === '\n') fim += 1

    acumulado += fim - f.inicio
    cortesAcumulados.push({ ate: fim, corte: acumulado })
    cursor = fim
  }
  saida += texto.slice(cursor)

  function deslocar(indice: number): number {
    let corte = 0
    for (const c of cortesAcumulados) {
      if (c.ate <= indice) corte = c.corte
      else break
    }
    return indice - corte
  }

  const removidosSet = new Set(girados)
  const sobreviventes = tokens
    .filter((t) => !removidosSet.has(t))
    .map((t) => ({ ...t, s: deslocar(t.s), e: deslocar(t.e) }))
    .filter((t) => t.e > t.s)

  return { texto: saida, tokens: sobreviventes, removidos: removidos.filter(Boolean) }
}
