// Recorte da palavra na página do PDF.
//
// É o que transforma "o OCR pode ter lido errado aqui" em algo que um humano
// consegue julgar em dois segundos: a imagem do trecho, do jeito que está no
// documento, ao lado do campo onde ele digita o certo.
//
// O desenho vem do WhatTheFont: mostrar o recorte e pedir o caractere, em vez de
// pedir que a pessoa procure o trecho no documento inteiro.
//
// A ferramenta é o pdftoppm (poppler-utils, um `apk add` no Dockerfile), e não
// uma biblioteca de renderização em Node. Ele recorta direto na chamada — os
// flags -x -y -W -H são a região em pixels — então não é preciso rasterizar a
// página inteira em memória para depois cortar, nem trazer módulo nativo de
// imagem para o worker.

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Candidato } from '@lidimus/revisao'

const exec = promisify(execFile)

/**
 * Resolução do recorte. 200 dpi é o ponto em que texto datilografado de cartório
 * fica confortável de ler na tela sem que o PNG de uma palavra passe de poucos
 * kilobytes — e o resultado é guardado no banco e trafega no SSE.
 */
const DPI = 200

/** Piso de legibilidade: recorte menor que isso vira selo ilegível na tela. */
const MIN_LARGURA = 120
const MIN_ALTURA = 32

/** Nenhuma chamada de recorte pode segurar o worker. */
const TIMEOUT_MS = 20_000

type Dimensao = { largura: number; altura: number }

/** Tamanho da página em pixels na resolução de recorte, medido pelo pdfinfo. */
async function dimensaoDaPagina(caminhoPdf: string, pagina: number): Promise<Dimensao | null> {
  try {
    const { stdout } = await exec(
      'pdfinfo',
      ['-f', String(pagina), '-l', String(pagina), caminhoPdf],
      { timeout: TIMEOUT_MS },
    )
    const m = stdout.match(/Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/)
    if (!m) return null
    return {
      largura: Math.round((Number(m[1]) * DPI) / 72),
      altura: Math.round((Number(m[2]) * DPI) / 72),
    }
  } catch {
    return null
  }
}

/**
 * Converte a caixa normalizada do Document AI em região de pixels, garantindo o
 * piso de legibilidade e sem sair da página.
 */
function regiao(caixa: readonly number[], pagina: Dimensao) {
  const x0 = caixa[0] * pagina.largura
  const y0 = caixa[1] * pagina.altura
  const x1 = caixa[2] * pagina.largura
  const y1 = caixa[3] * pagina.altura

  const larguraAlvo = Math.max(x1 - x0, MIN_LARGURA)
  const alturaAlvo = Math.max(y1 - y0, MIN_ALTURA)

  // Cresce em torno do centro: uma palavra curta ganha margem dos dois lados,
  // e não um rabo de página branca à direita.
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2

  const largura = Math.min(Math.round(larguraAlvo), pagina.largura)
  const altura = Math.min(Math.round(alturaAlvo), pagina.altura)
  const x = Math.max(0, Math.min(Math.round(cx - largura / 2), pagina.largura - largura))
  const y = Math.max(0, Math.min(Math.round(cy - altura / 2), pagina.altura - altura))

  return { x, y, largura, altura }
}

/**
 * Recorta de `pdf` a imagem de cada candidato e devolve a lista com `recorte`
 * preenchido como data URL.
 *
 * Falha de recorte não derruba o candidato: o item continua na tela com o texto
 * lido e o contexto, só sem a imagem. É pior que o ideal e muito melhor que
 * perder a conferência de um CPF que não fecha por causa de um PNG.
 */
export async function recortarCandidatos(pdf: Buffer, candidatos: Candidato[]): Promise<Candidato[]> {
  if (candidatos.length === 0) return candidatos

  const pasta = await mkdtemp(join(tmpdir(), 'lidimus-recorte-'))
  const caminhoPdf = join(pasta, 'documento.pdf')

  try {
    await writeFile(caminhoPdf, pdf)

    // Uma medição por página, não uma por candidato: oito trechos costumam cair
    // em duas ou três páginas.
    const dimensoes = new Map<number, Dimensao | null>()
    const saida: Candidato[] = []

    for (const [i, candidato] of candidatos.entries()) {
      if (!dimensoes.has(candidato.pagina)) {
        dimensoes.set(candidato.pagina, await dimensaoDaPagina(caminhoPdf, candidato.pagina))
      }
      const pagina = dimensoes.get(candidato.pagina)
      if (!pagina) {
        saida.push(candidato)
        continue
      }

      const { x, y, largura, altura } = regiao(candidato.caixa, pagina)
      const prefixo = join(pasta, `trecho-${i}`)

      try {
        await exec(
          'pdftoppm',
          [
            '-png',
            '-r', String(DPI),
            '-f', String(candidato.pagina),
            '-l', String(candidato.pagina),
            '-x', String(x),
            '-y', String(y),
            '-W', String(largura),
            '-H', String(altura),
            '-singlefile',
            caminhoPdf,
            prefixo,
          ],
          { timeout: TIMEOUT_MS },
        )
        const png = await readFile(`${prefixo}.png`)
        saida.push({ ...candidato, recorte: `data:image/png;base64,${png.toString('base64')}` })
      } catch (err) {
        console.warn(`[revisao] recorte falhou no trecho ${candidato.id}:`, err)
        saida.push(candidato)
      }
    }

    return saida
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {})
  }
}
