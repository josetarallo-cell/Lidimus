// Corretor de leitura do OCR: a etapa humana entre a extração do texto e a
// análise jurídica.
//
//   OCR  →  CORRETOR  →  Jurídico
//
// O que este pacote decide é *o que vale perguntar*. A leitura de uma matrícula
// de trinta faces tem centenas de pontos onde o OCR pode ter escorregado; a
// atenção de quem revisa dá para oito. Levantar todos os pontos duvidosos e
// despejá-los numa lista transforma a correção em digitação e faz o usuário
// fechar a tela — o que devolve exatamente o risco que a etapa existia para
// eliminar.
//
// Nada aqui é corrigido automaticamente: ver o cabeçalho de detectores.ts.

import { ancorar, contexto, expandirParaTokens } from './ancoragem.ts'
import {
  detectarAtos,
  detectarConfianca,
  detectarDatas,
  detectarDocumentos,
  detectarHomoglifos,
  detectarValores,
} from './detectores.ts'
import { semTextoGirado } from './giro.ts'
import { reconciliarOffsets } from './offsets.ts'
import type { Candidato, Suspeita, TokenOcr } from './tipos.ts'

export type {
  Candidato,
  Correcao,
  CorrecaoAplicada,
  MotivoSuspeita,
  ResultadoAplicacao,
  Suspeita,
  TokenOcr,
} from './tipos.ts'
export { aplicarCorrecoes } from './aplicar.ts'
export { FAMILIA, LIMITE_CONFIANCA, PESOS, cnpjValido, cpfValido } from './detectores.ts'
export { reconciliarOffsets } from './offsets.ts'
export { LIMITE_GIRO, baseDasPaginas, estaGirado, semTextoGirado } from './giro.ts'
export { removerCarimbo } from './carimbo.ts'
export type { TextoSemCarimbo } from './carimbo.ts'

/**
 * Quantos trechos a tela pede para conferir, no máximo.
 *
 * Oito é o teto do que se confere sem virar formulário. Como as verificações
 * duras têm peso maior que a confiança (ver PESOS), documento com muitos erros
 * certos gasta as oito vagas com eles e não sobra nenhuma para palpite — que é o
 * comportamento desejado.
 */
export const MAX_CANDIDATOS = 8

/**
 * Teto de repetições guardadas por candidato. Existe para o caso patológico —
 * um trecho lido errado que se repete às dezenas — não inflar o stageData.
 */
const MAX_REPETICOES = 20

/**
 * Devolve a pontuação de frase e o espaço em branco que a expansão até a borda
 * do token arrastou.
 *
 * O token do OCR engole a vírgula que separa a oração: o CPF vira
 * "007.552.588-86," e o usuário teria que redigitar a vírgula junto. O ponto
 * final fica de fora da poda de propósito — em "Av." ele é da abreviatura, e
 * cortá-lo trocaria um erro por outro.
 *
 * O espaço em branco entrou nesta poda depois de quebrar uma matrícula em
 * produção, e a lição vale ser escrita por extenso. O offset de token do
 * Document AI termina DEPOIS da quebra de linha que separa o token do seguinte,
 * então o campo da tela mostrava "199.908⏎". O usuário fez exatamente o certo —
 * viu o erro de digitação do cartório na imagem e digitou "119.908" — e a
 * substituição literal levou a quebra de linha junto: o texto virou
 * "Av.03 119.908São Paulo", com a matrícula colada na palavra seguinte, e o
 * parser de atos deixou de reconhecer o cabeçalho. Um candidato irmão, cujo
 * trecho era "Av.05 " com o espaço no fim, virou "Av.05119.908" e destruiu um
 * ato que até então era lido.
 *
 * Ou seja: pedir espaço em branco de volta ao usuário não é só incômodo, é o
 * caminho para trocar um erro de leitura por um erro de estrutura. O que se
 * pede para redigitar é o texto, nunca o que o separa do próximo.
 */
function aparar(
  texto: string,
  original: { inicio: number; fim: number },
  expandido: { inicio: number; fim: number },
): { inicio: number; fim: number } {
  let { inicio, fim } = expandido
  while (fim > original.fim && /[\s,;:-]/.test(texto[fim - 1])) fim--
  while (inicio < original.inicio && /[\s,;:-]/.test(texto[inicio])) inicio++
  return { inicio, fim }
}

/**
 * Os candidatos sem as imagens, para guardar depois que a revisão fecha.
 *
 * O recorte é uma foto de um pedaço de matrícula alheia — nome, CPF, valor. Ele
 * existe para o usuário decidir uma coisa e, decidida, não tem por que continuar
 * no banco: o que fica é o registro do que foi lido e do que foi corrigido, que é
 * o necessário para auditar a análise. Também tira do `stageData` uns 100 KB de
 * base64 que iriam junto em cada resposta de `/api/jobs/:id` e em cada evento SSE.
 */
export function semRecortes(candidatos: Candidato[]): Candidato[] {
  return candidatos.map((c) => ({ ...c, recorte: null }))
}

export type OpcoesLevantamento = {
  maxCandidatos?: number
  limiteConfianca?: number
  /** Injetável para o teste não depender do calendário */
  anoAtual?: number
}

/**
 * Levanta os trechos que merecem conferência humana.
 *
 * Sem índice de tokens não há caixa, sem caixa não há recorte, e sem recorte não
 * há o que mostrar — nesse caso devolve lista vazia e o pipeline segue direto
 * para o jurídico, como antes desta etapa existir. Esse é o modo de falha
 * desejado: o corretor é uma melhoria da precisão, nunca um bloqueio da análise.
 */
export function levantarCandidatos(
  texto: string,
  tokensBrutos: TokenOcr[],
  opcoes: OpcoesLevantamento = {},
): Candidato[] {
  if (!texto.trim() || tokensBrutos.length === 0) return []

  const max = opcoes.maxCandidatos ?? MAX_CANDIDATOS

  // O carimbo diagonal da certidão eletrônica sai do índice antes de tudo: ele
  // não é texto do cartório, e deixá-lo entrar faz seus pedaços concorrerem
  // pelas oito vagas da tela e sujarem o recorte dos trechos vizinhos.
  const tokens = semTextoGirado(reconciliarOffsets(texto, tokensBrutos))
  if (tokens.length === 0) return []

  const suspeitas: Suspeita[] = [
    ...detectarDocumentos(texto),
    ...detectarDatas(texto, opcoes.anoAtual),
    ...detectarAtos(texto, opcoes.anoAtual),
    ...detectarValores(texto),
    ...detectarHomoglifos(texto),
    ...detectarConfianca(texto, tokens, opcoes.limiteConfianca),
  ]

  // Maior peso primeiro; empate desfeito pela posição, para que a ordem da tela
  // seja a ordem do documento entre itens igualmente importantes.
  suspeitas.sort((a, b) => b.peso - a.peso || a.inicio - b.inicio)

  const candidatos: Candidato[] = []
  const ocupados: { inicio: number; fim: number }[] = []
  const porChave = new Map<string, Candidato>()

  for (const s of suspeitas) {
    const { inicio, fim } = aparar(texto, s, expandirParaTokens(tokens, s.inicio, s.fim))

    // Dois detectores apontando o mesmo trecho contam como um só achado. O de
    // maior peso já passou (a lista está ordenada), e é o rótulo dele que
    // explica melhor o problema.
    if (ocupados.some((o) => inicio < o.fim && o.inicio < fim)) continue

    const textoLido = texto.slice(inicio, fim)
    if (!textoLido.trim()) continue

    // O mesmo erro lido igual em outro ponto do documento não é achado novo: é
    // outra ocorrência do mesmo, e a correção digitada uma vez vale para todas.
    const jaVisto = porChave.get(`${s.motivo}|${textoLido}`)
    if (jaVisto) {
      if (jaVisto.repeticoes.length < MAX_REPETICOES) {
        ocupados.push({ inicio, fim })
        jaVisto.repeticoes.push({ inicio, fim, ...contexto(texto, inicio, fim) })
      }
      continue
    }

    // Cheio, mas a varredura continua: uma suspeita adiante ainda pode ser
    // repetição de um candidato já aceito, e vale mais recolhê-la que parar.
    if (candidatos.length >= max) continue

    const ancora = ancorar(tokens, inicio, fim)
    if (!ancora) continue

    ocupados.push({ inicio, fim })
    const candidato: Candidato = {
      ...s,
      id: `r${candidatos.length + 1}`,
      inicio,
      fim,
      textoLido,
      ...contexto(texto, inicio, fim),
      pagina: ancora.pagina,
      caixa: ancora.caixa,
      repeticoes: [],
      recorte: null,
    }
    candidatos.push(candidato)
    porChave.set(`${s.motivo}|${textoLido}`, candidato)
  }

  // A tela lê melhor na ordem do documento; a prioridade já fez seu trabalho ao
  // escolher *quais* oito entram. Os ids são renumerados depois da ordenação
  // para que "item 3 de 5" na tela seja mesmo o terceiro.
  candidatos.sort((a, b) => a.pagina - b.pagina || a.inicio - b.inicio)
  candidatos.forEach((c, i) => {
    c.id = `r${i + 1}`
  })
  return candidatos
}
