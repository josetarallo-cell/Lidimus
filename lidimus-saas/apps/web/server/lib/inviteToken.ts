import { createHash, randomBytes } from 'node:crypto'

// O token vai no link do e-mail; no banco fica só o SHA-256. Sem sal e sem
// custo de KDF de propósito: são 256 bits aleatórios, não uma senha — não há
// espaço de busca para atacar, e o lookup precisa ser um índice único.
export function gerarTokenDeConvite(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: hashDoToken(token) }
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Prazo do convite. Uma semana é folga suficiente para quem só abre o e-mail
// do trabalho na segunda-feira, e curta o bastante para um link vazado não
// ficar valendo indefinidamente.
export const VALIDADE_CONVITE_DIAS = 7

export function validadeDoConvite(): Date {
  return new Date(Date.now() + VALIDADE_CONVITE_DIAS * 24 * 60 * 60 * 1000)
}
