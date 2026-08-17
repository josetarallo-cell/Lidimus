// Encaixe das correções no texto do OCR, antes de ele seguir para a análise.
//
// A regra que governa este módulo: **na dúvida, não emenda**. Uma correção
// aplicada no lugar errado é pior que o erro de leitura original — o erro de
// leitura pelo menos é aleatório, enquanto a emenda torta insere no documento uma
// informação que o usuário afirmou ser verdadeira, em cima de um trecho que ele
// nunca viu. Toda correção que não consegue provar onde vai é descartada, e o
// texto naquele ponto fica como o OCR leu.

import type {
  Candidato,
  Correcao,
  CorrecaoAplicada,
  Ocorrencia,
  ResultadoAplicacao,
} from './tipos.ts'

/**
 * Teto de tamanho do que o usuário digita. O campo corrige uma palavra ou um
 * número; nada aqui justifica um parágrafo, e o texto segue para um prompt de
 * LLM logo depois.
 */
const MAX_CORRECAO = 120

/**
 * Deixa a correção com a forma de um trecho de linha: sem quebra e sem caractere
 * de controle.
 *
 * O texto corrigido é costurado de volta no meio do OCR e vai inteiro para o
 * prompt da análise. Uma quebra de linha aqui desmonta a estrutura que o parser
 * jurídico usa para separar atos; um caractere de controle chega a derrubar o
 * UPDATE do Postgres (é o mesmo motivo do `stripNullChars` no callback).
 */
function sanear(bruto: string): string {
  let limpo = ''
  for (const ch of bruto) {
    const cp = ch.codePointAt(0)!
    limpo += cp < 0x20 || cp === 0x7f ? ' ' : ch
  }
  return limpo.replace(/\s+/g, ' ').trim().slice(0, MAX_CORRECAO)
}

type Resolvido = {
  candidato: Candidato
  inicio: number
  fim: number
  para: string
}

/**
 * Onde este candidato está no texto de agora.
 *
 * O índice é a primeira tentativa e acerta sempre que o texto não mudou entre
 * levantar o candidato e aplicar a correção. As duas seguintes existem para o
 * caso de ter mudado: o contexto de 36 caracteres de cada lado é praticamente
 * único num documento, e a busca pelo trecho sozinho só vale quando ele aparece
 * uma vez só — duas ocorrências e não há como saber qual o usuário estava vendo.
 */
function localizar(
  texto: string,
  ocorrencia: Ocorrencia,
  textoLido: string,
): { inicio: number; fim: number } | null {
  if (texto.slice(ocorrencia.inicio, ocorrencia.fim) === textoLido) {
    return { inicio: ocorrencia.inicio, fim: ocorrencia.fim }
  }

  const alvo = ocorrencia.ctxAntes + textoLido + ocorrencia.ctxDepois
  const comContexto = texto.indexOf(alvo)
  if (comContexto !== -1 && texto.indexOf(alvo, comContexto + 1) === -1) {
    const inicio = comContexto + ocorrencia.ctxAntes.length
    return { inicio, fim: inicio + textoLido.length }
  }

  const sozinho = texto.indexOf(textoLido)
  if (sozinho !== -1 && texto.indexOf(textoLido, sozinho + 1) === -1) {
    return { inicio: sozinho, fim: sozinho + textoLido.length }
  }

  return null
}

/** A posição principal do candidato mais as repetições dele, na ordem do texto. */
function ocorrenciasDe(c: Candidato): Ocorrencia[] {
  const principal: Ocorrencia = {
    inicio: c.inicio,
    fim: c.fim,
    ctxAntes: c.ctxAntes,
    ctxDepois: c.ctxDepois,
  }
  return [principal, ...(c.repeticoes ?? [])]
}

export function aplicarCorrecoes(
  texto: string,
  candidatos: Candidato[],
  correcoes: Correcao[],
): ResultadoAplicacao {
  const porId = new Map(candidatos.map((c) => [c.id, c]))
  const descartadas: { id: string; razao: string }[] = []
  const resolvidos: Resolvido[] = []

  for (const correcao of correcoes) {
    const candidato = porId.get(correcao.id)
    if (!candidato) {
      descartadas.push({ id: correcao.id, razao: 'trecho não faz parte desta revisão' })
      continue
    }

    const para = sanear(correcao.texto)
    // Campo vazio ou igual ao que estava lá é confirmação, não correção: o
    // usuário olhou a imagem e disse que o OCR acertou. Nada a fazer no texto.
    if (!para || para === candidato.textoLido) continue

    // Todas as posições onde o OCR leu a mesma coisa: o usuário digitou uma
    // correção e ela vale para cada uma delas.
    const lugares = ocorrenciasDe(candidato)
      .map((o) => localizar(texto, o, candidato.textoLido))
      .filter((l): l is { inicio: number; fim: number } => l !== null)

    if (lugares.length === 0) {
      descartadas.push({ id: correcao.id, razao: 'não foi possível localizar o trecho no texto' })
      continue
    }

    for (const lugar of lugares) {
      resolvidos.push({ candidato, inicio: lugar.inicio, fim: lugar.fim, para })
    }
  }

  // Dois candidatos podem resolver para trechos que se cruzam (o detector de
  // valor e o de confiança apontando o mesmo número, por exemplo). Emendar os
  // dois faria a segunda correção escrever em cima do texto que a primeira
  // acabou de trocar, então o de maior peso vence e o outro é descartado.
  const porPeso = [...resolvidos].sort((a, b) => b.candidato.peso - a.candidato.peso)
  const aceitos: Resolvido[] = []
  const recusados = new Set<string>()

  for (const r of porPeso) {
    if (aceitos.some((a) => r.inicio < a.fim && a.inicio < r.fim)) {
      recusados.add(r.candidato.id)
      continue
    }
    aceitos.push(r)
  }

  // Só é descarte de verdade quando o candidato não conseguiu emendar posição
  // nenhuma. Ter uma ocorrência cruzada com outro item e as demais aplicadas é
  // resultado normal, não erro para relatar.
  const aplicados = new Set(aceitos.map((r) => r.candidato.id))
  for (const id of recusados) {
    if (!aplicados.has(id)) descartadas.push({ id, razao: 'trecho já corrigido por outro item' })
  }

  // Da última posição para a primeira: emendar de trás para a frente mantém
  // válidos os índices de todas as correções ainda por aplicar.
  aceitos.sort((a, b) => b.inicio - a.inicio)

  let saida = texto
  const contagem = new Map<string, CorrecaoAplicada & { primeira: number }>()

  for (const r of aceitos) {
    saida = saida.slice(0, r.inicio) + r.para + saida.slice(r.fim)
    const registro = contagem.get(r.candidato.id)
    if (registro) {
      registro.ocorrencias += 1
      registro.primeira = Math.min(registro.primeira, r.inicio)
      continue
    }
    contagem.set(r.candidato.id, {
      id: r.candidato.id,
      motivo: r.candidato.motivo,
      de: r.candidato.textoLido,
      para: r.para,
      ocorrencias: 1,
      primeira: r.inicio,
    })
  }

  const aplicadas: CorrecaoAplicada[] = [...contagem.values()]
    .sort((a, b) => a.primeira - b.primeira)
    .map(({ primeira: _primeira, ...resto }) => resto)

  return { texto: saida, aplicadas, descartadas }
}
