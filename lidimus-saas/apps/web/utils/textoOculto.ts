// Ocultação pela codificação do caractere — o texto está lá, íntegro, e nenhuma
// fonte o desenha. Não depende de cor, de corpo nem do modo de renderização do
// PDF: sobrevive a copiar, colar e imprimir, e chega inteiro a qualquer extração
// Unicode-aware. É a família de técnicas que a camada de estilo nunca alcança.
//
// São cinco famílias, e a diferença entre elas importa para o laudo:
//
//   • tags            U+E0000–E007F — espelham o ASCII; usadas em ataque real
//                     contra LLM, cada caractere do payload deslocado para lá.
//   • largura-zero    U+200B e vizinhos — cabem *dentro* de uma palavra visível.
//                     Costumam carregar o payload em binário, um bit por
//                     caractere, e é isso que decodificarRunsBinarios desfaz.
//   • bidi            U+202E e vizinhos — invertem a ordem de leitura. A folha
//                     mostra uma coisa, a extração devolve outra.
//   • seletor         U+FE00–FE0F e U+E0100–E01EF — presos ao caractere anterior,
//                     sem desenho próprio.
//   • sem-glifo       preenchedores que a maioria das fontes ignora.
//
// Consequência para o laudo: exibir esse texto cru pinta uma caixa vazia — não
// há o que desenhar. Para *mostrar* a fraude (e não só anunciá-la) é preciso
// trazer os pontos de código de volta ao legível antes de renderizar. Vale em
// dobro para a família bidi: despejar um U+202E no laudo inverteria o texto da
// própria página que está denunciando o ataque.

export type FamiliaInvisivel = 'tags' | 'largura-zero' | 'bidi' | 'seletor' | 'sem-glifo'

const TAG_BASE = 0xe0000
const TAG_FIM = 0xe007f
const TAG_ESPACO = 0xe0020 // primeiro com equivalente imprimível (' ')
const TAG_TIL = 0xe007e // último com equivalente imprimível ('~')

// Os dois que carregam bit em payload binário: ZWSP e ZWNJ.
const ZWSP = 0x200b
const ZWNJ = 0x200c

const AVULSOS: Record<number, FamiliaInvisivel> = {
  0x00ad: 'largura-zero', // hífen opcional
  0x180e: 'largura-zero', // separador vogal mongol
  0x200b: 'largura-zero',
  0x200c: 'largura-zero',
  0x200d: 'largura-zero',
  0x2060: 'largura-zero', // word joiner
  0x2061: 'largura-zero', // aplicação de função
  0x2062: 'largura-zero', // vezes invisível
  0x2063: 'largura-zero', // separador invisível
  0x2064: 'largura-zero', // mais invisível
  0xfeff: 'largura-zero', // BOM no meio do texto
  0x115f: 'sem-glifo', // preenchedor jamo inicial
  0x1160: 'sem-glifo', // preenchedor jamo medial
  0x17b4: 'sem-glifo',
  0x17b5: 'sem-glifo',
  0x2800: 'sem-glifo', // braille em branco
  0x3164: 'sem-glifo', // preenchedor hangul
}

const INTERVALOS: Array<[number, number, FamiliaInvisivel]> = [
  [0x202a, 0x202e, 'bidi'],
  [0x2066, 0x2069, 'bidi'],
  [0xfe00, 0xfe0f, 'seletor'],
  [TAG_BASE, TAG_FIM, 'tags'],
  [0xe0100, 0xe01ef, 'seletor'],
]

/** A que família o ponto de código pertence, ou null se for texto comum. */
export function familiaInvisivel(cp: number): FamiliaInvisivel | null {
  const avulso = AVULSOS[cp]
  if (avulso) return avulso
  for (const [ini, fim, familia] of INTERVALOS) {
    if (cp >= ini && cp <= fim) return familia
  }
  return null
}

/** Há caractere invisível de qualquer família. */
export function temCaracteresInvisiveis(texto: string): boolean {
  if (!texto) return false
  return [...texto].some((ch) => familiaInvisivel(ch.codePointAt(0)!) !== null)
}

/** Quais famílias aparecem no texto, na ordem em que estão listadas acima. */
export function familiasPresentes(texto: string): FamiliaInvisivel[] {
  const vistas = new Set<FamiliaInvisivel>()
  for (const ch of texto ?? '') {
    const f = familiaInvisivel(ch.codePointAt(0)!)
    if (f) vistas.add(f)
  }
  return [...vistas]
}

/**
 * Desfaz o payload escondido em caracteres de largura zero: um bit por
 * caractere, oito bits por letra. Tenta as duas convenções (ZWSP=0 e ZWSP=1)
 * porque nenhuma delas é padrão — o que decide é qual das duas produz texto.
 */
export function decodificarRunsBinarios(texto: string): string[] {
  if (!texto) return []
  const achados: string[] = []
  // Corridas de ZWSP/ZWNJ com pelo menos um byte inteiro
  for (const m of texto.matchAll(/[​‌]{8,}/g)) {
    const bruto = m[0]
    for (const zeroEhZwsp of [true, false]) {
      const bits = [...bruto]
        .map((ch) => ((ch.codePointAt(0) === ZWSP) === zeroEhZwsp ? '0' : '1'))
        .join('')
      let saida = ''
      let legivel = true
      for (let i = 0; i + 8 <= bits.length; i += 8) {
        const code = Number.parseInt(bits.slice(i, i + 8), 2)
        // Fora do ASCII imprimível a convenção é a errada, ou não era texto
        if (code !== 9 && code !== 10 && code !== 13 && (code < 32 || code > 126)) {
          legivel = false
          break
        }
        saida += String.fromCharCode(code)
      }
      if (legivel && saida.trim().length >= 3) {
        achados.push(saida)
        break
      }
    }
  }
  return achados
}

/**
 * Devolve o trecho legível. As tags voltam ao ASCII original; uma corrida de
 * largura-zero que decodifica vira o texto que ela carregava, ali mesmo, na
 * posição em que estava; o resto dos invisíveis sai fora. Texto sem nada disso
 * atravessa sem mudança.
 */
export function revelarTextoOculto(texto: string): string {
  if (!texto) return ''

  // Primeiro as corridas binárias, para que o payload apareça onde estava
  const comBinarioRevelado = texto.replace(/[​‌]{8,}/g, (run) => {
    const [decodificado] = decodificarRunsBinarios(run)
    return decodificado ?? ''
  })

  return [...comBinarioRevelado]
    .map((ch) => {
      const cp = ch.codePointAt(0)!
      if (cp >= TAG_ESPACO && cp <= TAG_TIL) return String.fromCharCode(cp - TAG_BASE)
      // Tags de controle (cancel tag e afins) não têm equivalente legível, e as
      // demais famílias não carregam texto: o que elas fazem é esconder.
      return familiaInvisivel(cp) ? '' : ch
    })
    .join('')
}

// ── Homoglifos ──────────────────────────────────────────────────────────────
//
// Não são invisíveis: são caracteres com desenho igual ao de uma letra latina,
// vindos de outro alfabeto. Um "а" cirílico no lugar do "a" deixa a frase
// idêntica na tela e destrói qualquer casamento de palavra-chave — e como toda
// a escalada de risco do detector passa por casar palavra, é a troca com maior
// alcance por caractere. Entram aqui só para normalizar o texto ANTES de testar
// o conteúdo; nunca para exibir.

const CONFUSAVEIS: Record<string, string> = {
  // cirílico
  а: 'a', в: 'b', с: 'c', ԁ: 'd', е: 'e', ѕ: 's', і: 'i', ј: 'j', к: 'k',
  м: 'm', н: 'h', о: 'o', р: 'p', ԛ: 'q', г: 'r', т: 't', у: 'y', х: 'x',
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', І: 'I', Ј: 'J', К: 'K', М: 'M',
  О: 'O', Р: 'P', Ѕ: 'S', Т: 'T', У: 'Y', Х: 'X',
  // grego
  α: 'a', ο: 'o', ρ: 'p', ν: 'v', κ: 'k', ι: 'i', τ: 't', υ: 'u', χ: 'x',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N',
  Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
  // latinos de outros blocos
  ı: 'i', ȷ: 'j', ǃ: '!', ѐ: 'e',
}

/**
 * Texto pronto para casar palavra-chave: sem os invisíveis, com as variantes
 * tipográficas do Unicode dobradas (NFKC resolve largura dupla, matemáticos e
 * circulados) e com os homoglifos de volta ao alfabeto latino.
 *
 * Só para comparação. O que o laudo mostra é sempre `revelarTextoOculto`.
 */
export function normalizarParaAnalise(texto: string): string {
  if (!texto) return ''
  let saida = revelarTextoOculto(texto)
  try {
    saida = saida.normalize('NFKC')
  } catch {
    // Runtime sem normalize: segue com o texto como está — pior análise, não erro
  }
  return [...saida].map((ch) => CONFUSAVEIS[ch] ?? ch).join('')
}
