import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { detectarPaginasHeterogeneas } from './arquivo.ts'

const exec = promisify(execFile)

async function temPdfinfo(): Promise<boolean> {
  try {
    await exec('pdfinfo', ['-v'])
    return true
  } catch {
    return false
  }
}

// `pdfinfo` (poppler) só existe no Dockerfile do worker — este ambiente de
// desenvolvimento não o tem. O teste se anuncia como pulado em vez de falhar,
// e a cobertura real acontece na verificação manual do sandbox (plano,
// "Verificação", item 3), que roda dentro do container com poppler instalado.
describe.skipIf(!(await temPdfinfo()))('detectarPaginasHeterogeneas (requer poppler)', () => {
  it('devolve null para documento de 1 página só (nada para comparar)', async () => {
    expect(await detectarPaginasHeterogeneas('/caminho/inexistente.pdf', 1)).toBeNull()
  })
})

describe('detectarPaginasHeterogeneas — sem poppler disponível', () => {
  it('nunca lança quando o binário pdfinfo não existe ou o arquivo não existe', async () => {
    const r = await detectarPaginasHeterogeneas('/caminho/definitivamente/inexistente.pdf', 5)
    expect(r).toBeNull()
  })

  it('devolve null para 1 página, sem tentar medir nada', async () => {
    const r = await detectarPaginasHeterogeneas('/qualquer.pdf', 1)
    expect(r).toBeNull()
  })

  it('devolve null para 0 páginas', async () => {
    const r = await detectarPaginasHeterogeneas('/qualquer.pdf', 0)
    expect(r).toBeNull()
  })
})
