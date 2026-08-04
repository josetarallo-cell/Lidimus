import type { H3Event } from 'h3'
import { DOCX_MIME } from '@lidimus/docx'

// O nome do arquivo vai duas vezes no cabeçalho: `filename` em ASCII, para o
// cliente antigo que não entende RFC 5987, e `filename*` em UTF-8, para todos
// os outros. Sem o primeiro, "matrícula" com acento chega truncada ou vira
// lixo; sem o segundo, chega sem acento.
function asciiSeguro(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // Aspas e ponto-e-vírgula quebrariam o cabeçalho
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'documento.docx'
  )
}

/** Devolve um .docx como download, com o nome preservado em UTF-8. */
export function enviarDocx(event: H3Event, buffer: Buffer, nomeArquivo: string) {
  setHeader(event, 'Content-Type', DOCX_MIME)
  setHeader(
    event,
    'Content-Disposition',
    `attachment; filename="${asciiSeguro(nomeArquivo)}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
  )
  setHeader(event, 'Content-Length', String(buffer.length))
  // Parecer é documento do cliente: não fica em cache de proxy no caminho
  setHeader(event, 'Cache-Control', 'private, no-store')
  return buffer
}

// Fuso fixo em America/Sao_Paulo: sem ele o horário sairia no fuso do servidor,
// e o mesmo parecer teria uma data na tela e outra no arquivo exportado. Um
// laudo registral se data pelo fuso do registro. Espelha o `emitidoEm` da
// página do parecer.
export function dataDeEmissao(ts: unknown): string | null {
  if (!ts) return null
  const d = new Date(ts as string)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  })
}
