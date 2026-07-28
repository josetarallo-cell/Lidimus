<script setup lang="ts">
useHead({ title: 'Painel — Lidimus' })

const PAGE_SIZE = 20
const pagina = ref(1)

// Abas por origem — cada aba é um tipo de job, com sua própria paginação
const abas = [
  { tipo: 'matricula', label: 'Matrículas', novoTo: '/matriculas', vazioTexto: 'Envie uma certidão de matrícula para gerar seu primeiro parecer.' },
  { tipo: 'croqui', label: 'Croqui', novoTo: '/croqui', vazioTexto: 'Envie um arquivo para gerar seu primeiro croqui do terreno.' },
  { tipo: 'kml', label: 'Memorial', novoTo: '/kml', vazioTexto: 'Envie um KML para gerar seu primeiro memorial descritivo.' },
  { tipo: 'injection', label: 'Detector', novoTo: '/injection', vazioTexto: 'Envie um PDF para verificar conteúdo oculto.' },
] as const

const abaAtiva = ref<(typeof abas)[number]['tipo']>('matricula')
const abaInfo = computed(() => abas.find((a) => a.tipo === abaAtiva.value)!)

function selecionarAba(tipo: (typeof abas)[number]['tipo']) {
  abaAtiva.value = tipo
  pagina.value = 1
}

const { data: jobData, refresh } = await useFetch('/api/jobs', {
  query: computed(() => ({
    type: abaAtiva.value,
    limit: PAGE_SIZE,
    offset: (pagina.value - 1) * PAGE_SIZE,
  })),
})
const { data: creditos } = await useFetch('/api/account/credits')

// Boas-vindas do primeiro acesso — o painel é onde todo mundo cai depois de
// confirmar o e-mail, então é aqui que a tela aparece (uma vez só).
const { data: me } = await useFetch('/api/me')
const mostrarBoasVindas = ref(me.value?.welcomed === false)

async function encerrarBoasVindas() {
  mostrarBoasVindas.value = false
  // Se a marcação falhar, a tela volta no próximo acesso — incômodo pequeno,
  // e melhor do que travar o painel por causa de um aviso de cortesia.
  await $fetch('/api/account/welcome', { method: 'POST' }).catch(() => {})
}

const jobList = computed(() => jobData.value?.items ?? [])
const totalPaginas = computed(() => Math.max(1, Math.ceil((jobData.value?.total ?? 0) / PAGE_SIZE)))

// Se a página atual esvaziar (ex.: total diminuiu), recua para a última válida
watch(totalPaginas, (t) => {
  if (pagina.value > t) pagina.value = t
})

// Etapas em linguagem de ofício — nunca jargão de máquina na UI
const stageLabel: Record<string, string> = {
  ocr: 'Leitura do documento',
  juridico: 'Análise jurídica',
  doc: 'Montagem do parecer',
  croqui: 'Desenho do croqui',
}

type Job = {
  id: string
  type: string
  status: string
  stage?: string | null
  inputMeta?: Record<string, any> | null
  result?: Record<string, any> | null
  createdAt: string
}

// Nome do PDF original enviado — guardado em inputMeta.originalName por todos os
// tipos de job (matrícula, memorial, croqui, verificação)
function arquivoNome(job: Job): string {
  const nome = job.inputMeta?.originalName
  return typeof nome === 'string' && nome.trim() ? nome : '—'
}

// Número do documento — só faz sentido em Matrícula e Croqui. A matrícula guarda
// no cabeçalho do parecer; o croqui, no topo do JSON de extração (numero_matricula).
function numeroDocumento(job: Job): string | null {
  let bruto: unknown = null
  if (job.type === 'matricula') {
    bruto = job.result?.documento?.cabecalho?.numero_matricula ?? job.result?.numero_matricula
  } else if (job.type === 'croqui') {
    bruto = job.result?.numero_matricula
  }
  const texto = bruto == null ? '' : String(bruto).trim()
  return texto ? texto : null
}

function statusSelo(job: Job): { classe: string; texto: string } {
  if (job.status === 'done') return { classe: 'ld-selo--verde', texto: 'Concluído' }
  if (job.status === 'error') return { classe: 'ld-selo--carimbo', texto: 'Falhou' }
  const etapa = job.stage ? stageLabel[job.stage] ?? null : null
  return { classe: 'ld-selo--neutro', texto: etapa ? `Processando · ${etapa}` : 'Processando' }
}

// Risco só se aplica a Matrículas e Detector — Memorial (kml) e Croqui não avaliam risco
function riscoInfo(job: Job): { classe: string; texto: string } | null {
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
    const r = String(
      job.result?.documento?.cabecalho?.classificacao_risco ?? job.result?.classificacao_risco ?? '',
    ).toLowerCase()
    if (r.startsWith('baix')) return { classe: 'ld-selo--verde', texto: 'Baixo' }
    if (r.startsWith('alt')) return { classe: 'ld-selo--carimbo', texto: 'Alto' }
    if (r) return { classe: 'ld-selo--ocre', texto: 'Médio' }
    return { classe: 'ld-selo--neutro', texto: 'Não classificado' }
  }

  return null
}

function rota(job: Job): string {
  if (job.type === 'kml') return `/kml/${job.id}`
  if (job.type === 'injection') return `/injection/${job.id}`
  if (job.type === 'croqui') return `/croqui/${job.id}`
  return `/matriculas/${job.id}`
}

// A linha inteira é o alvo de toque; o link "Ver" continua sendo o caminho
// acessível (teclado/leitor de tela)
function abrir(job: Job) {
  navigateTo(rota(job))
}

function dataFmt(iso: string): string {
  // timeZone fixo: sem ele, servidor (UTC) e navegador (BRT) formatam horas
  // diferentes para o mesmo timestamp e o SSR gera hydration mismatch
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  })
}

onMounted(() => {
  const timer = setInterval(refresh, 10_000)
  onUnmounted(() => clearInterval(timer))
})
</script>

<template>
  <div>
    <BoasVindas v-if="mostrarBoasVindas" :nome="me?.name" @fechar="encerrarBoasVindas" />

    <header class="painel-cabecalho">
      <h1>Painel</h1>
      <div class="painel-acoes">
        <NuxtLink to="/conta/creditos" class="painel-saldo" title="Ver histórico de créditos">
          <span class="painel-saldo-valor">{{ creditos?.balance ?? 0 }}</span> créditos
        </NuxtLink>
      </div>
    </header>

    <section class="ld-painel">
      <div class="abas-cabecalho">
        <h2 class="tabela-titulo">Análises recentes</h2>
        <nav class="abas" role="tablist" aria-label="Filtrar por origem">
          <button
            v-for="aba in abas"
            :key="aba.tipo"
            type="button"
            role="tab"
            class="aba"
            :class="{ 'aba--ativa': abaAtiva === aba.tipo }"
            :aria-selected="abaAtiva === aba.tipo"
            @click="selecionarAba(aba.tipo)"
          >
            {{ aba.label }}
          </button>
        </nav>
      </div>

      <div v-if="!jobList.length" class="vazio">
        <svg width="22" height="22" viewBox="0 0 28 28" aria-hidden="true">
          <polygon points="14,2 26,14 14,26 2,14" fill="none" stroke="currentColor" stroke-width="2" />
          <polygon points="14,9 19,14 14,19 9,14" fill="currentColor" />
        </svg>
        <p class="vazio-titulo">Nenhuma análise em {{ abaInfo.label }} ainda</p>
        <p class="vazio-texto">
          {{ abaInfo.vazioTexto }} <NuxtLink :to="abaInfo.novoTo">Começar agora</NuxtLink>.
        </p>
      </div>

      <div v-else class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th scope="col">Arquivo</th>
              <th scope="col">Nº do documento</th>
              <th scope="col">Status</th>
              <th scope="col">Risco</th>
              <th scope="col">Criado em</th>
              <th scope="col"><span class="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in (jobList as Job[])" :key="job.id" class="linha" @click="abrir(job)">
              <td class="celula-arquivo">
                <span class="arquivo-nome" :title="arquivoNome(job)">{{ arquivoNome(job) }}</span>
              </td>
              <td class="celula-numero">
                <span v-if="numeroDocumento(job)" class="numero-doc">{{ numeroDocumento(job) }}</span>
                <span v-else class="celula-na">—</span>
              </td>
              <td class="celula-status">
                <span class="ld-selo" :class="statusSelo(job).classe">{{ statusSelo(job).texto }}</span>
              </td>
              <td class="celula-risco">
                <span v-if="riscoInfo(job)" class="ld-selo" :class="riscoInfo(job)!.classe">
                  {{ riscoInfo(job)!.texto }}
                </span>
                <span v-else class="celula-na">Não se aplica</span>
              </td>
              <td class="celula-data">{{ dataFmt(job.createdAt) }}</td>
              <td class="celula-acao">
                <NuxtLink :to="rota(job)" class="ld-btn ld-btn--ghost ld-btn--sm" @click.stop>Ver</NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <nav v-if="totalPaginas > 1" class="paginacao" aria-label="Paginação das análises">
        <button
          type="button"
          class="ld-btn ld-btn--ghost ld-btn--sm"
          :disabled="pagina <= 1"
          @click="pagina--"
        >
          Anterior
        </button>
        <span class="paginacao-info">Página {{ pagina }} de {{ totalPaginas }}</span>
        <button
          type="button"
          class="ld-btn ld-btn--ghost ld-btn--sm"
          :disabled="pagina >= totalPaginas"
          @click="pagina++"
        >
          Próxima
        </button>
      </nav>
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
  align-items: center;
  gap: var(--ld-space-sm);
  flex-wrap: wrap;
}

.painel-saldo {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: var(--ld-folha);
  padding: 6px 12px;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
  text-decoration: none;
  transition: border-color var(--ld-dur-estado) var(--ld-ease);
}
.painel-saldo:hover {
  border-color: var(--ld-verde);
}
.painel-saldo-valor {
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1rem;
  color: var(--ld-tinta);
  font-variant-numeric: tabular-nums;
}

.abas-cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
}
.tabela-titulo {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}
.abas {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.aba {
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: var(--ld-folha);
  color: var(--ld-tinta-suave);
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 6px 14px;
  cursor: pointer;
  transition:
    background var(--ld-dur-estado) var(--ld-ease),
    color var(--ld-dur-estado) var(--ld-ease),
    border-color var(--ld-dur-estado) var(--ld-ease);
}
.aba:hover {
  border-color: var(--ld-verde);
}
.aba--ativa {
  background: var(--ld-verde);
  border-color: var(--ld-verde);
  color: var(--ld-folha);
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
  cursor: pointer;
  transition: background var(--ld-dur-estado) var(--ld-ease);
}
.tabela tbody tr:hover {
  background: var(--ld-papel);
}
.celula-arquivo {
  max-width: 22ch;
  color: var(--ld-tinta-suave);
}
.arquivo-nome {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
}
.celula-numero {
  white-space: nowrap;
}
.numero-doc {
  font-family: var(--ld-font-mono);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
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
.celula-na {
  color: var(--ld-tinta-suave);
  font-size: 0.875rem;
}

.paginacao {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ld-space-md);
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-top: 1px solid var(--ld-filete);
}
.paginacao-info {
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
  font-variant-numeric: tabular-nums;
}

/* Mobile: a tabela vira cards empilhados — nada fica escondido atrás de
   rolagem horizontal sem pista, e o alvo de toque é o card inteiro */
@media (max-width: 640px) {
  .tabela thead {
    display: none;
  }
  .tabela,
  .tabela tbody {
    display: block;
  }
  .tabela tbody tr {
    display: grid;
    grid-template-columns: 1fr auto;
    row-gap: 6px;
    column-gap: var(--ld-space-md);
    padding: var(--ld-space-md) var(--ld-space-md);
    border-bottom: 1px solid var(--ld-filete);
  }
  .tabela tbody tr:last-child {
    border-bottom: none;
  }
  .tabela td {
    display: block;
    padding: 0;
    border: none;
  }
  .celula-arquivo,
  .celula-numero,
  .celula-status,
  .celula-risco,
  .celula-data {
    grid-column: 1;
  }
  .celula-acao {
    grid-column: 2;
    grid-row: 1 / span 6;
    align-self: center;
  }
  /* No card, o nome do arquivo usa a largura disponível (com reticências),
     não o teto estreito da coluna da tabela */
  .celula-arquivo {
    max-width: none;
  }
  .celula-data {
    font-size: 0.8125rem;
  }
}

</style>
