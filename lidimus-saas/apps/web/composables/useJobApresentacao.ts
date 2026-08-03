// Como um job aparece numa listagem: nome do arquivo, número do documento, selo
// de status e selo de risco.
//
// Vive aqui porque o painel e a página do lote mostram a mesma linha e não podem
// divergir — um job "Crítico" no painel e "Médio" no lote seria pior que não ter
// a segunda tela.

export type JobListado = {
  id: string
  type: string
  status: string
  stage?: string | null
  inputMeta?: Record<string, any> | null
  result?: Record<string, any> | null
  createdAt: string
  createdBy?: string | null
}

export type Selo = { classe: string; texto: string }

// Etapas em linguagem de ofício — nunca jargão de máquina na UI
export const ETAPA_ROTULO: Record<string, string> = {
  ocr: 'Leitura do documento',
  juridico: 'Análise jurídica',
  doc: 'Montagem do parecer',
  croqui: 'Desenho do croqui',
}

// Nome do PDF original enviado — guardado em inputMeta.originalName por todos os
// tipos de job (matrícula, memorial, croqui, verificação)
export function arquivoNome(job: JobListado): string {
  const nome = job.inputMeta?.originalName
  return typeof nome === 'string' && nome.trim() ? nome : '—'
}

// Número do documento — só faz sentido em Matrícula e Croqui. A matrícula guarda
// no cabeçalho do parecer; o croqui, no topo do JSON de extração (numero_matricula).
export function numeroDocumento(job: JobListado): string | null {
  let bruto: unknown = null
  if (job.type === 'matricula') {
    bruto = job.result?.documento?.cabecalho?.numero_matricula ?? job.result?.numero_matricula
  } else if (job.type === 'croqui') {
    bruto = job.result?.numero_matricula
  }
  const texto = bruto == null ? '' : String(bruto).trim()
  return texto ? texto : null
}

export function statusSelo(job: JobListado): Selo {
  if (job.status === 'done') return { classe: 'ld-selo--verde', texto: 'Concluído' }
  if (job.status === 'error') return { classe: 'ld-selo--carimbo', texto: 'Falhou' }
  const etapa = job.stage ? ETAPA_ROTULO[job.stage] ?? null : null
  return { classe: 'ld-selo--neutro', texto: etapa ? `Processando · ${etapa}` : 'Processando' }
}

// Risco só se aplica a Matrículas e Detector — Memorial (kml) e Croqui não avaliam risco
export function riscoInfo(job: JobListado): Selo | null {
  if (job.type === 'kml' || job.type === 'croqui') return null
  if (job.status !== 'done') return { classe: 'ld-selo--neutro', texto: '—' }

  if (job.type === 'injection') {
    const r = String(job.result?.risk_level ?? '').toLowerCase()
    if (r === 'high') return { classe: 'ld-selo--carimbo', texto: 'Alto' }
    if (r === 'medium') return { classe: 'ld-selo--ocre', texto: 'Médio' }
    if (r === 'low') return { classe: 'ld-selo--verde', texto: 'Baixo' }
    return { classe: 'ld-selo--neutro', texto: 'Não classificado' }
  }

  if (job.type === 'matricula') {
    // Matrícula incompleta não tem risco a exibir: o que a listagem precisa
    // mostrar é que aquele laudo não traz parecer.
    if (job.result?.matricula_incompleta === true) {
      return { classe: 'ld-selo--carimbo', texto: 'Incompleta' }
    }
    const r = String(
      job.result?.documento?.cabecalho?.classificacao_risco ?? job.result?.classificacao_risco ?? '',
    )
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
    // O `if (r)` genérico rotulava de "Médio" tudo que não fosse baixo nem alto
    // — inclusive 'critico' e 'indeterminado'. Cada nível se declara.
    if (r.startsWith('nao_aplic') || r.startsWith('nao aplic')) {
      return { classe: 'ld-selo--neutro', texto: 'Não avaliado' }
    }
    if (r.startsWith('crit') || r.startsWith('altissim')) {
      return { classe: 'ld-selo--critico', texto: 'Crítico' }
    }
    if (r.startsWith('alt')) return { classe: 'ld-selo--carimbo', texto: 'Alto' }
    if (r.startsWith('baix')) return { classe: 'ld-selo--verde', texto: 'Baixo' }
    if (r.startsWith('med') || r.startsWith('moder')) {
      return { classe: 'ld-selo--ocre', texto: 'Médio' }
    }
    return { classe: 'ld-selo--neutro', texto: 'Não classificado' }
  }

  return null
}

export function rotaDoJob(job: JobListado): string {
  if (job.type === 'kml') return `/kml/${job.id}`
  if (job.type === 'injection') return `/injection/${job.id}`
  if (job.type === 'croqui') return `/croqui/${job.id}`
  return `/matriculas/${job.id}`
}

export function dataFmt(iso: string): string {
  // timeZone fixo: sem ele, servidor (UTC) e navegador (BRT) formatam horas
  // diferentes para o mesmo timestamp e o SSR gera hydration mismatch
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  })
}

export function jobEmAndamento(job: JobListado): boolean {
  return job.status !== 'done' && job.status !== 'error'
}
