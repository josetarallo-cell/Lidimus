// Passa TODOS os pareceres reais do banco pelo construtor.
//
// Os fixtures provam que as regras estão implementadas; este teste prova que
// elas sobrevivem ao que o pipeline realmente produziu — campo faltando, valor
// em formato inesperado, HTML que o LLM escreveu de um jeito que ninguém
// previu. Roda só quando o dump existe (DOCX_REAIS), então não trava CI.
//
// Para gerar o dump:
//   docker compose exec -T postgres psql -U lidimus -d lidimus -t -A \
//     -c "select json_agg(json_build_object('id', id, 'documento', result->'documento'))
//         from jobs where type='matricula' and status='done' and result ? 'documento';" \
//     > reais.json

import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pareceMatriculaDocx } from './index.ts'
import { matriculaIncompleta } from './parecer.ts'
import { LABEL_POR_NIVEL } from './risco.ts'

const caminho = process.env.DOCX_REAIS
const disponivel = !!caminho && existsSync(caminho)

const casos: { id: string; documento: any }[] = disponivel
  ? JSON.parse(readFileSync(caminho!, 'utf8')).filter((c: any) => c?.documento)
  : []

async function textoDoDocx(buf: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml')!.async('string')
  return (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? [])
    .map((t) => t.replace(/<[^>]+>/g, ''))
    .join(' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

describe.skipIf(!disponivel)('pareceres reais do banco', () => {
  it('encontrou casos para examinar', () => {
    expect(casos.length).toBeGreaterThan(0)
  })

  it('gera .docx válido para todos, sem exceção', async () => {
    const falhas: string[] = []
    for (const caso of casos) {
      try {
        const buf = await pareceMatriculaDocx(caso.documento, { emitidoEm: '01/01/2026 00:00' })
        expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
        expect(buf.length).toBeGreaterThan(1000)
      } catch (err) {
        falhas.push(`${caso.id}: ${(err as Error).message}`)
      }
    }
    expect(falhas, `falharam:\n${falhas.join('\n')}`).toEqual([])
  }, 120_000)

  it('nunca vaza enum de risco cru nem marcação HTML', async () => {
    const problemas: string[] = []
    for (const caso of casos) {
      const texto = await textoDoDocx(await pareceMatriculaDocx(caso.documento))
      for (const vazamento of ['<p>', '</p>', '<strong>', '<li>', '<br', '&nbsp;', '&lt;']) {
        if (texto.includes(vazamento)) problemas.push(`${caso.id}: vazou ${vazamento}`)
      }
      // Sem acento, "medio"/"critico" só podem ser o enum do pipeline — em
      // português seriam "médio"/"crítico". `indeterminado` fica de fora de
      // propósito: escreve-se igual nos dois, e os analistas o usam como
      // adjetivo legítimo ("o status da condição é indeterminado nas páginas
      // recebidas"). Que o veredito saia legível é o teste da regra 7 que
      // garante, não este.
      if (/\b(medio|critico|nao_aplicavel|nao aplicavel|altissimo)\b/.test(texto)) {
        problemas.push(`${caso.id}: enum de risco cru no texto`)
      }
    }
    expect(problemas, problemas.join('\n')).toEqual([])
  }, 120_000)

  it('sempre carimba o rodapé de isenção (regra 8)', async () => {
    const semRodape: string[] = []
    for (const caso of casos) {
      const texto = await textoDoDocx(await pareceMatriculaDocx(caso.documento))
      if (!texto.includes('não substitui a certidão oficial do cartório')) semRodape.push(caso.id)
    }
    expect(semRodape, `sem rodapé: ${semRodape.join(', ')}`).toEqual([])
  }, 120_000)

  it('nenhuma matrícula incompleta recebe classificação de risco (regra 1)', async () => {
    const incompletas = casos.filter((c) => matriculaIncompleta(c.documento))
    expect(incompletas.length, 'nenhum caso incompleto no dump — regra não exercitada').toBeGreaterThan(0)

    const vazamentos: string[] = []
    for (const caso of incompletas) {
      const texto = await textoDoDocx(await pareceMatriculaDocx(caso.documento))
      for (const rotulo of Object.values(LABEL_POR_NIVEL)) {
        if (texto.includes(rotulo)) vazamentos.push(`${caso.id}: estampou "${rotulo}"`)
      }
      if (!texto.includes('parecer jurídico não emitido')) {
        vazamentos.push(`${caso.id}: sem o aviso de incompleta`)
      }
      if (texto.includes('Nenhum ônus ativo identificado')) {
        vazamentos.push(`${caso.id}: declarou imóvel livre sem ter lido o documento inteiro`)
      }
    }
    expect(vazamentos, vazamentos.join('\n')).toEqual([])
  }, 120_000)

  it('todo parecer completo estampa um veredito legível (regra 7)', async () => {
    const completos = casos.filter((c) => !matriculaIncompleta(c.documento))
    const semVeredito: string[] = []
    for (const caso of completos) {
      const texto = await textoDoDocx(await pareceMatriculaDocx(caso.documento))
      if (!Object.values(LABEL_POR_NIVEL).some((r) => texto.includes(r))) semVeredito.push(caso.id)
    }
    expect(semVeredito, `sem veredito: ${semVeredito.join(', ')}`).toEqual([])
  }, 120_000)
})
