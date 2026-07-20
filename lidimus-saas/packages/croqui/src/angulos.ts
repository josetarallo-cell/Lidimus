// Conversão de ângulos escritos na matrícula em graus decimais.
// Os campos *_raw chegam exatamente como no texto (a skill corrige artefatos de
// OCR mas não converte unidades) — a trigonometria acontece aqui.

const num = (s: string) => Number(s.replace(',', '.'))

// "83°06'19\"" | "83º06'" | "83°" | "83" | "12°30'45''" → graus decimais
export function parseDms(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  const m = s.match(
    /^(\d{1,3}(?:[.,]\d+)?)\s*(?:[°ºo]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:['’´`′])?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:["”″]|'')?)?)?)?$/,
  )
  if (!m) return null
  const graus = num(m[1])
  const minutos = m[2] != null ? num(m[2]) : 0
  const segundos = m[3] != null ? num(m[3]) : 0
  // minutos/segundos ≥ 60 são artefato de OCR não corrigido — melhor recusar
  if (!Number.isFinite(graus) || graus > 360 || minutos >= 60 || segundos >= 60) return null
  return graus + minutos / 60 + segundos / 3600
}

// "N 45°10' E" / "S 22°30'15\" O" → azimute (graus a partir do norte, sentido horário).
// Aceita O (oeste) como sinônimo de W.
export function rumoParaAzimute(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const s = String(raw).trim().toUpperCase()
  const m = s.match(/^([NS])\s*(.+?)\s*([EWO])\.?$/)
  if (!m) return null
  const ang = parseDms(m[2])
  if (ang == null || ang > 90) return null
  const norte = m[1] === 'N'
  const leste = m[3] === 'E'
  if (norte && leste) return ang
  if (!norte && leste) return 180 - ang
  if (!norte && !leste) return 180 + ang
  return (360 - ang) % 360
}
