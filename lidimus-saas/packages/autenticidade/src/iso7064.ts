// ISO 7064 MOD 97-10 — os dois dígitos verificadores numéricos do fim do CNM
// (Código Nacional de Matrícula, Provimento CNJ 89/2019). É o mesmo algoritmo
// dos dígitos verificadores do IBAN, restrito a dígitos decimais (sem a
// conversão letra→número que o IBAN precisa, porque o CNM é só numérico).
//
// Regra (ISO 7064, seção MOD 97-10):
//   • dígitos verificadores DD tais que, lendo a base seguida de DD como um
//     inteiro grande, o resto da divisão por 97 dá exatamente 1;
//   • para calcular DD a partir da base: resto = (base * 100) mod 97;
//     DD = 98 - resto (dois dígitos, zero à esquerda se precisar).

function modBigInt(numeroDecimal: string, modulo: bigint): bigint {
  let resto = 0n
  for (const c of numeroDecimal) {
    resto = (resto * 10n + BigInt(c)) % modulo
  }
  return resto
}

/** Dígitos verificadores (2 dígitos) da `base` numérica, sem os DV. */
export function calcularDvIso7064(base: string): string {
  if (!/^\d+$/.test(base)) throw new Error('Base do ISO 7064 MOD 97-10 precisa ser só dígitos')
  const resto = modBigInt(base + '00', 97n)
  const dv = 98n - resto
  return dv.toString().padStart(2, '0')
}

/** `numeroCompleto` (base + 2 dígitos verificadores) fecha o MOD 97-10? */
export function iso7064Fecha(numeroCompleto: string): boolean {
  if (!/^\d{3,}$/.test(numeroCompleto)) return false
  return modBigInt(numeroCompleto, 97n) === 1n
}
