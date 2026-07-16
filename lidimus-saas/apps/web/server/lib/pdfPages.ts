// Conta páginas de um PDF sem dependências externas. Usado para precificar
// análises por página no momento do upload (o custo real de tokens escala com o
// tamanho do documento). É best-effort: PDFs com xref/object streams comprimidos
// escondem os objetos de página, então há fallbacks em cascata.

const BYTES_PER_PAGE_ESTIMATE = 45_000 // heurística para PDFs comprimidos onde a contagem exata falha

// Estratégia 1: contar objetos "/Type /Page" em texto plano. Confiável para PDFs
// digitalizados (scanners não usam object streams), que são o caso comum de
// matrículas. Ignora "/Type /Pages" (nó-árvore) via lookahead negativo.
function countPageObjects(raw: string): number {
  const matches = raw.match(/\/Type\s*\/Page(?![a-zA-Z])/g)
  return matches ? matches.length : 0
}

// Estratégia 2: ler "/Count N" do nó /Pages. Presente em muitos PDFs lineares
// mesmo quando os objetos de página individuais não aparecem em texto plano.
// Usa o maior /Count (a raiz da árvore de páginas tem o total).
function countFromPagesTree(raw: string): number {
  const matches = raw.matchAll(/\/Count\s+(\d+)/g)
  let max = 0
  for (const m of matches) {
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max
}

export function countPdfPages(buffer: Buffer): number {
  // latin1 preserva bytes 1:1 — mesmo approach do parser de imagens do workflow
  const raw = buffer.toString('latin1')

  const byObjects = countPageObjects(raw)
  const byTree = countFromPagesTree(raw)
  const detected = Math.max(byObjects, byTree)
  if (detected > 0) return detected

  // Fallback: PDF comprimido onde nada aparece em texto plano. Estima pelo
  // tamanho em bytes — subfatura menos que assumir 1 página para docs grandes.
  return Math.max(1, Math.round(buffer.length / BYTES_PER_PAGE_ESTIMATE))
}
