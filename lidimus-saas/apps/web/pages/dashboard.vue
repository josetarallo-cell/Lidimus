<script setup lang="ts">
useHead({ title: 'Painel — Lidimus' })

const { data: jobList, refresh } = await useFetch('/api/jobs')

const typeLabel: Record<string, string> = {
  matricula: 'Matrícula',
  kml: 'Memorial KML',
  injection: 'Verificação de PDF',
}

// Etapas em linguagem de ofício — nunca jargão de máquina na UI
const stageLabel: Record<string, string> = {
  ocr: 'Leitura do documento',
  juridico: 'Análise jurídica',
  doc: 'Montagem do parecer',
}

type Job = { id: string; type: string; status: string; stage?: string | null; createdAt: string }

function statusSelo(job: Job): { classe: string; texto: string } {
  if (job.status === 'done') return { classe: 'ld-selo--verde', texto: 'Concluído' }
  if (job.status === 'error') return { classe: 'ld-selo--carimbo', texto: 'Falhou' }
  const etapa = job.stage ? stageLabel[job.stage] ?? null : null
  return { classe: 'ld-selo--neutro', texto: etapa ? `Processando · ${etapa}` : 'Processando' }
}

function rota(job: Job): string {
  if (job.type === 'kml') return `/kml/${job.id}`
  if (job.type === 'injection') return `/injection/${job.id}`
  return `/matriculas/${job.id}`
}

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

onMounted(() => {
  const timer = setInterval(refresh, 10_000)
  onUnmounted(() => clearInterval(timer))
})
</script>

<template>
  <div>
    <header class="painel-cabecalho">
      <h1>Painel</h1>
      <div class="painel-acoes">
        <NuxtLink to="/matriculas" class="ld-btn ld-btn--secondary ld-btn--sm">Nova matrícula</NuxtLink>
        <NuxtLink to="/kml" class="ld-btn ld-btn--secondary ld-btn--sm">Novo memorial</NuxtLink>
        <NuxtLink to="/injection" class="ld-btn ld-btn--secondary ld-btn--sm">Verificar PDF</NuxtLink>
      </div>
    </header>

    <section class="ld-painel">
      <h2 class="tabela-titulo">Análises recentes</h2>

      <div v-if="!jobList?.length" class="vazio">
        <svg width="22" height="22" viewBox="0 0 28 28" aria-hidden="true">
          <polygon points="14,2 26,14 14,26 2,14" fill="none" stroke="currentColor" stroke-width="2" />
          <polygon points="14,9 19,14 14,19 9,14" fill="currentColor" />
        </svg>
        <p class="vazio-titulo">Nenhuma análise ainda</p>
        <p class="vazio-texto">
          Envie uma <NuxtLink to="/matriculas">certidão de matrícula</NuxtLink> para gerar seu
          primeiro parecer — ou comece por um
          <NuxtLink to="/kml">memorial descritivo</NuxtLink> ou pela
          <NuxtLink to="/injection">verificação de um PDF</NuxtLink>.
        </p>
      </div>

      <div v-else class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Status</th>
              <th scope="col">Criado em</th>
              <th scope="col"><span class="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in (jobList as Job[])" :key="job.id">
              <td class="celula-tipo">{{ typeLabel[job.type] ?? job.type }}</td>
              <td>
                <span class="ld-selo" :class="statusSelo(job).classe">{{ statusSelo(job).texto }}</span>
              </td>
              <td class="celula-data">{{ dataFmt(job.createdAt) }}</td>
              <td class="celula-acao">
                <NuxtLink :to="rota(job)" class="ld-btn ld-btn--ghost ld-btn--sm">Ver</NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.painel-cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  margin-bottom: var(--ld-space-lg);
}
.painel-cabecalho h1 {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.75rem;
  line-height: 1.2;
}
.painel-acoes {
  display: flex;
  gap: var(--ld-space-sm);
  flex-wrap: wrap;
}

.tabela-titulo {
  margin: 0;
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}

.vazio {
  padding: var(--ld-space-2xl) var(--ld-space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ld-space-sm);
  text-align: center;
}
.vazio svg {
  color: var(--ld-verde);
  margin-bottom: var(--ld-space-xs);
}
.vazio-titulo {
  margin: 0;
  font-weight: 600;
}
.vazio-texto {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
  max-width: 44ch;
  text-wrap: pretty;
}
.vazio-texto a {
  color: var(--ld-verde);
  font-weight: 500;
}
.vazio-texto a:hover {
  color: var(--ld-verde-profundo);
}

.tabela-rolagem {
  overflow-x: auto;
}
.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
}
.tabela th {
  text-align: left;
  background: var(--ld-bancada);
  color: var(--ld-tinta-suave);
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 10px var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  white-space: nowrap;
}
.tabela td {
  padding: 12px var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  vertical-align: middle;
}
.tabela tbody tr:last-child td {
  border-bottom: none;
}
.tabela tbody tr {
  transition: background var(--ld-dur-estado) var(--ld-ease);
}
.tabela tbody tr:hover {
  background: var(--ld-papel);
}
.celula-tipo {
  font-weight: 500;
  white-space: nowrap;
}
.celula-data {
  color: var(--ld-tinta-suave);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.celula-acao {
  text-align: right;
  white-space: nowrap;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
