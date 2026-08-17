// Tipos do corretor de leitura: a etapa humana entre o OCR e a análise
// jurídica. O que trafega aqui é o suficiente para (a) apontar uma palavra na
// imagem da página e (b) recolocar a correção no texto sem errar o lugar.

/**
 * Token do Google Document AI, já compactado pelo nó `Normalizar Texto` do
 * workflow lidimus-OCR.
 *
 * Os nomes são de uma letra de propósito. O índice de um documento de 30 faces
 * tem alguns milhares de tokens e viaja inteiro no POST de callback; escrever
 * `confianca` cinco mil vezes custa mais que o dado. O índice nunca é
 * persistido — morre no payload da fila, depois de virar no máximo 8 candidatos.
 */
export type TokenOcr = {
  /** Página, 1-based */
  p: number
  /** Caixa normalizada na página, 0..1: [x0, y0, x1, y1] */
  b: [number, number, number, number]
  /** Confiança da leitura, 0..1 */
  c: number
  /** Offset inicial no texto, como o Document AI reportou — ver offsets.ts */
  s: number
  /** Offset final, meio-aberto */
  e: number
}

/**
 * Por que este trecho foi levantado. A ordem da lista não importa; o que ordena
 * na tela é o `peso` do candidato.
 *
 * Os quatro primeiros são verificações duras: quando disparam, há erro de
 * leitura com certeza (ou o documento é inválido, o que também precisa de olho
 * humano). `confianca` é o único palpite — por isso entra sempre atrás.
 */
export type MotivoSuspeita =
  | 'cpf_cnpj'
  | 'data'
  | 'ato'
  | 'valor'
  | 'homoglifo'
  | 'confianca'

/** Trecho suspeito antes de ganhar caixa e recorte. Saída dos detectores. */
export type Suspeita = {
  motivo: MotivoSuspeita
  /** Frase que a tela mostra ao usuário. Diz o que está errado, não o que fazer. */
  rotulo: string
  /** Índice inicial no texto (índice de string JS, já reconciliado) */
  inicio: number
  /** Índice final, meio-aberto */
  fim: number
  /** Prioridade de exibição — ver PESOS em detectores.ts */
  peso: number
}

/** Uma posição do mesmo trecho no texto, com o contexto que a re-ancora. */
export type Ocorrencia = {
  inicio: number
  fim: number
  ctxAntes: string
  ctxDepois: string
}

/**
 * Trecho suspeito já ancorado numa página e pronto para a tela.
 *
 * `inicio`/`fim` são a ancoragem rápida e `textoLido` + contexto são a
 * ancoragem de segurança: se o texto mudar de forma entre levantar o candidato
 * e aplicar a correção, o índice sozinho colocaria a emenda no lugar errado —
 * o que é pior que o erro de OCR original.
 */
export type Candidato = Suspeita & {
  /** Estável dentro do job — é a chave que a correção do usuário referencia */
  id: string
  /** O que o OCR leu neste trecho */
  textoLido: string
  /** Caracteres imediatamente antes, para re-ancorar */
  ctxAntes: string
  /** Caracteres imediatamente depois, para re-ancorar */
  ctxDepois: string
  /** Página onde o trecho está, 1-based */
  pagina: number
  /** Caixa normalizada 0..1 da união dos tokens do trecho */
  caixa: [number, number, number, number]
  /**
   * Outros lugares onde o OCR leu exatamente a mesma coisa do mesmo jeito.
   *
   * A qualificação do titular se repete a cada transmissão, então um CPF mal
   * lido reaparece em cinco atos. Sem juntar as ocorrências, um único erro
   * consumiria cinco das oito vagas da tela para fazer cinco vezes a mesma
   * pergunta. A correção digitada uma vez vale para todas.
   */
  repeticoes: Ocorrencia[]
  /**
   * Recorte da palavra na página. Preenchido pelo worker de revisão; volta a
   * `null` depois que a revisão fecha — imagem de documento alheio não fica
   * guardada no banco por tempo indeterminado.
   *
   * Tem duas formas, de propósito:
   *   • no banco, o data URL (`data:image/png;base64,...`) que o worker gravou;
   *   • no payload que vai para a tela, o *endereço* de onde buscá-la.
   *
   * A troca acontece em `getJobForUser`, e a tela não precisa saber de nada: as
   * duas formas servem igualmente como origem de uma imagem no navegador.
   * Ela existe porque a primeira versão mandava as imagens dentro do payload de
   * status: oito recortes deram 256 KB, a mensagem do SSE não chegou ao
   * navegador e a tela ficou parada na espera com o job já esperando resposta.
   */
  recorte?: string | null
}

/** O que o usuário digitou para um candidato. */
export type Correcao = {
  id: string
  /** Texto correto. Vazio ou igual ao lido = o usuário confirmou o que estava lá. */
  texto: string
}

/** Registro do que a correção fez com o texto, para auditoria no stageData. */
export type CorrecaoAplicada = {
  id: string
  motivo: MotivoSuspeita
  de: string
  para: string
  /** Quantas posições do texto a correção emendou */
  ocorrencias: number
}

export type ResultadoAplicacao = {
  /** Texto do OCR com as correções encaixadas */
  texto: string
  aplicadas: CorrecaoAplicada[]
  /**
   * Correções que não puderam ser encaixadas com segurança (âncora perdida ou
   * ambígua). Preferimos deixar o texto original a emendar no lugar errado.
   */
  descartadas: { id: string; razao: string }[]
}
