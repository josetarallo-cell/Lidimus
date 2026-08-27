// Veredito — §5 do plano. Soma as três metades (perícia do arquivo, âncoras,
// resposta da ONR) numa classificação única — a pior categoria atingida —, um
// score 0-100 e a lista de indícios em linguagem simples.
//
// NUNCA bloqueia: isto é classificação e documentação, não um portão. O
// chamador (callback do webhook) grava o resultado e segue o pipeline de
// qualquer forma — ver a nota em "Arquitetura" do plano.
//
// A ordem de avaliação abaixo é a pior-primeiro: a primeira regra que bate
// decide a classificação, mesmo que uma regra "melhor" também bateria (ex.:
// um arquivo reimpresso E com selo inválido é `indicios_de_adulteracao`, não
// `reimpresso` — o indício mais grave nunca fica escondido atrás de um mais
// ameno).

import type {
  Ancoras,
  Autenticidade,
  Classificacao,
  ConsultaOnr,
  Indicio,
  PericiaArquivo,
} from './tipos.ts'

export type CabecalhoLido = {
  cartorio?: string | null
  numeroMatricula?: string | null
}

export type EntradaVeredito = {
  pericia: PericiaArquivo
  ancoras: Ancoras
  onr: ConsultaOnr | null
  /** Código de documento da ONR já resolvido, para montar o link de conferência. */
  onrCodigo?: string | null
  /** O que o OCR leu no cabeçalho, para cruzar com ONR/CNM. */
  cabecalho?: CabecalhoLido
}

const MARCAS_DIACRITICAS = /[̀-ͯ]/g

function normalizar(s: string): string {
  return s.normalize('NFD').replace(MARCAS_DIACRITICAS, '').toUpperCase().trim()
}

function textosBatem(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true // sem os dois lados, não dá para afirmar divergência
  const na = normalizar(a)
  const nb = normalizar(b)
  return na === nb || na.includes(nb) || nb.includes(na)
}

/** Indícios que só existem cruzando as três fontes — não dá para ver em nenhuma sozinha. */
function indiciosCruzados(entrada: EntradaVeredito): Indicio[] {
  const { pericia, ancoras, onr, cabecalho } = entrada
  const indicios: Indicio[] = []
  const add = (codigo: Indicio['codigo'], peso: Indicio['peso'], evidencia: string) => {
    indicios.push({ codigo, peso, evidencia })
  }

  if (ancoras.selo && !ancoras.selo.dvFecha) {
    add(
      'selo_nao_fecha',
      'alto',
      `O Selo Digital encontrado ("${ancoras.selo.codigo}") não fecha o dígito verificador — não é um selo válido, ou foi copiado de outro documento e adaptado.`,
    )
  }

  if (ancoras.cnm && !ancoras.cnm.dvFecha) {
    add(
      'cnm_nao_fecha',
      'alto',
      `O Código Nacional de Matrícula encontrado ("${ancoras.cnm.codigo}") não fecha o dígito verificador.`,
    )
  }

  if (cabecalho?.numeroMatricula && ancoras.cnm?.dvFecha) {
    const numeroLido = cabecalho.numeroMatricula.replace(/\D/g, '')
    const numeroDoCnm = ancoras.cnm.numeroOrdem.replace(/^0+/, '')
    const numeroLidoSemZeros = numeroLido.replace(/^0+/, '')
    if (numeroLidoSemZeros && numeroDoCnm && numeroLidoSemZeros !== numeroDoCnm) {
      add(
        'numero_matricula_diverge_do_cnm',
        'alto',
        `O número da matrícula no cabeçalho ("${cabecalho.numeroMatricula}") não é o mesmo número de ordem do CNM ("${ancoras.cnm.numeroOrdem}") — indício de que o cabeçalho pode ter sido colado sobre o corpo de outra matrícula.`,
      )
    }
  }

  if (onr?.status === 'consultado' && onr.resposta) {
    const r = onr.resposta

    if (cabecalho?.cartorio && r.cartorio && !textosBatem(cabecalho.cartorio, r.cartorio)) {
      add(
        'cartorio_diverge_da_onr',
        'alto',
        `O cartório lido no cabeçalho ("${cabecalho.cartorio}") diverge do cartório confirmado pela ONR ("${r.cartorio}").`,
      )
    }

    const cnsFontes = [ancoras.selo?.cns, ancoras.cnm?.cns, r.cns].filter((c): c is string => Boolean(c))
    const cnsDivergentes = new Set(cnsFontes).size > 1
    if (cnsDivergentes) {
      add(
        'cns_diverge_entre_fontes',
        'alto',
        `O código da serventia não é o mesmo entre as fontes verificadas (${cnsFontes.join(', ')}).`,
      )
    }

    if (r.validade) {
      const validadeTs = Date.parse(r.validade)
      if (!Number.isNaN(validadeTs) && validadeTs < Date.now()) {
        add(
          'certidao_vencida',
          'medio',
          `A certidão consultada na ONR está vencida desde ${new Date(validadeTs).toLocaleDateString('pt-BR')} — a informação nela ainda é válida como retrato daquela data, mas não substitui uma certidão atualizada para os fins que exigem uma.`,
        )
      }
    }

    if (r.signingTime && pericia.info.modDate) {
      const assinadoTs = Date.parse(r.signingTime)
      const modTs = Date.parse(pericia.info.modDate)
      if (!Number.isNaN(assinadoTs) && !Number.isNaN(modTs) && modTs > assinadoTs + 5 * 60_000) {
        add(
          'reimpressao_pos_assinatura',
          'informativo',
          `O arquivo em mãos foi reimpresso ou reprocessado depois da assinatura original confirmada pela ONR (assinado em ${new Date(assinadoTs).toLocaleString('pt-BR')}, arquivo modificado em ${new Date(modTs).toLocaleString('pt-BR')}) — não é o PDF assinado original, é uma cópia dele.`,
        )
      }
    }
  }

  return indicios
}

function temCodigo(indicios: Indicio[], codigo: string): boolean {
  return indicios.some((i) => i.codigo === codigo)
}

const SCORE_POR_CLASSIFICACAO: Record<Classificacao, number> = {
  original_assinado: 100,
  copia_verificavel: 80,
  reimpresso: 50,
  copia_sem_ancora: 40,
  editado: 20,
  indicios_de_adulteracao: 10,
  arquivo_danificado: 0,
}

function ancoraValida(ancoras: Ancoras): boolean {
  return Boolean(ancoras.selo?.dvFecha) || Boolean(ancoras.cnm?.dvFecha)
}

function onrConfirmaSemErro(onr: ConsultaOnr | null): boolean {
  return onr?.status === 'consultado' && Boolean(onr.resposta) && onr.resposta!.temErrosDeValidacao === false
}

function classificar(entrada: EntradaVeredito, cruzados: Indicio[]): Classificacao {
  const { pericia, ancoras, onr } = entrada
  const todos = [...pericia.indicios, ...cruzados]

  if (pericia.truncado) return 'arquivo_danificado'

  const temAdulteracaoForte =
    temCodigo(todos, 'mod_antes_da_criacao') ||
    temCodigo(todos, 'xmp_diverge_do_info') ||
    temCodigo(todos, 'assinatura_nao_cobre_o_arquivo') ||
    temCodigo(cruzados, 'selo_nao_fecha') ||
    temCodigo(cruzados, 'cnm_nao_fecha') ||
    temCodigo(cruzados, 'cartorio_diverge_da_onr') ||
    temCodigo(cruzados, 'cns_diverge_entre_fontes') ||
    temCodigo(cruzados, 'numero_matricula_diverge_do_cnm')
  if (temAdulteracaoForte) return 'indicios_de_adulteracao'

  if (
    temCodigo(pericia.indicios, 'produtor_editor') ||
    temCodigo(pericia.indicios, 'updates_incrementais') ||
    temCodigo(pericia.indicios, 'paginas_heterogeneas')
  ) {
    return 'editado'
  }

  const assinaturaLocalIntegra =
    pericia.contagens.tipoSig > 0 &&
    pericia.contagens.byteRange > 0 &&
    !temCodigo(pericia.indicios, 'produtor_rerender')
  if (assinaturaLocalIntegra) return 'original_assinado'

  if (onrConfirmaSemErro(onr) || ancoraValida(ancoras)) return 'copia_verificavel'

  if (temCodigo(pericia.indicios, 'produtor_rerender')) return 'reimpresso'

  return 'copia_sem_ancora'
}

function linksDeConferencia(entrada: EntradaVeredito): { rotulo: string; url: string }[] {
  const links: { rotulo: string; url: string }[] = []
  const { ancoras, onrCodigo } = entrada

  if (ancoras.selo) {
    links.push({
      rotulo: 'Conferir o Selo Digital no site do TJSP',
      url: `https://selodigital.tjsp.jus.br/?r=${encodeURIComponent(ancoras.selo.codigo)}`,
    })
  }
  if (onrCodigo) {
    links.push({
      rotulo: 'Conferir a assinatura na ONR',
      url: `https://assinador-web.onr.org.br/docs/${encodeURIComponent(onrCodigo)}`,
    })
  }
  return links
}

/**
 * Combina perícia + âncoras + ONR num veredito único. Não bloqueia nada — o
 * chamador grava isto ao lado do resultado da análise, nunca no lugar dele.
 */
export function calcularAutenticidade(entrada: EntradaVeredito): Autenticidade {
  const cruzados = indiciosCruzados(entrada)
  const classificacao = classificar(entrada, cruzados)
  const indicios = [...entrada.pericia.indicios, ...cruzados]

  return {
    classificacao,
    score: SCORE_POR_CLASSIFICACAO[classificacao],
    indicios,
    ancoras: entrada.ancoras,
    onr: entrada.onr,
    linksDeConferencia: linksDeConferencia(entrada),
  }
}
