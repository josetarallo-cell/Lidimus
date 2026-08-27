import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { Autenticidade } from '@lidimus/autenticidade'
import { pareceMatriculaDocx } from './index.ts'
import { documentoCompleto } from './fixtures.ts'

async function textoDoDocx(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml')!.async('string')
  return (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? [])
    .map((t) => t.replace(/<[^>]+>/g, ''))
    .join(' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

const AUTENTICIDADE_EDITADO: Autenticidade = {
  classificacao: 'editado',
  score: 20,
  indicios: [
    {
      codigo: 'criacao_ausente',
      peso: 'alto',
      evidencia: 'O arquivo tem data de modificação mas não tem data de criação — indício de edição.',
    },
  ],
  ancoras: { selo: null, cnm: null },
  onr: null,
  linksDeConferencia: [{ rotulo: 'Conferir o Selo Digital no site do TJSP', url: 'https://selodigital.tjsp.jus.br/?r=ABC' }],
}

describe('secaoAutenticidade no parecer .docx', () => {
  it('não aparece quando meta.autenticidade não foi informado (compatibilidade)', async () => {
    const texto = await textoDoDocx(await pareceMatriculaDocx(documentoCompleto, { emitidoEm: '21/03/2024 15:04' }))
    expect(texto).not.toContain('Autenticidade do documento')
  })

  it('mostra a classificação, o indício e o link de conferência', async () => {
    const texto = await textoDoDocx(
      await pareceMatriculaDocx(documentoCompleto, {
        emitidoEm: '21/03/2024 15:04',
        autenticidade: AUTENTICIDADE_EDITADO,
      }),
    )
    expect(texto).toContain('Autenticidade do documento — Indício de edição')
    expect(texto).toContain('data de modificação mas não tem data de criação')
    expect(texto).toContain('Conferir o Selo Digital no site do TJSP')
    expect(texto).toContain('A ausência de indícios não é garantia')
  })

  it('aparece antes da seção Imóvel, na mesma ordem da tela', async () => {
    const texto = await textoDoDocx(
      await pareceMatriculaDocx(documentoCompleto, { autenticidade: AUTENTICIDADE_EDITADO }),
    )
    expect(texto.indexOf('Autenticidade do documento')).toBeLessThan(texto.indexOf('Imóvel'))
  })
})
