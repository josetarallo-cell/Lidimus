// Âncoras registrais — §2 do plano. Selo Digital TJSP e CNM não são decoração:
// os dois carregam dígito verificador e por isso são autoverificáveis offline,
// sem rede. Um selo inventado à mão tem ~1/36 de chance de fechar o DV; um CNM
// cujo número de ordem não bate com a matrícula do cabeçalho denuncia
// cabeçalho de um documento colado no corpo de outro.
//
// As regexes rodam sobre `texto_ocr` porque as amostras do plano são scans
// (pdftotext devolve 0 caracteres em 5 das 6) — nunca sobre a camada de texto
// do PDF.

import { calcularDvIso7064, iso7064Fecha } from './iso7064.ts'
import { calcularDvLuhnModN, luhnModNFecha } from './luhn.ts'
import type { Cnm, SeloTjsp } from './tipos.ts'

// ─── Corretor de leitura por dígito verificador ─────────────────────────────
//
// O dígito verificador vira, de graça, o corretor do próprio código: um selo
// de 25 posições lido por OCR erra, então em vez de descartar de cara, geramos
// variantes sobre as confusões canônicas de OCR (no máximo 2 substituições) e
// aceitamos a primeira que fecha o DV — mesma ideia do corretor que já existe
// no pipeline (@lidimus/revisao).

const CONFUSOES_OCR: Record<string, string> = {
  O: '0',
  '0': 'O',
  I: '1',
  '1': 'I',
  S: '5',
  '5': 'S',
  B: '8',
  '8': 'B',
  Z: '2',
  '2': 'Z',
  G: '6',
  '6': 'G',
}

function substituir(codigo: string, posicoes: { indice: number; caractere: string }[]): string {
  const chars = [...codigo]
  for (const { indice, caractere } of posicoes) chars[indice] = caractere
  return chars.join('')
}

/** Variantes do código com 1 ou 2 substituições nas confusões canônicas de OCR. */
function variantesComCorrecao(codigo: string): string[] {
  const posicoesComAlternativa = [...codigo]
    .map((c, indice) => ({ indice, alt: CONFUSOES_OCR[c.toUpperCase()] }))
    .filter((p): p is { indice: number; alt: string } => Boolean(p.alt))

  const variantes: string[] = []
  for (const p of posicoesComAlternativa) {
    variantes.push(substituir(codigo, [{ indice: p.indice, caractere: p.alt }]))
  }
  for (let a = 0; a < posicoesComAlternativa.length; a++) {
    for (let b = a + 1; b < posicoesComAlternativa.length; b++) {
      variantes.push(
        substituir(codigo, [
          { indice: posicoesComAlternativa[a].indice, caractere: posicoesComAlternativa[a].alt },
          { indice: posicoesComAlternativa[b].indice, caractere: posicoesComAlternativa[b].alt },
        ]),
      )
    }
  }
  return variantes
}

/**
 * Tenta fazer `codigo` fechar em `fecha`, direto ou após corrigir até 2
 * confusões de OCR. `null` quando nada fecha — o código não é válido, mesmo
 * corrigido (candidato a `indicios_de_adulteracao` em veredito.ts).
 */
export function tentarComCorrecaoDv(
  codigo: string,
  fecha: (c: string) => boolean,
): { codigo: string; corrigido: boolean } | null {
  if (fecha(codigo)) return { codigo, corrigido: false }
  for (const variante of variantesComCorrecao(codigo)) {
    if (fecha(variante)) return { codigo: variante, corrigido: true }
  }
  return null
}

// ─── Selo Digital TJSP ────────────────────────────────────────────────────
//
// 25 posições em 6 campos (Especificação de Requisitos do Selo Digital, §4.4):
// CNS(6) + Natureza(1) + Ato(2) + Info do ato(13) + Ano(2) + DV(1).

const JANELA_ROTULO = 80
const ROTULO_SELO = /selo\s*digital|tjsp/gi

function candidatosProximosAoRotulo(texto: string, tamanho: number, rotulo: RegExp): string[] {
  const posicoesRotulo: number[] = []
  for (const m of texto.matchAll(rotulo)) posicoesRotulo.push(m.index ?? 0)
  if (posicoesRotulo.length === 0) return []

  const achados: string[] = []
  const padrao = new RegExp(`[0-9A-Za-z]{${tamanho}}`, 'g')
  for (const m of texto.matchAll(padrao)) {
    const idx = m.index ?? 0
    if (posicoesRotulo.some((p) => Math.abs(p - idx) <= JANELA_ROTULO)) achados.push(m[0])
  }
  return achados
}

function decomporSelo(codigo: string, corrigido: boolean, dvFecha: boolean): SeloTjsp {
  return {
    codigo,
    cns: codigo.slice(0, 6),
    natureza: codigo.slice(6, 7),
    ato: codigo.slice(7, 9),
    infoAto: codigo.slice(9, 22),
    ano: codigo.slice(22, 24),
    dv: codigo.slice(24, 25),
    dvFecha,
    corrigidoPorDv: corrigido,
    origem: 'texto_ocr',
  }
}

/**
 * Procura o Selo Digital TJSP no texto do OCR. Prioriza candidatos perto de um
 * rótulo ("Selo Digital", "TJSP") — só um candidato SEM rótulo próximo é
 * aceito se o DV fechar sozinho, para não confundir 25 caracteres aleatórios
 * do documento com um selo. Um candidato rotulado que não fecha (nem com
 * correção) ainda é devolvido, com `dvFecha: false` — é exatamente o indício
 * de adulteração que o veredito precisa enxergar, não um "selo não encontrado".
 */
export function extrairSelo(texto: string): SeloTjsp | null {
  const rotulados = candidatosProximosAoRotulo(texto, 25, ROTULO_SELO)

  for (const bruto of rotulados) {
    const codigo = bruto.toUpperCase()
    const resultado = tentarComCorrecaoDv(codigo, luhnModNFecha)
    if (resultado) return decomporSelo(resultado.codigo, resultado.corrigido, true)
  }
  if (rotulados.length > 0) {
    // Nenhum candidato rotulado fechou, nem corrigido: devolve o primeiro como
    // achado inválido, não como ausência de selo.
    return decomporSelo(rotulados[0].toUpperCase(), false, false)
  }

  // Sem rótulo por perto: só aceita se um trecho de 25 caracteres fechar o DV
  // sozinho, corrigido ou não.
  for (const m of texto.matchAll(/\b[0-9A-Za-z]{25}\b/g)) {
    const codigo = m[0].toUpperCase()
    const resultado = tentarComCorrecaoDv(codigo, luhnModNFecha)
    if (resultado) return decomporSelo(resultado.codigo, resultado.corrigido, true)
  }

  return null
}

/** Constrói o selo a partir do conteúdo já decodificado do QR — ver qr.ts. */
export function seloDoQr(selo25: string): SeloTjsp | null {
  const codigo = selo25.toUpperCase()
  const resultado = tentarComCorrecaoDv(codigo, luhnModNFecha)
  if (resultado) {
    return { ...decomporSelo(resultado.codigo, resultado.corrigido, true), origem: 'qr' }
  }
  // O QR não erra leitura como o OCR — se veio do QR e não fecha, o selo em si
  // é que está incoerente (ou o QR não era um selo TJSP de verdade).
  return { ...decomporSelo(codigo, false, false), origem: 'qr' }
}

// ─── CNM — Código Nacional de Matrícula ─────────────────────────────────────
//
// `CCCCC.L.NNNNNNN-DD`: CNS(5) + Livro(1) + nº de ordem(7) + DV(2), Provimento
// CNJ 89/2019. A forma pontuada é específica o bastante para não confundir com
// texto solto; o fallback sem pontuação só aceita se o DV fechar.

const CNM_PONTUADO = /\b(\d{5})\.(\d)\.(\d{7})-(\d{2})\b/g
const CNM_SEM_PONTUACAO = /\b\d{15}\b/g

function decomporCnm(cns: string, livro: string, numeroOrdem: string, dv: string, corrigido: boolean, dvFecha: boolean): Cnm {
  return {
    codigo: `${cns}.${livro}.${numeroOrdem}-${dv}`,
    cns,
    livro,
    numeroOrdem,
    dv,
    dvFecha,
    livroEhRegistroGeral: livro === '2',
    corrigidoPorDv: corrigido,
    origem: 'texto_ocr',
  }
}

export function extrairCnm(texto: string): Cnm | null {
  for (const m of texto.matchAll(CNM_PONTUADO)) {
    const [, cns, livro, numeroOrdem, dv] = m
    const base = cns + livro + numeroOrdem
    const completo = base + dv
    if (iso7064Fecha(completo)) {
      return decomporCnm(cns, livro, numeroOrdem, dv, false, true)
    }
    // Pontuação certa, DV errado — não tenta corrigir dígito por confusão de
    // letra (CNM é só numérico, a única confusão possível é O↔0 e afins, já
    // coberta pelo próprio OCR de dígitos). Devolve como achado inválido.
    return decomporCnm(cns, livro, numeroOrdem, dv, false, false)
  }

  for (const m of texto.matchAll(CNM_SEM_PONTUACAO)) {
    const bloco = m[0]
    const base = bloco.slice(0, 13)
    const dv = bloco.slice(13, 15)
    if (iso7064Fecha(base + dv)) {
      return decomporCnm(base.slice(0, 5), base.slice(5, 6), base.slice(6, 13), dv, false, true)
    }
  }

  return null
}

export { calcularDvLuhnModN, calcularDvIso7064 }
