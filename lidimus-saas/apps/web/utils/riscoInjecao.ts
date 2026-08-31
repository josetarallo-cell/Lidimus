// Escala de risco do detector de conteúdo oculto.
//
// O pipeline (n8n, nó "Format Report") devolve `risk_level` em três degraus —
// low / medium / high. Três degraus bastam para decidir por API, mas achatam no
// mesmo "alto" coisas de gravidade muito diferente: um campo de metadados com
// uma frase dirigida à IA e um payload em caracteres sem glifo repetido em três
// camadas do arquivo. Quem lê o laudo precisa saber qual dos dois está na mesa.
//
// A escala cruza os dois eixos pelos quais a fraude de fato se organiza:
//   • a camada  — onde o texto estava, e quanto custou escondê-lo ali;
//   • o conteúdo — se o que estava escondido dá ordens a uma IA.
// O conteúdo define o piso: mensagem que instrui uma IA nunca fica abaixo de
// Alto. A camada decide entre Alto e Crítico — a mesma frase pesa mais plantada
// onde nenhum leitor tropeçaria nela, ou repetida em camadas diferentes para
// sobreviver a um filtro.
//
// Derivar aqui, na exibição, e não no pipeline, tem uma consequência boa: os
// laudos já gravados ganham a escala sem reprocessar job nenhum — o mesmo
// caminho que revelarTextoOculto tomou.

import { revelarTextoOculto, temTagsUnicode } from './textoOculto'

export type FaixaRisco = 'baixo' | 'medio' | 'alto' | 'critico'

export type NivelInjecao =
  | 'limpo'
  | 'atipico'
  | 'oculto'
  | 'dirigido'
  | 'injetado'
  | 'camuflado'
  | 'coordenado'

export type ItemNivel = {
  nivel: NivelInjecao
  faixa: FaixaRisco
  /** Cor da fatia no medidor — gradiente contínuo verde→vermelho */
  cor: string
  /** A palavra que aparece junto do medidor */
  rotuloCurto: string
  /** Título do selo no cabeçalho do bloco */
  titulo: string
  /** Par título+texto da caixa de ajuda do medidor */
  tituloCarimbo: string
  textoCarimbo: string
  /** Parágrafo de abertura do bloco: o que significa e o que fazer */
  resumo: string
}

// Os sete níveis, do mais benigno ao mais grave — a ordem é a do medidor, da
// esquerda (verde) para a direita (vermelho). As cores são as mesmas do medidor
// de autenticidade da matrícula: dois medidores com escalas diferentes mas
// paleta igual leem-se como um instrumento só.
export const NIVEIS_INJECAO: ItemNivel[] = [
  {
    nivel: 'limpo',
    faixa: 'baixo',
    cor: '#2f7d4f',
    rotuloCurto: 'Limpo',
    titulo: 'Nada encontrado',
    tituloCarimbo: 'nada encontrado',
    textoCarimbo:
      'Nenhuma das camadas encontrou conteúdo escondido — as técnicas conhecidas não estão no arquivo.',
    resumo:
      'Nenhuma das camadas encontrou conteúdo escondido neste arquivo. Isso não é atestado de segurança: significa que as técnicas conhecidas de ocultação não foram encontradas aqui.',
  },
  {
    nivel: 'atipico',
    faixa: 'medio',
    cor: '#6fae6b',
    rotuloCurto: 'Atípico',
    titulo: 'Sinais atípicos',
    tituloCarimbo: 'sinais atípicos',
    textoCarimbo:
      'Algo fora do comum nos campos do arquivo, sem conteúdo escondido do leitor nem instrução dirigida a uma IA.',
    resumo:
      'Há sinais que fogem do comum — campos do arquivo incoerentes ou fora do padrão —, mas nada escondido do leitor e nenhuma instrução dirigida a uma inteligência artificial. Confira os achados abaixo antes de seguir.',
  },
  {
    nivel: 'oculto',
    faixa: 'medio',
    cor: '#b9c94f',
    rotuloCurto: 'Oculto',
    titulo: 'Conteúdo oculto',
    tituloCarimbo: 'conteúdo oculto',
    textoCarimbo:
      'Há texto escondido do leitor, mas o que está escondido não dá ordens a uma inteligência artificial.',
    resumo:
      'O arquivo carrega texto que o leitor não vê e que qualquer sistema automatizado lê. O conteúdo escondido não dá ordens a uma inteligência artificial — ainda assim, esconder texto num documento é ato deliberado: veja abaixo o que está lá antes de usar o arquivo.',
  },
  {
    nivel: 'dirigido',
    faixa: 'alto',
    cor: '#e8c34a',
    rotuloCurto: 'Dirigido',
    titulo: 'Instrução à vista',
    tituloCarimbo: 'instrução à vista',
    textoCarimbo:
      'O texto do documento dá uma instrução a uma IA — visível para quem ler a folha inteira, obedecida por quem automatizar.',
    resumo:
      'O texto do documento traz uma instrução endereçada a uma inteligência artificial. Ela está no corpo do documento, ao alcance de quem ler tudo — mas basta o arquivo passar por um resumo automático para a instrução ser obedecida. Não confie em análise automática deste arquivo sem conferir o original.',
  },
  {
    nivel: 'injetado',
    faixa: 'alto',
    cor: '#e2954a',
    rotuloCurto: 'Injetado',
    titulo: 'Instrução escondida',
    tituloCarimbo: 'instrução escondida',
    textoCarimbo:
      'Instrução para IA plantada numa camada que o documento impresso não mostra: quem lê a folha vê um documento, quem processa o arquivo recebe uma ordem.',
    resumo:
      'Há instrução dirigida a uma inteligência artificial escondida numa camada que o documento impresso não mostra. Quem lê a folha vê um documento; quem processa o arquivo recebe uma ordem. Não use resumos nem análises automáticas deste documento e confira o conteúdo original.',
  },
  {
    nivel: 'camuflado',
    faixa: 'critico',
    cor: '#d16a4a',
    rotuloCurto: 'Camuflado',
    titulo: 'Instrução camuflada',
    tituloCarimbo: 'instrução camuflada',
    textoCarimbo:
      'Instrução para IA em técnica invisível de fábrica: caracteres que nenhuma fonte desenha, ou texto que substitui o impresso na hora da extração.',
    resumo:
      'A instrução dirigida à IA está plantada por uma técnica sem uso legítimo em documento: caracteres que nenhuma fonte desenha, ou um campo que substitui o texto impresso na hora da extração. Sobrevive a copiar, colar e imprimir, e ninguém topa com ela por acidente — é fraude montada. Trate o documento como suspeito e confirme o conteúdo na fonte original.',
  },
  {
    nivel: 'coordenado',
    faixa: 'critico',
    cor: '#a51e24',
    rotuloCurto: 'Coordenado',
    titulo: 'Ataque em várias camadas',
    tituloCarimbo: 'ataque em várias camadas',
    textoCarimbo:
      'Instrução para IA em duas ou mais camadas independentes do arquivo — redundância para o caso de uma delas ser filtrada.',
    resumo:
      'A tentativa de manipular a IA aparece em mais de uma camada do arquivo. Não é sobra de edição nem descuido: é ataque montado, com redundância para o caso de uma das camadas ser filtrada. Não submeta este arquivo a nenhum fluxo automatizado e confirme o documento na fonte original.',
  },
]

export const FAIXA_ROTULO: Record<FaixaRisco, string> = {
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
  critico: 'Crítico',
}

export const FAIXA_SELO: Record<FaixaRisco, string> = {
  baixo: 'ld-selo--verde',
  medio: 'ld-selo--ocre',
  alto: 'ld-selo--carimbo',
  critico: 'ld-selo--critico',
}

export const FAIXA_CARIMBO: Record<FaixaRisco, string> = {
  baixo: 'ld-carimbo--baixo',
  medio: 'ld-carimbo--medio',
  alto: 'ld-carimbo--alto',
  critico: 'ld-carimbo--critico',
}

// ── Eixo do conteúdo: a mensagem fala com uma IA? ────────────────────────────
//
// Espelha `scanTextForInjection` do nó "Format Report". Se um mudar, o outro
// precisa mudar junto: é o mesmo teste que decide o `risk_level` gravado no
// laudo, e medidor divergindo do carimbo seria pior que não ter medidor.
const PADROES_INSTRUCAO_IA = [
  'aten[cç][aã]o\\s+(intelig[eê]ncia\\s+artificial|ia|ai)\\b[^.\\n]*[.\\n]?',
  '\\b(ignor[ea]|desconsider[ea])\\s+(as\\s+|todas\\s+as\\s+)?(instru[cç][oõ]es|comandos)\\s+(anteriores|acima)[^.\\n]*[.\\n]?',
  '\\bvoc[eê]\\s+[eé]\\s+(um[a]?\\s+)?(modelo\\s+de\\s+linguagem|assistente\\s+de\\s+ia|llm|chatgpt|gpt)\\b[^.\\n]*[.\\n]?',
  '\\b(system\\s*prompt|prompt\\s+injection)\\b[^.\\n]*[.\\n]?',
  '\\bai\\s+attention\\b[^.\\n]*[.\\n]?',
  '\\bdear\\s+(ai|assistant|language\\s+model)\\b[^.\\n]*[.\\n]?',
]

/**
 * Trechos que dão ordem explícita a uma IA. Teste severo, por isso é o único
 * aplicado ao texto *visível*: um contrato honesto fala em "instruções" e em
 * "resumo" o tempo todo, e transformar isso em achado seria alarme falso diário.
 */
export function instrucoesParaIa(texto: string): string[] {
  if (!texto) return []
  const achados = new Set<string>()
  for (const fonte of PADROES_INSTRUCAO_IA) {
    // RegExp nova a cada chamada: com `g` o objeto guarda lastIndex, e um regex
    // compartilhado entre chamadas pularia o começo do texto seguinte.
    const rx = new RegExp(fonte, 'gi')
    let m: RegExpExecArray | null
    while ((m = rx.exec(texto)) !== null) {
      achados.add(m[0].trim())
      if (m.index === rx.lastIndex) rx.lastIndex++
    }
  }
  return [...achados]
}

// Teste largo, só para texto que já estava escondido: ali qualquer menção a IA,
// a instrução ou a resumo é indício — ninguém esconde num documento uma frase
// sobre inteligência artificial por acaso. Também espelha o pipeline.
const MENCAO_IA =
  /intelig[eê]ncia\s+artificial|\bIA\b|\bAI\b|\bLLM\b|prompt|instru[cç]|ignore|assistente|resum/i

function falaComIa(texto: string): boolean {
  if (!texto) return false
  return instrucoesParaIa(texto).length > 0 || MENCAO_IA.test(texto)
}

function normalizar(texto: string): string {
  return texto.toLowerCase().replace(/\s+/g, ' ').trim()
}

// ── Eixo das camadas ─────────────────────────────────────────────────────────

export type CamadaId = 'estilo' | 'unicode' | 'estrutura' | 'imagem' | 'metadados' | 'texto'

export type Camada = {
  id: CamadaId
  rotulo: string
  /** O que esta camada examina — a mesma frase da documentação do detector */
  exame: string
  /** A camada tinha o que analisar neste documento */
  disponivel: boolean
  /** Encontrou conteúdo que virou achado */
  encontrou: boolean
  /** O que encontrou estava fora do alcance de quem lê o documento impresso */
  ocultacao: boolean
  /** O que encontrou dá ordens a uma IA */
  payload: boolean
  /** Trechos já revelados (tags Unicode de volta ao ASCII), para contagem */
  trechos: string[]
}

export type AnaliseRisco = {
  nivel: ItemNivel
  indice: number
  camadas: Camada[]
  /** Camadas cujo conteúdo fala com uma IA — o que sustenta o nível */
  comPayload: Camada[]
}

const PISO_POR_RISK_LEVEL: Record<string, number> = { low: 0, medium: 1, high: 3 }

// Camadas que contam como *lugares* distintos onde a fraude foi plantada. Tags
// Unicode ficam de fora de propósito: não são um lugar, são uma técnica aplicada
// ao texto encontrado por outra camada — contá-las como sítio próprio faria um
// único trecho tag-encoded dentro de texto oculto virar "ataque em duas camadas".
const SITIOS: CamadaId[] = ['estilo', 'estrutura', 'imagem', 'metadados', 'texto']

/**
 * Classifica o `result` do job (como veio do pipeline) na escala de sete níveis.
 */
export function classificarInjecao(result: Record<string, any> | undefined | null): AnaliseRisco {
  const r = result ?? {}
  const fullText = typeof r.fullText === 'string' ? r.fullText : ''

  // 1. Texto oculto por estilo — cor do papel, corpo minúsculo, render invisível
  const itensOcultos: any[] = r.hiddenTextAnalysis?.hiddenItems ?? []
  const trechosEstilo = itensOcultos.map((it) => revelarTextoOculto(String(it?.text ?? '')))

  // 3. Estrutura interna — /ActualText, camada desligada, anotação oculta, XFA.
  //    Severidade baixa (/Alt, sumário, dado de assinatura) é legítima na maioria
  //    dos PDFs bem formados e não conta como ocultação.
  const itensEstruturais: any[] = r.structuralAnalysis?.structuralItems ?? []
  const estruturaisRelevantes = itensEstruturais.filter((it) => it?.severity !== 'baixa')
  const trechosEstrutura = estruturaisRelevantes.map((it) =>
    revelarTextoOculto(String(it?.text ?? '')),
  )

  // 2. Tags Unicode. `runs` já vem decodificado do pipeline; varrer os itens de
  //    novo cobre laudos gravados antes de esse campo existir.
  const runs: string[] = (r.unicodeTagAnalysis?.runs ?? []).map((t: any) => String(t ?? ''))
  const brutosComTags = [
    ...itensOcultos.map((it) => String(it?.text ?? '')),
    ...itensEstruturais.map((it) => String(it?.text ?? '')),
    fullText,
  ].filter((t) => temTagsUnicode(t))
  const trechosUnicode = [
    ...new Set([...runs, ...brutosComTags.map(revelarTextoOculto)].filter((t) => t.trim())),
  ]

  // 4. Imagens — o veredito é do modelo de visão que leu o que está desenhado
  const imagem = r.imageAnalysis ?? {}
  const trechosImagem: string[] = (imagem.imageTexts ?? []).map((t: any) => String(t ?? ''))

  // 5. Metadados — campos que descrevem o arquivo, não o seu conteúdo
  const meta = r.metadataAnalysis ?? {}
  const razoesMeta: string[] = (meta.suspiciousReasons ?? []).map((t: any) => String(t ?? ''))
  const camposMeta: string[] = Object.values(meta.customFields ?? {}).map((v) => String(v ?? ''))

  // 0. Texto do documento. O `fullText` inclui o que as outras camadas acharam
  //    (a extração de PDF ignora cor e corpo), então só conta como "à vista" o
  //    que não estiver dentro de um trecho já classificado como oculto — senão
  //    um único texto branco sobre branco apareceria como dois plantios.
  const jaOcultos = [...trechosEstilo, ...trechosEstrutura, ...trechosUnicode].map(normalizar)
  const escaneado = r.scannedAnalysis ?? {}
  const trechosTexto = instrucoesParaIa(fullText).filter(
    (m) => !jaOcultos.some((o) => o.includes(normalizar(m))),
  )

  const camadas: Camada[] = [
    {
      id: 'estilo',
      rotulo: 'Texto oculto por estilo',
      exame: 'como o texto é desenhado na página',
      disponivel: r.hiddenTextAnalysis?.available !== false,
      encontrou: trechosEstilo.length > 0,
      ocultacao: trechosEstilo.length > 0,
      payload: trechosEstilo.some(falaComIa),
      trechos: trechosEstilo,
    },
    {
      id: 'unicode',
      rotulo: 'Tags Unicode',
      exame: 'os próprios códigos dos caracteres',
      disponivel: true,
      encontrou: trechosUnicode.length > 0,
      ocultacao: trechosUnicode.length > 0,
      payload: trechosUnicode.some(falaComIa),
      trechos: trechosUnicode,
    },
    {
      id: 'estrutura',
      rotulo: 'Estrutura interna do arquivo',
      exame: 'campos que representam a página, mas não são desenhados nela',
      disponivel: r.structuralAnalysis?.available === true,
      encontrou: estruturaisRelevantes.length > 0,
      ocultacao: estruturaisRelevantes.length > 0,
      payload: trechosEstrutura.some(falaComIa),
      trechos: trechosEstrutura,
    },
    {
      id: 'imagem',
      rotulo: 'Imagens embutidas',
      exame: 'o que está escrito dentro das imagens',
      disponivel: imagem.available === true,
      encontrou: imagem.suspicious === true,
      ocultacao: imagem.suspicious === true,
      payload: imagem.suspicious === true,
      trechos: trechosImagem,
    },
    {
      id: 'metadados',
      rotulo: 'Metadados',
      exame: 'campos que descrevem o arquivo, não o seu conteúdo',
      disponivel: meta.available === true,
      encontrou: meta.isSuspicious === true || meta.aiAnalysis?.isInjection === true,
      // Metadado suspeito nem sempre é ocultação: data de criação posterior à de
      // modificação é incoerência do arquivo, não texto escondido de ninguém.
      ocultacao: meta.aiAnalysis?.isInjection === true || camposMeta.some(falaComIa),
      payload: meta.aiAnalysis?.isInjection === true || camposMeta.some(falaComIa),
      trechos: [...camposMeta, ...razoesMeta],
    },
    {
      id: 'texto',
      rotulo: 'Texto do documento',
      exame: 'o texto que a extração — ou o OCR, em documento digitalizado — devolve',
      disponivel: true,
      encontrou: trechosTexto.length > 0 || escaneado.suspiciousContent === true,
      ocultacao: false,
      payload: trechosTexto.length > 0 || escaneado.suspiciousContent === true,
      trechos: trechosTexto,
    },
  ]

  const por = (id: CamadaId) => camadas.find((c) => c.id === id)!
  const comPayload = camadas.filter((c) => c.payload)
  const sitiosComPayload = comPayload.filter((c) => SITIOS.includes(c.id))

  // Camuflagem: invisibilidade que não depende de estilo nenhum. Tags Unicode
  // (caractere sem glifo) e /ActualText divergente entregam à extração um texto
  // que a folha impressa nunca mostra — e sobrevivem a copiar, colar e imprimir.
  const actualTextComPayload = estruturaisRelevantes.some(
    (it) => it?.type === 'actualtext' && falaComIa(revelarTextoOculto(String(it?.text ?? ''))),
  )
  const camuflagemComPayload = por('unicode').payload || actualTextComPayload

  const derivado = ((): NivelInjecao => {
    if (!camadas.some((c) => c.encontrou)) return 'limpo'
    if (sitiosComPayload.length >= 2) return 'coordenado'
    if (camuflagemComPayload) return 'camuflado'
    if (comPayload.some((c) => c.id !== 'texto')) return 'injetado'
    // Texto em tags sem palavra de IA legível continua invisível de fábrica e
    // sem uso legítimo: ninguém plantou aquilo para ser lido por gente.
    if (por('unicode').encontrou) return 'injetado'
    if (por('texto').payload) return 'dirigido'
    if (camadas.some((c) => c.ocultacao)) return 'oculto'
    return 'atipico'
  })()

  // Piso pelo veredito do pipeline: se o laudo gravado diz `high` e a derivação
  // aqui não alcançou (laudo antigo, sinal que o pipeline viu e não gravou), o
  // medidor não pode mostrar menos risco do que o carimbo já prometeu.
  const piso = PISO_POR_RISK_LEVEL[String(r.risk_level ?? '').toLowerCase()] ?? 0
  const indice = Math.max(
    NIVEIS_INJECAO.findIndex((n) => n.nivel === derivado),
    piso,
  )

  return { nivel: NIVEIS_INJECAO[indice], indice, camadas, comPayload }
}
