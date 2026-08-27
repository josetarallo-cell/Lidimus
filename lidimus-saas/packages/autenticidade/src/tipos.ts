// Tipos do verificador de autenticidade — ver o plano em
// docs/ (arquivo do planejamento) para o desenho completo. Resumo do que cada
// tipo representa:
//
//   PericiaArquivo   → §1, o que dá para saber só olhando os bytes do PDF.
//   Ancoras          → §2/§3, selo TJSP e CNM lidos do texto ou do QR.
//   RespostaOnr      → §4, o que a consulta pública da ONR devolve (só os
//                       campos que este produto tem permissão de guardar).
//   Autenticidade    → §5, o veredito final que soma as três metades.
//
// Nada aqui bloqueia a leitura da matrícula: este pacote só classifica e
// documenta. Ver `veredito.ts` para a régua de classificação.

/** Cada indício individual que a perícia do arquivo levanta, com seu peso. */
export type CodigoIndicioArquivo =
  | 'arquivo_truncado'
  | 'mod_antes_da_criacao'
  | 'criacao_ausente'
  | 'xmp_diverge_do_info'
  | 'produtor_editor'
  | 'updates_incrementais'
  | 'assinatura_nao_cobre_o_arquivo'
  | 'paginas_heterogeneas'
  | 'produtor_rerender'
  | 'datas_divergentes'
  | 'data_futura'
  | 'sem_assinatura_digital'

/**
 * Indícios levantados só no veredito, ao cruzar a perícia do arquivo com as
 * âncoras (selo/CNM) e a resposta da ONR — nenhum dos três dá para ver
 * sozinho. Ver veredito.ts.
 */
export type CodigoIndicioCruzado =
  | 'selo_nao_fecha'
  | 'cnm_nao_fecha'
  | 'cartorio_diverge_da_onr'
  | 'cns_diverge_entre_fontes'
  | 'numero_matricula_diverge_do_cnm'
  | 'certidao_vencida'
  | 'reimpressao_pos_assinatura'

export type CodigoIndicio = CodigoIndicioArquivo | CodigoIndicioCruzado

export type PesoIndicio = 'alto' | 'medio' | 'informativo'

export type Indicio = {
  codigo: CodigoIndicio
  peso: PesoIndicio
  /** Frase em linguagem simples — é o que a tela e o DOCX mostram. */
  evidencia: string
}

/** `/Info` do PDF, já decodificado (literal, hex ou UTF-16BE com BOM). */
export type InfoPdf = {
  creationDate: string | null // ISO 8601, ou null se ausente/ilegível
  modDate: string | null
  producer: string | null
  creator: string | null
  author: string | null
  title: string | null
}

/** Metadados XMP relevantes, quando o PDF carrega o bloco `<x:xmpmeta>`. */
export type XmpPdf = {
  createDate: string | null
  modifyDate: string | null
  creatorTool: string | null
  documentId: string | null
  instanceId: string | null
}

export type ContagensPdf = {
  /** Nº de marcadores `%%EOF` — mais de um indica updates incrementais. */
  eof: number
  startxref: number
  /** `/Prev` no trailer — outro sinal de update incremental. */
  prev: number
  tipoSig: number
  byteRange: number
  acroForm: number
  encrypt: number
  subtypeImage: number
  tipoFont: number
}

export type PericiaArquivo = {
  versaoHeader: string | null
  info: InfoPdf
  xmp: XmpPdf | null
  contagens: ContagensPdf
  /** sha256 do arquivo inteiro, hex. Habilita detectar reenvio do mesmo PDF. */
  sha256: string
  paginas: number
  /** true quando o parser não achou xref/trailer/%%EOF — arquivo cortado. */
  truncado: boolean
  indicios: Indicio[]
}

/** Selo Digital TJSP, decomposto pelos 6 campos da spec (Provimento CG 30/2018). */
export type SeloTjsp = {
  /** Código completo, 25 posições, já normalizado (maiúsculas, sem espaços). */
  codigo: string
  cns: string
  natureza: string
  ato: string
  infoAto: string
  ano: string
  dv: string
  /** DV fecha pelo Luhn mod 36? */
  dvFecha: boolean
  /** true quando o código só fechou depois de corrigir confusões de OCR. */
  corrigidoPorDv: boolean
  /** De onde este selo veio — o QR é fonte primária quando os dois aparecem. */
  origem: 'qr' | 'texto_ocr'
}

/** CNM — Código Nacional de Matrícula (Provimento CNJ 89/2019). */
export type Cnm = {
  codigo: string
  cns: string
  livro: string
  numeroOrdem: string
  dv: string
  dvFecha: boolean
  livroEhRegistroGeral: boolean
  corrigidoPorDv: boolean
  origem: 'texto_ocr'
}

export type Ancoras = {
  selo: SeloTjsp | null
  cnm: Cnm | null
}

/** Conteúdo decodificado do QR do selo TJSP (spec §4.8–4.9). */
export type QrSelo = {
  selo25: string
  valorTotal: string | null
  iss: string | null
  /** Assinatura RSA em base64 — não verificável localmente, mas prova que o QR é o do TJSP. */
  assinaturaPresente: boolean
  pagina: number
}

/**
 * O que a API pública da ONR devolveu para um `document-keys`, restrito aos
 * campos que este produto tem permissão de guardar — ver a seção de
 * privacidade do plano. NUNCA inclui CPF, RG, data de nascimento, a assinatura
 * em base64 ou a URL do arquivo original (é credencial temporária).
 */
export type RespostaOnr = {
  cartorio: string | null
  cns: string | null
  /** Validade da certidão, ISO 8601 (data). */
  validade: string | null
  signingTime: string | null
  nomeSignatario: string | null
  politicaAssinatura: string | null
  temErrosDeValidacao: boolean
  temAvisosDeValidacao: boolean
  consultadoEm: string
}

export type StatusOnr = 'consultado' | 'nao_aplicavel' | 'indisponivel'

export type ConsultaOnr = {
  status: StatusOnr
  resposta: RespostaOnr | null
}

export type Classificacao =
  | 'original_assinado'
  | 'copia_verificavel'
  | 'reimpresso'
  | 'copia_sem_ancora'
  | 'editado'
  | 'indicios_de_adulteracao'
  | 'arquivo_danificado'

/** O que a tela e o DOCX mostram, no fim de tudo. */
export type Autenticidade = {
  classificacao: Classificacao
  /** 0 (nenhuma garantia) a 100 (assinatura íntegra confirmada). */
  score: number
  indicios: Indicio[]
  ancoras: Ancoras
  onr: ConsultaOnr | null
  /** Links prontos para o usuário conferir por conta própria, sem depender do Lidimus. */
  linksDeConferencia: { rotulo: string; url: string }[]
}
