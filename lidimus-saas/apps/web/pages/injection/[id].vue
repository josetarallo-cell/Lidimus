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

// O alarme sem orientação abandona o usuário no pico da ansiedade — o laudo
// diz o que o achado significa e o que fazer, em linguagem leiga
const veredito = computed(() => {
  if (!temAchados.value) return null
  const r = String(result.value?.risk_level ?? '').toLowerCase()
  if (r === 'high') {
    return (
      'Este arquivo contém instruções ocultas destinadas a manipular análises feitas por ' +
      'inteligência artificial. Recomendamos não confiar em resumos ou análises automáticas ' +
      'deste documento e conferir o conteúdo original antes de aceitá-lo.'
    )
  }
  return (
    'Este arquivo apresenta indícios que merecem verificação. Confira os achados abaixo e o ' +
    'documento original antes de confiar em análises automáticas deste arquivo.'
  )
})

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
      <PranchaEsqueleto />
    </div>

    <!-- Erro -->
    <PranchaFalha
      v-else-if="job?.status === 'error'"
      titulo="Não foi possível concluir a verificação"
      :mensagem="String(job.errorMessage ?? 'Ocorreu um erro inesperado durante o processamento.')"
      retry-to="/injection"
      retry-label="enviar o PDF novamente"
    />

    <!-- A prancha: o laudo -->
    <article v-else-if="result" id="documento-laudo" class="prancha">
      <BlocoCarimbo
        analise="Verificação de integridade"
        documento-label="Protocolo"
        :documento="protocolo"
        :emitido="emitidoEm"
      >
        <span class="ld-selo" :class="risco.classe">{{ risco.texto }}</span>
      </BlocoCarimbo>

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
        <p v-if="veredito" class="veredito">{{ veredito }}</p>
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

    <details v-if="result?.fullText" class="depuracao print-hidden">
      <summary>
        Texto completo do documento<template v-if="temAchados"> (inclui o conteúdo oculto encontrado)</template>
      </summary>
      <pre>{{ result.fullText }}</pre>
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

/* Prancha */
.prancha {
  background: var(--ld-folha);
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-md);
  overflow: hidden;
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

.veredito {
  margin: 0 0 var(--ld-space-md);
  max-width: 72ch;
  font-size: 0.9375rem;
  line-height: 1.6;
  text-wrap: pretty;
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
  /* Texto extraído tem linhas longas — quebrar em vez de rolar na horizontal */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
