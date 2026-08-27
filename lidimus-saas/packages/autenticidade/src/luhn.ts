// Luhn mod N — o dígito verificador de uma posição alfanumérica só, generalização
// do Luhn de cartão de crédito (que é Luhn mod 10) para qualquer alfabeto.
//
// É o dígito verificador do Selo Digital TJSP (N=36, alfabeto 0-9A-Z — ver
// ancoras.ts e a nota de rodapé da Especificação de Requisitos, §4.5).
//
// Vetor de teste conferido contra o exemplo §4.9 da spec: o selo
// "9999991CE0000000000030184" tem DV impresso "4", e calcularDV do payload sem
// o último caractere devolve "4". (O exemplo do §9.2 é placeholder e não fecha —
// não usar como fixture.)

const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const N = ALFABETO.length

function valorDoCaractere(c: string): number {
  const v = ALFABETO.indexOf(c.toUpperCase())
  if (v < 0) throw new Error(`Caractere fora do alfabeto Luhn mod ${N}: "${c}"`)
  return v
}

/**
 * Dígito verificador do `payload` (sem o próprio DV), pelo Luhn mod N
 * generalizado: da direita para a esquerda, dobra cada segundo caractere e
 * reduz o resultado à base N somando os dois "dígitos" (equivalente a subtrair
 * N-1 quando o dobro estoura o alfabeto).
 */
export function calcularDvLuhnModN(payload: string): string {
  let fator = 2
  let soma = 0
  for (let i = payload.length - 1; i >= 0; i--) {
    let parcela = valorDoCaractere(payload[i]) * fator
    parcela = Math.floor(parcela / N) + (parcela % N)
    soma += parcela
    fator = fator === 2 ? 1 : 2
  }
  const resto = soma % N
  return ALFABETO[(N - resto) % N]
}

/** `codigo` completo (payload + DV) fecha o Luhn mod 36? */
export function luhnModNFecha(codigo: string): boolean {
  if (codigo.length < 2) return false
  const payload = codigo.slice(0, -1)
  const dv = codigo.slice(-1).toUpperCase()
  try {
    return calcularDvLuhnModN(payload) === dv
  } catch {
    return false
  }
}
