// Conversão UTM → geográficas (WGS84). Série inversa de Snyder, exata ao
// centímetro dentro do fuso — não vale a pena uma dependência para isto.
//
// SIRGAS2000 e WGS84 são praticamente coincidentes (diferença abaixo do metro),
// então um só elipsoide atende. SAD-69 tem deslocamento de dezenas de metros;
// quando o documento declara SAD-69 o chamador avisa, mas a conta é a mesma.

const A = 6378137.0 // semieixo maior WGS84
const F = 1 / 298.257223563
const K0 = 0.9996
const E_FALSO = 500000
const N_FALSO_SUL = 10000000

const E2 = F * (2 - F)
const EP2 = E2 / (1 - E2)

const grau = (rad: number) => (rad * 180) / Math.PI

export interface LatLon {
  lat: number
  lon: number
}

/** Meridiano central do fuso, em graus (fuso 23 → -45). */
export function meridianoCentral(fuso: number): number {
  return fuso * 6 - 183
}

/** Fuso a partir do meridiano central declarado no documento (-45 → 23). */
export function fusoDoMeridiano(mc: number): number | null {
  const fuso = (mc + 183) / 6
  return Number.isInteger(fuso) && fuso >= 1 && fuso <= 60 ? fuso : null
}

export function utmParaLatLon(
  e: number,
  n: number,
  fuso: number,
  hemisferio: 'N' | 'S',
): LatLon | null {
  if (!Number.isFinite(e) || !Number.isFinite(n)) return null
  if (!Number.isInteger(fuso) || fuso < 1 || fuso > 60) return null

  const x = e - E_FALSO
  const y = hemisferio === 'S' ? n - N_FALSO_SUL : n

  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const m = y / K0
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256))

  // latitude do pé da perpendicular
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)

  const sin1 = Math.sin(phi1)
  const cos1 = Math.cos(phi1)
  const tan1 = Math.tan(phi1)

  const c1 = EP2 * cos1 * cos1
  const t1 = tan1 * tan1
  const n1 = A / Math.sqrt(1 - E2 * sin1 * sin1)
  const r1 = (A * (1 - E2)) / (1 - E2 * sin1 * sin1) ** 1.5
  const d = x / (n1 * K0)

  const lat =
    phi1 -
    ((n1 * tan1) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6) / 720)

  const lon =
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) / 120) /
    cos1

  const latG = grau(lat)
  const lonG = meridianoCentral(fuso) + grau(lon)
  if (!Number.isFinite(latG) || !Number.isFinite(lonG)) return null
  if (Math.abs(latG) > 90 || Math.abs(lonG) > 180) return null
  return { lat: latG, lon: lonG }
}
