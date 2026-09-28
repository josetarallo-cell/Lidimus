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
  /**
   * Cabeçalho de ato encoberto pela tarja: sobrou a cauda da linha, a lacuna
   * está cercada e a data cabe entre as vizinhas.
   *
   * Não é verificação dura — é conjunção de quatro sinais —, mas fica acima das
   * demais heurísticas porque é o único achado que, ficando sem resposta,
   * SUPRIME o relatório inteiro: o parser vê salto de numeração, conclui
   * "matrícula incompleta" e manda o cliente comprar uma certidão que traria
   * exatamente o mesmo arquivo.
   */
  ato_cabecalho_perdido: 92,
  /**
   * Cabeçalho lido com uma letra no lugar do número ("R.e" por "R.8"), no único
   * vão da numeração que ele pode ocupar. Mesma razão do cabeçalho encoberto:
   * sem resposta, o salto suprime o relatório — e na 33.032 o palpite de
   * confiança do token (70%) perdeu as oito vagas para rubricas a 25%.
   */
  ato_numero_ilegivel: 92,
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
// o miolo exige o formato `número<separador>matrícula` — é essa forma, e não a
// palavra "R" ou "Av", que identifica um cabeçalho de ato.
//
// O separador aceita ESPAÇO além de `/` e `-`, e não por elegância: o 15º RI de
// São Paulo escreve "Av.01 - 119.908 - São Paulo, 27 de abril de 1.990.", e o
// carimbo diagonal da certidão eletrônica come o hífen com frequência. Na
// matrícula 119.908 sobrou "Av.01 119.908" em sete dos dez atos — nenhum
// cabeçalho foi reconhecido, `detectarAtos` desistiu no piso de três e a
// digitação errada do cartório no Av.03 ("199.908" em lugar de "119.908") nunca
// chegou à conferência humana. É justamente o erro que esta função existe para
// pegar.
//
// O que o separador NÃO pode ser é opcional. Em "Av. 417529" (a barra de
// "4/7529" lida como 1, na matrícula 7.529) os dígitos correm juntos, e sem
// separador obrigatório o número do ato sairia como 41.
const RE_ATO =
  /\b(R|AV)(?![A-Za-zÀ-ÿ])\s*[.\-]?\s*(\d{1,3})(?:\s*[/-]\s*|\s+)(\d[\d.]{1,11})\b/gi

type Cabecalho = {
  numero: number
  /** `null` no cabeçalho de linha, que não traz a matrícula colada */
  matricula: number | null
  /** Offsets do trecho da matrícula dentro do texto */
  mInicio: number
  mFim: number
  /** Offsets do trecho do número do ato */
  nInicio: number
  nFim: number
  fimDoMatch: number
}

// ─── Cabeçalho de linha, sem a matrícula colada ───────────────────────────────
//
// Nem todo cartório cola a matrícula no número do ato. O 1º RI de Mogi das
// Cruzes datilografa "R.1 USUCAPIÃO", "Av.3 - CASAMENTO" ou o assunto na linha
// de baixo ("Av.2⏎OBITO"). Na matrícula 33.032 isso deixou o detector abaixo do
// piso de três cabeçalhos, e o "R.8" que o OCR leu como "R.e" nunca chegou à
// tela — o parser jurídico, sem ele, declarou faltando o ato 8.
//
// Este formato SOMA ao de matrícula; não o substitui. Sem a matrícula como
// âncora, o que segura o falso positivo é a forma: começo de linha, ponto
// obrigatório entre a letra e o número (sem ele, o "R5" que o carimbo da ONR
// deixa antes de "SOLICITADO POR" vira ato) e assunto em CAIXA ALTA logo depois,
// que citação no corpo ("objeto da Av.4 retro") não tem. Mês por extenso fica
// de fora porque "AV. 9 JULHO" abrindo linha é endereço.
const MESES_CAIXA_ALTA =
  '(?:JANEIRO|FEVEREIRO|MAR[ÇC]O|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)'
const ASSUNTO_DO_ATO = String.raw`(?=[ \t]*[-–:]?[ \t]*\n?[ \t]*(?!${MESES_CAIXA_ALTA}\b)[A-ZÀ-Ü]{4,})`
const RE_ATO_LINHA = new RegExp(
  String.raw`(?<=^[ \t"']*)\b(R|AV|Av)[ \t]*\.[ \t]*(\d{1,3})(?!\d)` + ASSUNTO_DO_ATO,
  'gm',
)
// O mesmo cabeçalho com UMA letra no lugar do número. Uma só: "R. DE MORAES"
// abrindo linha é rua, e "AV. SÃO PAULO" também.
const RE_ATO_MUTILADO = new RegExp(
  String.raw`(?<=^[ \t"']*)\b(R|AV|Av)[ \t]*\.[ \t]*([A-Za-z])(?![A-Za-zÀ-ÿ\d])` + ASSUNTO_DO_ATO,
  'gm',
)

function lerCabecalhosDeLinha(texto: string, jaLidos: Cabecalho[]): Cabecalho[] {
  const lista: Cabecalho[] = []
  for (const m of texto.matchAll(RE_ATO_LINHA)) {
    const nInicio = m.index! + m[0].lastIndexOf(m[2])
    // Onde o formato de matrícula já leu, ele manda
    if (jaLidos.some((c) => nInicio >= c.nInicio && nInicio < c.fimDoMatch)) continue
    const nFim = nInicio + m[2].length
    lista.push({
      numero: Number(m[2]),
      matricula: null,
      mInicio: nInicio,
      mFim: nFim,
      nInicio,
      nFim,
      fimDoMatch: m.index! + m[0].length,
    })
  }
  return lista
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
// ─── Cabeçalho encoberto pela tarja ───────────────────────────────────────────
//
// A tarja diagonal da certidão eletrônica ("PARA SIMPLES CONSULTA — NÃO VALE
// COMO CERTIDÃO") passa por cima do texto e o Document AI simplesmente não lê o
// que está embaixo. Na matrícula 119.908 o cabeçalho "AV. 06 - 119.908 - São"
// não existe no texto do OCR, nem no bruto: sobrou só o fim da linha,
// "Paulo, 18 de setembro de 1990.".
//
// O parser jurídico então vê salto de numeração, classifica como página
// ausente e suprime o relatório — mandando comprar do cartório o mesmo arquivo
// que já está na mão. É um falso negativo caro, e a tarja é padrão do ONR: o
// caso se repete em certidão eletrônica de todo o país.
//
// A evidência de que o ato existe é o resto dele: a cauda da linha do cabeçalho
// e o corpo da averbação vieram. A página CHEGOU — o que faltou foi ler o
// rótulo. É a diferença entre "a face não veio" e "a face veio e o rótulo se
// perdeu", e é ela que este detector mede.

// A cauda: "<Cidade>, <data>" sozinha numa linha.
//
// A âncora de linha inteira (^…$ com /m) é o que segura o detector, e não é
// detalhe: matrícula cita "escritura lavrada em São Paulo, 18 de setembro de
// 1990, no 5º Tabelião" o tempo todo. Medido no corpus de 20 certidões reais, o
// regex sem a âncora acende 33 vezes num único documento; com ela, e com os
// filtros abaixo, o total cai a zero fora do documento defeituoso.
const RE_CAUDA_EXTENSO =
  /^[ \t]*([^\n,]{1,40}),[ \t]*(\d{1,2})[ \t]+de[ \t]+([A-Za-zÀ-ÿ]{3,12})[ \t]+de[ \t]+(\d{1,2}\.?\d{3})[ \t]*\.?[ \t]*$/gm
const RE_CAUDA_NUMERICA =
  /^[ \t]*([^\n,]{1,40}),[ \t]*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})[ \t]*\.?[ \t]*$/gm

// O topo de cada ficha repete "LIVRO N° 2 / matrícula / 82.662 / ficha / 04" e
// logo abaixo a data de abertura da face, na mesma forma "Cidade, data" — foi o
// único falso positivo do corpus (matrícula 82.662), e só a vizinhança o
// distingue de uma cauda de verdade.
const RE_BLOCO_FICHA = /LIVRO\s*N|matr[íi]cula\s*\n|\bficha\b|CNM:|Oficial:|REGISTRO\s*\n?\s*GERAL/i

// Fragmentos que abrem linha de protocolo, não de ato.
const RE_CAUDA_RUIDO = /Prenota|Livro|ficha|CERTIFICO|Protocolo|SOLICITADO/i

/** Ano escrito "1990" ou "1.990", como a ficha datilografada faz. */
function anoDe(trecho: string): number | null {
  const m = trecho.match(/\b(1[89]\d{2}|20\d{2}|[12]\.\d{3})\b/)
  if (!m) return null
  const n = Number(m[1].replace('.', ''))
  return Number.isFinite(n) ? n : null
}

type Cauda = { inicio: number; fim: number; texto: string; ano: number }

/**
 * A cauda órfã que explica um número ausente entre dois atos lidos.
 *
 * Devolve `null` quando não há — e o silêncio é o desfecho certo: sem a cauda
 * não há evidência de que a face chegou, e a lacuna continua sendo lacuna.
 */
function caudaOrfa(
  texto: string,
  cabecalhos: Cabecalho[],
  anterior: Cabecalho,
  seguinte: Cabecalho,
  quantosAusentes: number,
): Cauda | null {
  const anoAnterior = anoDe(texto.slice(anterior.fimDoMatch, anterior.fimDoMatch + 300))
  const anoSeguinte = anoDe(texto.slice(seguinte.fimDoMatch, seguinte.fimDoMatch + 300))

  const achadas: Cauda[] = []
  for (const re of [RE_CAUDA_EXTENSO, RE_CAUDA_NUMERICA]) {
    for (const m of texto.matchAll(new RegExp(re.source, re.flags))) {
      // Entre os dois atos que cercam a lacuna, e em nenhum outro lugar.
      if (m.index! <= anterior.fimDoMatch || m.index! >= seguinte.nInicio) continue

      const fragmento = m[1]
      if (RE_CAUDA_RUIDO.test(fragmento)) continue
      if (re === RE_CAUDA_EXTENSO && !MESES.includes(m[3].toLowerCase())) continue

      // Coberta por um cabeçalho que FOI lido: é a cauda dele, não órfã.
      if (cabecalhos.some((c) => m.index! >= c.nInicio && m.index! < c.fimDoMatch)) continue

      // Topo de ficha, não cabeçalho de ato.
      if (RE_BLOCO_FICHA.test(texto.slice(Math.max(0, m.index! - 260), m.index!))) continue

      // Cauda de um cabeçalho que quebrou de linha, ou linha de abertura que
      // vem colada num ato lido: nos dois casos não falta rótulo nenhum.
      const antes = texto.slice(0, m.index!).split('\n').filter((l) => l.trim()).slice(-2)
      const depois = texto.slice(m.index! + m[0].length).split('\n').find((l) => l.trim()) ?? ''
      const ehCabecalho = (l: string) => new RegExp(RE_ATO.source, 'i').test(l)
      if (antes.some(ehCabecalho) || ehCabecalho(depois)) continue

      const ano = anoDe(m[0])
      if (ano === null) continue
      // Cronologia: registro feito hoje de escritura antiga é rotina, então uma
      // data fora da janela dos vizinhos não prova nada e o detector cala.
      if (anoAnterior !== null && ano < anoAnterior) continue
      if (anoSeguinte !== null && ano > anoSeguinte) continue

      const recuo = m[0].length - m[0].trimStart().length
      const inicio = m.index! + recuo
      const semRabo = fragmento.replace(/\s+$/, '')
      if (!semRabo) continue
      achadas.push({ inicio, fim: inicio + semRabo.length, texto: semRabo, ano })
    }
  }

  // Contagem casada: uma cauda justifica um ato, não seis. Sem isto, uma linha
  // solta explicaria um bloco inteiro de páginas que nunca chegaram.
  if (achadas.length !== quantosAusentes) return null
  return achadas[0] ?? null
}

/**
 * O cabeçalho provável, para pré-preencher o campo.
 *
 * A letra sai do CORPO do ato, não de chute: averbação abre com "Do requerimento
 * … verifica-se que" e registro com "TRANSMITENTE/ADQUIRENTE/TÍTULO". Errar a
 * letra troca a natureza do ato — registro transmite domínio, averbação não —,
 * e por isso a tela pede confirmação na imagem mesmo com o campo preenchido.
 */
function cabecalhoProvavel(
  texto: string,
  cauda: Cauda,
  numero: number,
  matricula: number,
  irmaos: Cabecalho[],
): string {
  const corpo = texto.slice(cauda.fim, cauda.fim + 400)
  const ehRegistro = /TRANSMITENTE|ADQUIRENTE|T[ÍI]TULO\s*:|FORMA DO T[ÍI]TULO|VALOR\s*:/i.test(corpo)
  const ehAverbacao = /requerimento|verifica-se|procedo|averba[çc][ãa]o|nos termos d/i.test(corpo)
  const letra = ehRegistro && !ehAverbacao ? 'R' : 'AV'

  // A cidade vem de um irmão: o OCR leu "Paulo" aqui, mas "São Paulo" nos
  // outros atos. Reconstruir com o fragmento mutilado devolveria um cabeçalho
  // sutilmente errado, que é pior que um evidentemente incompleto.
  const cidades = new Map<string, number>()
  for (const c of irmaos) {
    const m = texto.slice(c.fimDoMatch, c.fimDoMatch + 60).match(/^[\s\-]*([^\n,]{2,40}),/)
    if (!m) continue
    const nome = m[1].trim()
    if (nome) cidades.set(nome, (cidades.get(nome) ?? 0) + 1)
  }
  let cidade = cauda.texto
  let max = 0
  for (const [nome, n] of cidades) {
    if (n > max && nome.toLowerCase().endsWith(cauda.texto.toLowerCase())) {
      max = n
      cidade = nome
    }
  }

  const mat = String(matricula).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${letra}.${String(numero).padStart(2, '0')} - ${mat} - ${cidade}`
}

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
  const deMatricula = lerCabecalhos(texto)
  const cabecalhos = [...deMatricula, ...lerCabecalhosDeLinha(texto, deMatricula)]
  if (cabecalhos.length < 3) return []

  const achados: Suspeita[] = []
  const dominante = moda(deMatricula.map((c) => c.matricula as number))

  // Matrícula divergente: numa certidão, todos os atos são da mesma matrícula.
  // Um número diferente do dominante é dígito lido errado — e é exatamente o
  // erro que faz o parser jurídico ver salto de numeração e declarar incompleta
  // uma certidão inteira.
  for (const c of deMatricula) {
    if (dominante === null || c.matricula === dominante) continue
    achados.push({
      motivo: 'ato',
      rotulo: `Ato de outra matrícula (${c.matricula}); o resto do documento é da ${dominante}`,
      inicio: c.mInicio,
      fim: c.mFim,
      peso: PESOS.ato_matricula,
    })
  }

  // O cabeçalho de linha não traz matrícula para divergir: entra direto na
  // sequência, ao lado dos que são da matrícula dominante.
  const daMatricula = cabecalhos.filter((c) => c.matricula === null || c.matricula === dominante)
  const mutilados = [...texto.matchAll(RE_ATO_MUTILADO)]

  // Salto na numeração. Pode ser página faltando (o que a checagem de
  // integridade já apura) ou dígito lido errado — e só quem tem o documento na
  // mão distingue os dois.
  const porNumero = [...daMatricula].sort((a, b) => a.numero - b.numero)
  for (let i = 1; i < porNumero.length; i++) {
    const anterior = porNumero[i - 1]
    const seguinte = porNumero[i]
    const salto = seguinte.numero - anterior.numero
    if (salto <= 1 || salto > 20) continue

    // Número virado letra ("R.e" por "R.8") no único vão que ele pode ocupar:
    // a numeração salta exatamente um e há um cabeçalho mutilado entre os dois
    // vizinhos. Com dois números possíveis, ou dois mutilados, deduzir seria
    // adivinhar — cai no aviso de salto. Como a cauda órfã, este achado
    // SUBSTITUI o salto: é a mesma pergunta, e este mostra o recorte certo.
    if (salto === 2) {
      const noVao = mutilados.filter((m) => m.index! >= anterior.fimDoMatch && m.index! < seguinte.nInicio)
      if (noVao.length === 1) {
        const m = noVao[0]
        const ausente = anterior.numero + 1
        const comZero = texto.slice(anterior.nInicio, anterior.nFim).startsWith('0')
        achados.push({
          motivo: 'cabecalho',
          rotulo: `Número do ato ilegível; pela posição é o ato ${ausente}`,
          inicio: m.index!,
          fim: m.index! + m[0].length,
          peso: PESOS.ato_numero_ilegivel,
          ajuda:
            'O OCR leu uma letra no lugar do número deste cabeçalho, e sem o número o ato conta como ausente. '
            + `Pela posição, entre o ato ${anterior.numero} e o ${seguinte.numero}, ele só pode ser o ${ausente}. `
            + 'Confira na imagem — em especial a letra: AV é averbação, R é registro, e são coisas juridicamente diferentes.',
          sugestao: `${m[1]}.${comZero ? String(ausente).padStart(2, '0') : ausente}`,
        })
        continue
      }
    }

    // Quando a cauda órfã explica a lacuna, ela SUBSTITUI o aviso de salto — os
    // dois são o mesmo achado. E é o aviso de salto que perde: ele ancora no
    // número do ato SEGUINTE, ou seja, mostra ao usuário o recorte do ato
    // errado, e não lhe dá nada para digitar. Somar os dois também gastaria
    // duas das oito vagas da tela com a mesma pergunta.
    const cauda = dominante !== null ? caudaOrfa(texto, cabecalhos, anterior, seguinte, salto - 1) : null
    if (cauda) {
      const ausente = anterior.numero + 1
      achados.push({
        motivo: 'cabecalho',
        rotulo: `O cabeçalho do ato ${ausente} não foi lido; esta linha começa no meio`,
        inicio: cauda.inicio,
        fim: cauda.fim,
        peso: PESOS.ato_cabecalho_perdido,
        ajuda:
          'A tarja da certidão encobriu o começo desta linha e o cabeçalho do ato não foi lido. '
          + 'Confira na imagem e digite o cabeçalho inteiro até o nome da cidade — '
          + 'em especial a letra: AV é averbação, R é registro, e são coisas juridicamente diferentes.',
        sugestao: cabecalhoProvavel(texto, cauda, ausente, dominante, daMatricula),
        recorteLargo: true,
      })
      continue
    }

    achados.push({
      motivo: 'ato',
      rotulo: `Numeração salta de ${anterior.numero} para ${seguinte.numero}`,
      inicio: seguinte.nInicio,
      fim: seguinte.nFim,
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
      t.e - grupo.inicio <= MAX_CHARS_GRUPO &&
      // Quebra de linha encerra o grupo. Sem isto, "…ares" no fim de uma linha
      // e "5,0" no começo da seguinte viram um candidato só: o recorte precisa
      // de uma caixa alta o bastante para cobrir as duas linhas (e tudo que há
      // entre elas), e o campo de texto, que é de uma linha, obrigaria o usuário
      // a decidir sozinho o que fazer com a quebra. São duas perguntas
      // diferentes; a tela faz as duas.
      !texto.slice(grupo.fim, t.s).includes('\n')

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
