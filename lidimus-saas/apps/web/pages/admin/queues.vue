<template>
  <div class="p-8 max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Monitoramento de Filas</h1>
      <div class="flex items-center gap-3">
        <span class="text-sm text-gray-500">Atualizado: {{ lastUpdated }}</span>
        <UButton size="sm" variant="outline" @click="refresh">Atualizar</UButton>
        <UButton
          size="sm"
          :color="autoRefresh ? 'primary' : 'neutral'"
          variant="outline"
          @click="toggleAutoRefresh"
        >
          {{ autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF' }}
        </UButton>
      </div>
    </div>

    <div v-if="pending" class="text-center py-12 text-gray-400">Carregando...</div>

    <div v-else-if="data" class="grid grid-cols-1 gap-6">
      <div
        v-for="(counts, queue) in data.queues"
        :key="queue"
        class="border rounded-xl p-6 bg-white shadow-sm"
      >
        <h2 class="text-lg font-semibold capitalize mb-4 flex items-center gap-2">
          <span
            :class="[
              'w-2 h-2 rounded-full',
              counts.active > 0 ? 'bg-green-500' : 'bg-gray-300',
            ]"
          />
          Fila: {{ queue }}
        </h2>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <div
            v-for="(value, status) in counts"
            :key="status"
            :class="[
              'rounded-lg p-3 text-center',
              status === 'active' && value > 0 ? 'bg-blue-50 border border-blue-200' : '',
              status === 'failed' && value > 0 ? 'bg-red-50 border border-red-200' : '',
              status === 'waiting' && value > 0 ? 'bg-yellow-50 border border-yellow-200' : '',
              !['active', 'failed', 'waiting'].includes(status) || value === 0 ? 'bg-gray-50' : '',
            ]"
          >
            <div class="text-2xl font-bold">{{ value }}</div>
            <div class="text-xs text-gray-500 mt-1 capitalize">{{ status }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { data, pending, refresh } = await useFetch('/api/admin/queue-stats', {
  lazy: true,
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
</script>
