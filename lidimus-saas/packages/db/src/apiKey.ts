import { createHash, randomBytes } from 'node:crypto'
import { and, gt, isNull } from 'drizzle-orm'
import { apiKeys } from './schema.ts'

// Chave da API pública. Vive aqui, e não em apps/web/server/lib, porque o script
// `pnpm chave:api` também emite chave — e um pacote não pode importar do app.
// Uma implementação só, usada pelos dois caminhos.

// O prefixo fixo não é enfeite: é o que permite a um scanner de segredos
// (push protection do GitHub, gitleaks) reconhecer a credencial no diff e barrar
// o commit antes de o cliente vazar a própria chave no repositório dele.
// `live` abre espaço para um `ldm_test_` no dia em que houver ambiente de teste.
export const PREFIXO_CHAVE = 'ldm_live_'

// Um ano. Prazo curto obrigaria o cliente a mexer na integração com frequência
// que ninguém sustenta; prazo nenhum é chave que nunca é rotacionada.
export const VALIDADE_CHAVE_DIAS = 365

// Teto por organização. Serve para o cliente separar integrações (ERP, portal,
// script do escritório) sem que a lista vire um cemitério de chaves esquecidas
// que ninguém sabe se ainda estão em uso.
export const MAX_CHAVES_ATIVAS = 5

// Quantos caracteres do segredo entram no prefixo visível. 8 é o suficiente para
// distinguir as chaves de uma organização na tela sem revelar parte útil do
// token: sobram 35 caracteres aleatórios, ou ~208 bits.
const CHARS_NO_PREFIXO = 8

export type ChaveGerada = { token: string; prefix: string; keyHash: string }

// 32 bytes de CSPRNG em base64url: 256 bits de entropia em 43 caracteres.
export function gerarChave(): ChaveGerada {
  const segredo = randomBytes(32).toString('base64url')
  const token = `${PREFIXO_CHAVE}${segredo}`
  return {
    token,
    prefix: `${PREFIXO_CHAVE}${segredo.slice(0, CHARS_NO_PREFIXO)}`,
    keyHash: hashDaChave(token),
  }
}

// SHA-256 sem sal e sem KDF, pelo mesmo motivo do token de convite: são 256 bits
// aleatórios, não uma senha de gente — não há dicionário nem espaço de busca a
// atacar, e o lookup precisa ser um índice único (uma consulta por requisição da
// API, sem varrer a tabela). bcrypt aqui só tornaria a API lenta de graça.
export function hashDaChave(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function validadeDaChave(): Date {
  return new Date(Date.now() + VALIDADE_CHAVE_DIAS * 24 * 60 * 60 * 1000)
}

// Formato reconhecível antes de ir ao banco: o que não tem cara de chave nossa é
// recusado sem consultar o Postgres. Não é validação de segurança — é economia
// de consulta contra varredura.
export function pareceChave(token: string): boolean {
  return token.startsWith(PREFIXO_CHAVE) && token.length > PREFIXO_CHAVE.length + 16
}

// "Ativa" é o que a API aceitaria agora: não revogada e ainda no prazo. Uma
// definição só, usada pela autenticação, pela tela de gestão, pelo teto de
// emissão e pelo script — para não existir chave que a tela conta e a API recusa.
export function filtroChaveAtiva(agora = new Date()) {
  return and(isNull(apiKeys.revokedAt), gt(apiKeys.expiresAt, agora))
}
