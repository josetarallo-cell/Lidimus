// Os detectores: o filtro que decide o que vale interromper o usuário.
//
// A regra que organiza tudo aqui: **verificação dura antes de palpite**. Um CPF
// cujo dígito verificador não fecha é erro de leitura com certeza matemática —
// não custa nada ao usuário confirmar, e o ganho é uma qualificação de titular
// correta. Já "o OCR ficou 78% confiante nesta palavra" é palpite: acerta muito,
// mas erra o suficiente para cansar quem revisa. Por isso a confiança nunca
// compete com as verificações duras por espaço na tela — ela só preenche o que
// sobrar.
//
// O que NÃO entra aqui, de propósito: correção automática. Em nenhum caso o
// sistema conserta sozinho o que detectou. Um CPF que não fecha pode ser erro de
// leitura ou pode ser o que está escrito na matrícula — e essas duas coisas têm
// consequências jurídicas opostas. Quem decide é o humano; o software só aponta.

import type { MotivoSuspeita, Suspeita, TokenOcr } from './tipos.ts'

/**
 * Prioridade na tela. A escala é grosseira de propósito — o que importa é a
 * ordem entre as famílias, não a diferença de dois pontos dentro de uma delas.
 *
 * Toda verificação dura fica acima de 50 e toda heurística abaixo: é o que
 * garante que oito palavras de confiança média nunca empurrem para fora da tela
 * um CNPJ que não fecha.
 */
export const PESOS = {
  cpf_cnpj: 100,
  homoglifo: 96,
  ato_matricula: 94,
  data_invalida: 90,
  data_fora_de_ordem: 72,
  ato_salto: 70,
  numero_com_letra: 62,
  numero_malformado: 56,
  /** Base da confiança; soma até +30 conforme a leitura é mais duvidosa */
  confianca: 10,
} as const

/** Abaixo disso a leitura do Document AI entra na fila de conferência. */
export const LIMITE_CONFIANCA = 0.85

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** Ano mais antigo plausível numa matrícula brasileira em circulação. */
const ANO_MINIMO = 1850

// ─── CPF e CNPJ ───────────────────────────────────────────────────────────────

function digitosIguais(d: string): boolean {
  return /^(\d)\1*$/.test(d)
}

/** Dígito verificador por soma ponderada — o algoritmo da Receita, os dois. */
function dvPorPesos(digitos: string, pesos: number[]): number {
  const soma = pesos.reduce((s, peso, i) => s + peso * Number(digitos[i]), 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export function cpfValido(bruto: string): boolean {
  const d = bruto.replace(/\D/g, '')
  if (d.length !== 11 || digitosIguais(d)) return false
  const dv1 = dvPorPesos(d, [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const dv2 = dvPorPesos(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  return dv1 === Number(d[9]) && dv2 === Number(d[10])
}

export function cnpjValido(bruto: string): boolean {
  const d = bruto.replace(/\D/g, '')
  if (d.length !== 14 || digitosIguais(d)) return false
  const dv1 = dvPorPesos(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const dv2 = dvPorPesos(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return dv1 === Number(d[12]) && dv2 === Number(d[13])
}

// Só as formas inteiramente pontuadas. O cartório escreve CPF e CNPJ com ponto e
// traço; exigir a pontuação é o que mantém este detector em zero falso positivo,
// porque separa um CPF de qualquer outra sequência de onze dígitos do documento
// (código CNM, número de protocolo, CEP colado a telefone).
const RE_CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g
const RE_CNPJ = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g

export function detectarDocumentos(texto: string): Suspeita[] {
  const achados: Suspeita[] = []

  for (const [re, tipo, valido] of [
    [RE_CPF, 'CPF', cpfValido],
    [RE_CNPJ, 'CNPJ', cnpjValido],
  ] as const) {
    re.lastIndex = 0
    for (const m of texto.matchAll(re)) {
      if (valido(m[0])) continue
      achados.push({
        motivo: 'cpf_cnpj',
        rotulo: `${tipo} com dígito verificador inválido`,
        inicio: m.index!,
        fim: m.index! + m[0].length,
        peso: PESOS.cpf_cnpj,
      })
    }
  }

  return achados
}

// ─── Datas ────────────────────────────────────────────────────────────────────

function diasNoMes(mes: number, ano: number): number {
  if (mes === 2) return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(mes) ? 30 : 31
}

const RE_DATA_NUMERICA = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g
const RE_DATA_ESCRITA = /\b(\d{1,2})\s*[º°]?\s+de\s+([A-Za-zÀ-ÿ]+)\s+de\s+(\d{4})\b/gi

/**
 * O trecho que parece data é, na verdade, um pedaço de um número maior?
 *
 * É a guarda mais importante deste arquivo. Matrícula transcreve número de
 * processo no padrão CNJ o tempo todo — `0151200-48.2001.5.15.0108` — e dentro
 * dele há `5.15.0108`, que tem a forma exata de uma data com mês 15. Numa
 * certidão real com dezoito penhoras trabalhistas isso rendeu vinte e cinco
 * "datas impossíveis" e nenhum erro de leitura: teria enterrado os dois achados
 * verdadeiros do documento e ensinado o usuário a fechar a tela.
 *
 * O critério é posicional, não semântico: data de verdade não tem dígito, ponto,
 * traço nem barra encostado nela. O ponto final de frase depois do ano é a única
 * exceção — por isso ele é aceito à direita e recusado à esquerda.
 */
function dentroDeNumeroMaior(texto: string, inicio: number, fim: number): boolean {
  const antes = inicio > 0 ? texto[inicio - 1] : ''
  const depois = fim < texto.length ? texto[fim] : ''
  return /[\d.\-/]/.test(antes) || /[\d\-/]/.test(depois)
}

export function detectarDatas(texto: string, anoAtual = new Date().getFullYear()): Suspeita[] {
  const achados: Suspeita[] = []
  const anoMaximo = anoAtual + 1

  for (const m of texto.matchAll(RE_DATA_NUMERICA)) {
    if (dentroDeNumeroMaior(texto, m.index!, m.index! + m[0].length)) continue
    const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const problema =
      mes < 1 || mes > 12
        ? 'mês inexistente'
        : dia < 1 || dia > diasNoMes(mes, ano)
          ? 'dia que não existe nesse mês'
          : ano < ANO_MINIMO || ano > anoMaximo
            ? 'ano fora do período possível'
            : null
    if (!problema) continue
    achados.push({
      motivo: 'data',
      rotulo: `Data impossível — ${problema}`,
      inicio: m.index!,
      fim: m.index! + m[0].length,
      peso: PESOS.data_invalida,
    })
  }

  for (const m of texto.matchAll(RE_DATA_ESCRITA)) {
    const dia = Number(m[1])
    const nome = m[2].toLowerCase()
    const ano = Number(m[3])
    const mes = MESES.indexOf(nome) + 1

    if (mes === 0) {
      // Nome de mês que não é nome de mês: sobrou letra trocada na leitura.
      // A caixa aponta só a palavra, não a data inteira — é a palavra que o
      // usuário precisa reler na imagem.
      const desloc = m[0].indexOf(m[2])
      achados.push({
        motivo: 'data',
        rotulo: 'Nome de mês não reconhecido',
        inicio: m.index! + desloc,
        fim: m.index! + desloc + m[2].length,
        peso: PESOS.data_invalida,
      })
      continue
    }

    const problema =
      dia < 1 || dia > diasNoMes(mes, ano)
        ? 'dia que não existe nesse mês'
        : ano < ANO_MINIMO || ano > anoMaximo
          ? 'ano fora do período possível'
          : null
    if (!problema) continue
    achados.push({
      motivo: 'data',
      rotulo: `Data impossível — ${problema}`,
      inicio: m.index!,
      fim: m.index! + m[0].length,
      peso: PESOS.data_invalida,
    })
  }

  return achados
}

// ─── Cabeçalhos de ato (R.5/12.345, Av.2/7529) ────────────────────────────────

// O prefixo não pode ser seguido de letra (senão "AVENIDA" e "Rua" entrariam), e
// o miolo exige o formato `número/matrícula` — é essa forma, e não a palavra
// "R" ou "Av", que identifica um cabeçalho de ato.
const RE_ATO = /\b(R|AV)(?![A-Za-zÀ-ÿ])\s*[.\-]?\s*(\d{1,3})\s*[/-]\s*(\d[\d.]{1,11})\b/gi

type Cabecalho = {
  numero: number
  matricula: number
  /** Offsets do trecho da matrícula dentro do texto */
  mInicio: number
  mFim: number
  /** Offsets do trecho do número do ato */
  nInicio: number
  nFim: number
  fimDoMatch: number
}

function lerCabecalhos(texto: string): Cabecalho[] {
  const lista: Cabecalho[] = []
  for (const m of texto.matchAll(RE_ATO)) {
    const matricula = Number(m[3].replace(/\./g, ''))
    if (!Number.isFinite(matricula) || matricula === 0) continue
    const desMat = m[0].lastIndexOf(m[3])
    const desNum = m[0].indexOf(m[2])
    lista.push({
      numero: Number(m[2]),
      matricula,
      mInicio: m.index! + desMat,
      mFim: m.index! + desMat + m[3].length,
      nInicio: m.index! + desNum,
      nFim: m.index! + desNum + m[2].length,
      fimDoMatch: m.index! + m[0].length,
    })
  }
  return lista
}

function moda(valores: number[]): number | null {
  const contagem = new Map<number, number>()
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1)
  let vencedor: number | null = null
  let max = 0
  for (const [v, n] of contagem) {
    if (n > max) {
      max = n
      vencedor = v
    }
  }
  return vencedor
}

/**
 * Um dígito trocado transforma este ano em algo que caberia na sequência?
 *
 * É a guarda que mantém o detector de cronologia honesto. Matrícula tem data de
 * ato fora de ordem por motivo legítimo o tempo todo (registro feito hoje de
 * escritura de anos atrás). Mas quando a inversão desaparece mudando *um único
 * dígito* do ano — 2019 lido como 2079, 1998 como 1908 — a explicação
 * esmagadoramente mais provável é o OCR, não o cartório.
 */
function umDigitoResolve(ano: number, piso: number, teto: number): boolean {
  const s = String(ano)
  for (let i = 0; i < s.length; i++) {
    for (let d = 0; d <= 9; d++) {
      const candidato = Number(s.slice(0, i) + d + s.slice(i + 1))
      if (candidato !== ano && candidato >= piso && candidato <= teto) return true
    }
  }
  return false
}

export function detectarAtos(texto: string, anoAtual = new Date().getFullYear()): Suspeita[] {
  const cabecalhos = lerCabecalhos(texto)
  if (cabecalhos.length < 3) return []

  const achados: Suspeita[] = []
  const dominante = moda(cabecalhos.map((c) => c.matricula))

  // Matrícula divergente: numa certidão, todos os atos são da mesma matrícula.
  // Um número diferente do dominante é dígito lido errado — e é exatamente o
  // erro que faz o parser jurídico ver salto de numeração e declarar incompleta
  // uma certidão inteira.
  for (const c of cabecalhos) {
    if (dominante === null || c.matricula === dominante) continue
    achados.push({
      motivo: 'ato',
      rotulo: `Ato de outra matrícula (${c.matricula}); o resto do documento é da ${dominante}`,
      inicio: c.mInicio,
      fim: c.mFim,
      peso: PESOS.ato_matricula,
    })
  }

  const daMatricula = cabecalhos.filter((c) => c.matricula === dominante)

  // Salto na numeração. Pode ser página faltando (o que a checagem de
  // integridade já apura) ou dígito lido errado — e só quem tem o documento na
  // mão distingue os dois.
  const porNumero = [...daMatricula].sort((a, b) => a.numero - b.numero)
  for (let i = 1; i < porNumero.length; i++) {
    const salto = porNumero[i].numero - porNumero[i - 1].numero
    if (salto <= 1 || salto > 20) continue
    achados.push({
      motivo: 'ato',
      rotulo: `Numeração salta de ${porNumero[i - 1].numero} para ${porNumero[i].numero}`,
      inicio: porNumero[i].nInicio,
      fim: porNumero[i].nFim,
      peso: PESOS.ato_salto,
    })
  }

  // Cronologia: o ano de cada ato, na ordem em que os atos aparecem.
  const anos = daMatricula.map((c) => {
    const janela = texto.slice(c.fimDoMatch, c.fimDoMatch + 300)
    const m = janela.match(/\b(1[89]\d{2}|20\d{2})\b/)
    if (!m) return null
    return { ano: Number(m[1]), inicio: c.fimDoMatch + m.index!, fim: c.fimDoMatch + m.index! + 4 }
  })

  for (let i = 1; i < anos.length; i++) {
    const atual = anos[i]
    const anterior = anos[i - 1]
    if (!atual || !anterior) continue
    if (atual.ano >= anterior.ano) continue
    const teto = anos.slice(i + 1).find((a) => a)?.ano ?? anoAtual + 1
    if (!umDigitoResolve(atual.ano, anterior.ano, teto)) continue
    achados.push({
      motivo: 'data',
      rotulo: `Ano fora da ordem dos atos (vem depois de ${anterior.ano})`,
      inicio: atual.inicio,
      fim: atual.fim,
      peso: PESOS.data_fora_de_ordem,
    })
  }

  return achados
}

// ─── Valores, áreas e medidas ─────────────────────────────────────────────────

/** Formato brasileiro: milhar em grupos de três, decimal depois da vírgula. */
const RE_NUMERO_BR = /^\d{1,3}(\.\d{3})*(,\d{1,4})?$|^\d+(,\d{1,4})?$/

// As letras dentro da classe são as que o OCR confunde com dígito (O/0, l/1,
// S/5, B/8). Capturá-las junto é o que permite acusar "R$ 1OO,00" em vez de ler
// "R$ 1" e seguir em frente como se estivesse tudo bem.
const CONFUNDIVEIS = 'OoIlSsBb'
const RE_MOEDA = new RegExp(String.raw`R\$\s*(\d[\d.,${CONFUNDIVEIS}]*)`, 'g')
const RE_MEDIDA = new RegExp(
  String.raw`\b(\d[\d.,${CONFUNDIVEIS}]*)\s*(m²|m2|metros quadrados|metros|ha\b|hectares|alqueires)`,
  'gi',
)

type LeituraDeNumero = {
  /** O número sem a pontuação de frase que o encostou */
  usado: string
  problema: { rotulo: string; peso: number } | null
}

/**
 * O que há de errado com este número, se houver.
 *
 * A pontuação no fim é devolvida antes de qualquer julgamento: em "pelo valor de
 * R$ 120.000,00, com área de..." a vírgula final é da oração, não do número.
 * Sem esse recorte, todo valor escrito no meio de uma frase seria acusado de erro
 * de leitura — e um detector que grita em documento perfeito é um detector que o
 * usuário aprende a ignorar.
 */
function analisarNumero(bruto: string): LeituraDeNumero {
  const usado = bruto.replace(/[.,]+$/, '')
  if (!usado) {
    return { usado: bruto, problema: { rotulo: 'Número ilegível', peso: PESOS.numero_malformado } }
  }
  if (/[A-Za-z]/.test(usado)) {
    return {
      usado,
      problema: { rotulo: 'Número com letra no meio dos dígitos', peso: PESOS.numero_com_letra },
    }
  }
  if (!RE_NUMERO_BR.test(usado)) {
    return {
      usado,
      problema: { rotulo: 'Pontuação do número inconsistente', peso: PESOS.numero_malformado },
    }
  }
  return { usado, problema: null }
}

export function detectarValores(texto: string): Suspeita[] {
  const achados: Suspeita[] = []

  for (const [re, tipo] of [
    [RE_MOEDA, 'valor'],
    [RE_MEDIDA, 'medida'],
  ] as const) {
    for (const m of texto.matchAll(re)) {
      const { usado, problema } = analisarNumero(m[1])
      if (!problema) continue
      const desloc = m[0].indexOf(m[1])
      achados.push({
        motivo: 'valor',
        rotulo: `${problema.rotulo} (${tipo})`,
        inicio: m.index! + desloc,
        fim: m.index! + desloc + usado.length,
        peso: problema.peso,
      })
    }
  }

  return achados
}

// ─── Letras de outro alfabeto ──────────────────────────────────────────────────

// O nó `Normalizar Texto` do lidimus-OCR troca por latinas os homóglifos gregos
// e cirílicos que já conhecemos. O que este detector pega é o que sobrou: letra
// de outro alfabeto que ninguém mapeou ainda. Matrícula brasileira não tem uma
// única letra grega, cirílica ou CJK legítima, então a detecção é por eliminação
// e não tem como dar falso positivo.
//
// Foi assim que "Av. 2/7529" virou "Aν. 2/7529" com nu grego em quatro
// averbações da matrícula 7.529 de São Bernardo: o parser não reconheceu os
// cabeçalhos, viu salto na numeração e declarou incompleta uma certidão de sete
// faces — mandando o cliente pedir inteiro teor ao cartório por causa de uma
// letra. Um recorte e um campo de texto resolveriam em cinco segundos.
//
// A classe negada com `\P{L}` dentro dela lê como "letra que não é latina":
// exclui do conjunto tudo que não é letra e tudo que é latino, e sobra
// exatamente o alfabeto estrangeiro.
const RE_ALFABETO_ESTRANHO = /[^\P{L}\p{Script=Latin}]+/gu

/** Até onde vale juntar dois trechos estranhos vizinhos num achado só. */
const VAO_MAXIMO = 3
const TRECHO_MAXIMO = 48

export function detectarHomoglifos(texto: string): Suspeita[] {
  const achados: Suspeita[] = []

  for (const m of texto.matchAll(RE_ALFABETO_ESTRANHO)) {
    const inicio = m.index!
    const fim = inicio + m[0].length
    const anterior = achados[achados.length - 1]

    // Quando o OCR alucina, alucina em bloco: uma certidão real trouxe três
    // palavras em árabe seguidas no meio do cabeçalho. São três achados para o
    // regex e um problema só para quem lê — juntá-los devolve duas das oito
    // vagas da tela.
    const vao = anterior ? texto.slice(anterior.fim, inicio) : ''
    if (
      anterior &&
      inicio - anterior.fim <= VAO_MAXIMO &&
      fim - anterior.inicio <= TRECHO_MAXIMO &&
      !/[\p{L}\p{Nd}]/u.test(vao)
    ) {
      anterior.fim = fim
      continue
    }

    achados.push({
      motivo: 'homoglifo',
      rotulo: 'Letra de outro alfabeto no meio da palavra',
      inicio,
      fim,
      peso: PESOS.homoglifo,
    })
  }

  return achados
}

// ─── Confiança da leitura ─────────────────────────────────────────────────────

/**
 * Teto do agrupamento. Sem ele, um documento inteiro lido mal viraria um único
 * candidato com o texto todo dentro — um campo de texto pedindo para redigitar a
 * matrícula, que é o oposto do que esta etapa serve.
 */
const MAX_TOKENS_GRUPO = 3
const MAX_CHARS_GRUPO = 32

/**
 * Tokens que o próprio Document AI leu com pouca confiança, agrupados em
 * palavras vizinhas.
 *
 * O agrupamento existe porque leitura ruim vem em bloco: um número datilografado
 * mal impresso derruba a confiança dos três tokens da linha, e mostrar três
 * recortes de dois caracteres cada gasta três das oito vagas da tela para
 * perguntar uma coisa só.
 */
export function detectarConfianca(
  texto: string,
  tokens: TokenOcr[],
  limite = LIMITE_CONFIANCA,
): Suspeita[] {
  const achados: Suspeita[] = []
  let grupo: { inicio: number; fim: number; pior: number; pagina: number; n: number } | null = null

  const fechar = () => {
    if (!grupo) return
    const trecho = texto.slice(grupo.inicio, grupo.fim)
    // Grupo sem letra nem dígito é sujeira de pontuação — pedir para o usuário
    // reler um travessão não melhora análise nenhuma.
    if (/[\p{L}\p{Nd}]/u.test(trecho)) {
      achados.push({
        motivo: 'confianca',
        rotulo: `Leitura duvidosa (${Math.round(grupo.pior * 100)}% de confiança)`,
        inicio: grupo.inicio,
        fim: grupo.fim,
        peso: PESOS.confianca + Math.round((1 - grupo.pior) * 30),
      })
    }
    grupo = null
  }

  for (const t of tokens) {
    if (t.c >= limite) {
      fechar()
      continue
    }
    const cabe =
      grupo !== null &&
      grupo.pagina === t.p &&
      t.s - grupo.fim <= 2 &&
      grupo.n < MAX_TOKENS_GRUPO &&
      t.e - grupo.inicio <= MAX_CHARS_GRUPO

    if (cabe && grupo) {
      grupo.fim = t.e
      grupo.pior = Math.min(grupo.pior, t.c)
      grupo.n += 1
      continue
    }
    fechar()
    grupo = { inicio: t.s, fim: t.e, pior: t.c, pagina: t.p, n: 1 }
  }
  fechar()

  return achados
}

/** Rótulo curto por família, para agrupar na interface. */
export const FAMILIA: Record<MotivoSuspeita, string> = {
  cpf_cnpj: 'Documento do titular',
  data: 'Data',
  ato: 'Numeração do ato',
  valor: 'Valor ou medida',
  homoglifo: 'Caractere estranho',
  confianca: 'Leitura duvidosa',
}
