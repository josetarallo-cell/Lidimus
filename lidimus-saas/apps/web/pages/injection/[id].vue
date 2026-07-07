<script setup lang="ts">
const route = useRoute()
const jobId = ref(route.params.id as string)
const { job } = useJobPoller(jobId)

useHead({ title: 'Laudo de verificação — Lidimus' })

const result = computed(() => job.value?.result as Record<string, any> | undefined)

const processando = computed(
  () => !job.value || (job.value.status !== 'done' && job.value.status !== 'error'),
)

const protocolo = computed(() => String(jobId.value ?? '').slice(0, 8).toUpperCase())

const emitidoEm = computed(() => {
  const ts = job.value?.completedAt as string | undefined
  return ts
    ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '—'
})

// A Regra do Carimbo: vermelho somente onde há risco real
const risco = computed(() => {
  const r = String(result.value?.risk_level ?? '').toLowerCase()
  if (r === 'high') return { classe: 'ld-selo--carimbo', texto: 'Risco alto' }
  if (r === 'medium') return { classe: 'ld-selo--ocre', texto: 'Risco médio' }
  if (r === 'low') return { classe: 'ld-selo--verde', texto: 'Risco baixo' }
  return { classe: 'ld-selo--neutro', texto: 'Não classificado' }
})

const temAchados = computed(() => (result.value?.findings?.length ?? 0) > 0)

function exportarPdf() {
  window.print()
}
</script>

<template>
  <div>
    <!-- Barra de ações -->
    <div class="acoes print-hidden">
      <NuxtLink to="/dashboard" class="ld-btn ld-btn--ghost">← Painel</NuxtLink>
      <button
        v-if="job?.status === 'done' && result"
        class="ld-btn ld-btn--primary acoes-exportar"
        @click="exportarPdf"
      >
        Exportar PDF
      </button>
    </div>

    <!-- Processando -->
    <div v-if="processando" class="print-hidden" aria-live="polite">
      <p class="nota-processando">
        Varrendo o documento em busca de conteúdo oculto — esta página atualiza sozinha, não é
        preciso recarregar.
      </p>
      <div class="prancha prancha--esqueleto" aria-hidden="true">
        <div class="esq-carimbo">
          <span class="esq-barra" style="width: 96px" />
          <span class="esq-barra" style="width: 140px" />
          <span class="esq-barra" style="width: 110px" />
        </div>
        <div class="esq-corpo">
          <span class="esq-barra esq-barra--titulo" style="width: 44%" />
          <span class="esq-barra" style="width: 30%" />
          <span class="esq-barra" style="width: 86%" />
          <span class="esq-barra" style="width: 72%" />
        </div>
      </div>
    </div>

    <!-- Erro -->
    <div v-else-if="job?.status === 'error'" class="falha print-hidden" role="alert">
      <p class="falha-titulo">Não foi possível concluir a verificação</p>
      <p class="falha-msg">{{ job.errorMessage ?? 'Ocorreu um erro inesperado durante o processamento.' }}</p>
      <p class="falha-acao">
        Tente <NuxtLink to="/injection" class="falha-link">enviar o PDF novamente</NuxtLink> — se
        o problema persistir, fale com o suporte.
      </p>
    </div>

    <!-- A prancha: o laudo -->
    <article v-else-if="result" id="documento-laudo" class="prancha">
      <header class="carimbo" aria-label="Identificação do documento">
        <div class="carimbo-cell carimbo-cell--marca">
          <svg width="16" height="16" viewBox="0 0 28 28" aria-hidden="true">
            <polygon points="14,2 26,14 14,26 2,14" fill="none" stroke="currentColor" stroke-width="2" />
            <polygon points="14,9 19,14 14,19 9,14" fill="currentColor" />
          </svg>
          Lidimus
        </div>
        <div class="carimbo-cell">
          <span class="carimbo-label">Análise</span>
          <span>Verificação de integridade</span>
        </div>
        <div class="carimbo-cell">
          <span class="carimbo-label">Protocolo</span>
          <span class="carimbo-id">{{ protocolo }}</span>
        </div>
        <div class="carimbo-cell">
          <span class="carimbo-label">Emitido</span>
          <span>{{ emitidoEm }}</span>
        </div>
        <div class="carimbo-cell carimbo-cell--selo">
          <span class="ld-selo" :class="risco.classe">{{ risco.texto }}</span>
        </div>
      </header>

      <div class="prancha-titulo">
        <h1>Laudo de verificação</h1>
        <p class="prancha-sub">
          Varredura de instruções ocultas: texto invisível, fontes minúsculas, camadas e metadados.
        </p>
      </div>

      <section class="secao" aria-labelledby="sec-achados">
        <h2 id="sec-achados">
          Achados
          <span v-if="temAchados" class="contagem">({{ result.findings.length }})</span>
        </h2>
        <ul v-if="temAchados" class="achados">
          <li v-for="(f, i) in result.findings" :key="i" class="achado">{{ f }}</li>
        </ul>
        <p v-else>
          <span class="ld-selo ld-selo--verde">Nenhum conteúdo oculto identificado</span>
        </p>
      </section>

      <footer class="prancha-rodape">
        <p>
          Laudo gerado automaticamente pela Lidimus. É uma ferramenta de apoio e não substitui a
          análise de profissional habilitado.
        </p>
      </footer>
    </article>

    <details v-if="result" class="depuracao print-hidden">
      <summary>Relatório completo da varredura (JSON)</summary>
      <pre>{{ JSON.stringify(job?.result, null, 2) }}</pre>
    </details>
  </div>
</template>

<style scoped>
.acoes {
  display: flex;
  align-items: center;
  gap: var(--ld-space-md);
  margin-bottom: var(--ld-space-lg);
  flex-wrap: wrap;
}
.acoes-exportar {
  margin-left: auto;
}

.nota-processando {
  margin: 0 0 var(--ld-space-md);
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}

/* Esqueleto */
.prancha--esqueleto {
  margin-top: var(--ld-space-sm);
}
.esq-carimbo {
  display: flex;
  gap: var(--ld-space-lg);
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
}
.esq-corpo {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: var(--ld-space-xl) var(--ld-space-xl) var(--ld-space-2xl);
}
.esq-barra {
  display: block;
  height: 12px;
  border-radius: var(--ld-r-xs);
  background: linear-gradient(90deg, var(--ld-bancada) 25%, #e9edeb 45%, var(--ld-bancada) 65%);
  background-size: 200% 100%;
  animation: brilho 1.4s linear infinite;
}
.esq-barra--titulo {
  height: 26px;
  margin-bottom: var(--ld-space-sm);
}
@keyframes brilho {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

/* Falha */
.falha {
  border: 1px solid var(--ld-carimbo);
  background: var(--ld-carimbo-selo);
  border-radius: var(--ld-r-md);
  padding: var(--ld-space-lg);
  max-width: 72ch;
}
.falha-titulo {
  margin: 0 0 var(--ld-space-sm);
  font-weight: 600;
  color: var(--ld-carimbo-tinta);
}
.falha-msg {
  margin: 0 0 var(--ld-space-md);
  color: var(--ld-tinta);
  font-size: 0.9375rem;
}
.falha-acao {
  margin: 0;
  color: var(--ld-tinta);
  font-size: 0.9375rem;
}
.falha-link {
  color: var(--ld-carimbo-tinta);
  font-weight: 600;
}

/* Prancha */
.prancha {
  background: var(--ld-folha);
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-md);
  overflow: hidden;
}
.carimbo {
  display: flex;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--ld-filete);
  background: var(--ld-papel);
}
.carimbo-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 10px var(--ld-space-md);
  border-right: 1px solid var(--ld-filete);
  font-size: 0.8125rem;
}
.carimbo-cell:last-child {
  border-right: none;
}
.carimbo-cell--marca {
  flex-direction: row;
  align-items: center;
  gap: var(--ld-space-sm);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 0.9375rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.carimbo-cell--marca svg {
  color: var(--ld-verde);
}
.carimbo-label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ld-tinta-suave);
}
.carimbo-id {
  font-family: var(--ld-font-mono);
}
.carimbo-cell--selo {
  margin-left: auto;
  justify-content: center;
}

.prancha-titulo {
  padding: var(--ld-space-xl) var(--ld-space-xl) var(--ld-space-lg);
}
.prancha-titulo h1 {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.2;
}
.prancha-sub {
  margin: var(--ld-space-xs) 0 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
  max-width: 60ch;
}

.secao {
  border-top: 1px solid var(--ld-filete);
  padding: var(--ld-space-lg) var(--ld-space-xl) var(--ld-space-xl);
}
.secao h2 {
  margin: 0 0 var(--ld-space-md);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}
.contagem {
  color: var(--ld-tinta-suave);
  font-weight: 400;
}

/* Achados: conteúdo oculto real — o vermelho é o alarme */
.achados {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-sm);
}
.achado {
  border: 1px solid var(--ld-carimbo);
  background: var(--ld-carimbo-selo);
  border-radius: var(--ld-r-sm);
  padding: 12px var(--ld-space-md);
  font-size: 0.9375rem;
  color: var(--ld-tinta);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.prancha-rodape {
  border-top: 1px solid var(--ld-filete);
  padding: var(--ld-space-md) var(--ld-space-xl) var(--ld-space-lg);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.prancha-rodape p {
  margin: 0;
  max-width: 90ch;
}

.depuracao {
  margin-top: var(--ld-space-lg);
}
.depuracao summary {
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.depuracao summary:hover {
  color: var(--ld-tinta);
}
.depuracao pre {
  margin-top: var(--ld-space-sm);
  font-family: var(--ld-font-mono);
  font-size: 0.75rem;
  background: var(--ld-bancada);
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  padding: var(--ld-space-md);
  overflow: auto;
  max-height: 24rem;
}

@media (max-width: 640px) {
  .prancha-titulo,
  .secao {
    padding-left: var(--ld-space-md);
    padding-right: var(--ld-space-md);
  }
  .prancha-titulo {
    padding-top: var(--ld-space-lg);
  }
  .carimbo-cell--marca {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--ld-filete);
  }
  .carimbo-cell--selo {
    margin-left: 0;
  }
}
</style>

<style>
@media print {
  @page {
    size: A4;
    margin: 14mm;
  }
  .print-hidden {
    display: none !important;
  }
  #documento-laudo {
    border: none !important;
    border-radius: 0 !important;
    font-size: 12px;
  }
  #documento-laudo .carimbo,
  #documento-laudo .ld-selo,
  #documento-laudo .achado {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  #documento-laudo .prancha-titulo h1 {
    font-size: 20px;
  }
}
</style>
