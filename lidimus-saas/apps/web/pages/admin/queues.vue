<script setup lang="ts">
useHead({ title: 'Filas — Lidimus' })

// Restrito a administradores da plataforma — a API já reforça isso, mas sem esta
// checagem a página tentaria renderizar e só falharia silenciosamente na busca de dados.
const { data: me } = await useFetch('/api/me')
if (!me.value?.isPlatformAdmin) {
  await navigateTo('/dashboard')
}

// server: false — as estatísticas dependem do Redis; se ele estiver fora do ar,
// a página ainda renderiza e mostra o estado de carregamento no cliente
const { data, pending, refresh } = await useFetch('/api/admin/queue-stats', {
  lazy: true,
  server: false,
})

const lastUpdated = computed(() => {
  if (!data.value) return '—'
  return new Date(data.value.timestamp).toLocaleTimeString('pt-BR')
})

let intervalId: ReturnType<typeof setInterval> | null = null
const autoRefresh = ref(false)

function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) {
    intervalId = setInterval(() => refresh(), 5000)
  } else {
    if (intervalId) clearInterval(intervalId)
  }
}

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

// Página administrativa: os nomes técnicos das filas/estados são o vocabulário certo aqui
function classeContagem(status: string, value: number): string {
  if (value === 0) return ''
  if (status === 'failed') return 'contagem--falha'
  if (status === 'active') return 'contagem--ativa'
  if (status === 'waiting') return 'contagem--espera'
  return ''
}
</script>

<template>
  <div>
    <AdminNav />

    <header class="filas-cabecalho">
      <h1>Monitoramento de filas</h1>
      <div class="filas-acoes">
        <span class="filas-atualizado">Atualizado: {{ lastUpdated }}</span>
        <button class="ld-btn ld-btn--secondary ld-btn--sm" @click="refresh()">Atualizar</button>
        <button
          class="ld-btn ld-btn--sm"
          :class="autoRefresh ? 'ld-btn--primary' : 'ld-btn--secondary'"
          :aria-pressed="autoRefresh"
          @click="toggleAutoRefresh"
        >
          {{ autoRefresh ? 'Atualização automática: ligada' : 'Atualização automática: desligada' }}
        </button>
      </div>
    </header>

    <p v-if="pending" class="filas-carregando">Carregando…</p>

    <div v-else-if="data" class="filas-lista">
      <section v-for="(counts, queue) in data.queues" :key="queue" class="ld-painel fila">
        <h2 class="fila-nome">
          <span
            class="fila-indicador"
            :class="{ 'fila-indicador--ativa': counts.active > 0 }"
            aria-hidden="true"
          />
          {{ queue }}
        </h2>
        <div class="fila-contagens">
          <div
            v-for="(value, status) in counts"
            :key="status"
            class="contagem"
            :class="classeContagem(String(status), Number(value))"
          >
            <span class="contagem-valor">{{ value }}</span>
            <span class="contagem-status">{{ status }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.filas-cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  margin-bottom: var(--ld-space-lg);
}
.filas-cabecalho h1 {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.75rem;
  line-height: 1.2;
}
.filas-acoes {
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  flex-wrap: wrap;
}
.filas-atualizado {
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
  font-variant-numeric: tabular-nums;
}
.filas-carregando {
  margin: var(--ld-space-2xl) 0;
  text-align: center;
  color: var(--ld-tinta-suave);
}

.filas-lista {
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-lg);
}
.fila {
  padding: var(--ld-space-lg);
}
.fila-nome {
  margin: 0 0 var(--ld-space-md);
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  font-size: 1.125rem;
  font-weight: 600;
  font-family: var(--ld-font-mono);
}
.fila-indicador {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ld-filete);
  flex: none;
}
.fila-indicador--ativa {
  background: var(--ld-verde);
}
.fila-contagens {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: var(--ld-space-sm);
}
.contagem {
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: var(--ld-papel);
  padding: var(--ld-space-md) var(--ld-space-sm);
  text-align: center;
}
.contagem--ativa {
  background: var(--ld-verde-selo);
  border-color: var(--ld-verde);
}
.contagem--falha {
  background: var(--ld-carimbo-selo);
  border-color: var(--ld-carimbo);
}
.contagem--espera {
  background: var(--ld-ocre-selo);
  border-color: var(--ld-ocre);
}
.contagem-valor {
  display: block;
  font-family: var(--ld-font-serif);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.contagem-status {
  display: block;
  margin-top: 2px;
  font-size: 0.75rem;
  color: var(--ld-tinta-suave);
  font-family: var(--ld-font-mono);
}
</style>
