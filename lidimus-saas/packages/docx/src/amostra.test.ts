// Não é asserção: é a saída de amostra para inspeção visual no Word. Roda junto
// com os testes porque é aqui que os fixtures vivem, e um arquivo que ninguém
// abre não prova que o layout está bom.
import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { loteMatriculasDocx, pareceMatriculaDocx } from './index.ts'
import { documentoCompleto, documentoIncompleto } from './fixtures.ts'

const destino = process.env.DOCX_AMOSTRA_DIR

describe.skipIf(!destino)('amostras para inspeção', () => {
  it('grava os três arquivos', async () => {
    mkdirSync(destino!, { recursive: true })
    writeFileSync(
      `${destino}/amostra-relatorio-completo.docx`,
      await pareceMatriculaDocx(documentoCompleto, {
        emitidoEm: '21/03/2024 15:04',
        arquivoOriginal: 'matricula-12345.pdf',
      }),
    )
    writeFileSync(
      `${destino}/amostra-relatorio-incompleto.docx`,
      await pareceMatriculaDocx(documentoIncompleto, {
        emitidoEm: '02/08/2026 09:00',
        arquivoOriginal: 'matricula-98765.pdf',
      }),
    )
    writeFileSync(
      `${destino}/amostra-lote.docx`,
      await loteMatriculasDocx(
        [
          { id: 'a', status: 'done', arquivoOriginal: 'mat-12345.pdf', emitidoEm: '21/03/2024 15:04', documento: documentoCompleto },
          { id: 'b', status: 'done', arquivoOriginal: 'mat-98765.pdf', emitidoEm: '02/08/2026 09:00', documento: documentoIncompleto },
          { id: 'c', status: 'error', arquivoOriginal: 'ilegivel.pdf', documento: null },
        ],
        { loteId: 'lote-1', enviadoEm: '03/08/2026 08:00' },
      ),
    )
  })
})
