// Vocabulário de risco do parecer: o enum cru do pipeline e o rótulo em
// português correto.
//
// Vive aqui, e não na página do parecer, porque agora há dois renderizadores do
// mesmo veredito — a tela e o DOCX. Um job classificado "crítico" na tela e
// "médio" no arquivo exportado seria pior que não exportar. Pelo mesmo motivo
// registrado no topo de useJobApresentacao.ts.
//
// As tabelas de classe CSS (selo, carimbo) continuam na página: são da tela.

export type NivelRisco = 'baixo' | 'medio' | 'alto' | 'critico' | 'indeterminado' | 'nao_aplicavel'

// O `else` genérico devolvia 'medio' para qualquer valor desconhecido: era ele
// que estampava "Risco médio" sobre um parecer classificado como crítico, e
// também sobre 'indeterminado' e 'nao_aplicavel'. Cada nível se declara.
export function nivelRisco(valor: unknown): NivelRisco | null {
  const r = String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
  if (!r) return null
  if (r.startsWith('nao_aplic') || r.startsWith('nao aplic')) return 'nao_aplicavel'
  if (r.startsWith('crit') || r.startsWith('altissim')) return 'critico'
  if (r.startsWith('alt')) return 'alto'
  if (r.startsWith('baix')) return 'baixo'
  if (r.startsWith('med') || r.startsWith('moder')) return 'medio'
  return 'indeterminado'
}

export const LABEL_POR_NIVEL: Record<NivelRisco, string> = {
  baixo: 'Risco baixo',
  medio: 'Risco médio',
  alto: 'Risco alto',
  critico: 'Risco crítico',
  indeterminado: 'Risco não classificado',
  nao_aplicavel: 'Risco não avaliado',
}

// O parecer exibe o veredito em português — nunca o enum cru do pipeline
// ("medio" sem acento é dialeto de máquina num documento jurídico)
export function riscoLabel(valor: unknown): string {
  const nivel = nivelRisco(valor)
  return nivel ? LABEL_POR_NIVEL[nivel] : 'Risco não classificado'
}
