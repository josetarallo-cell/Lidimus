<script setup lang="ts">
const route = useRoute()
const jobId = ref(route.params.id as string)
const { job, polling } = useJobPoller(jobId)
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <UButton to="/dashboard" variant="ghost" icon="i-heroicons-arrow-left" size="xs">Voltar</UButton>
      <h1 class="text-2xl font-bold">Resultado — Detector de Prompt Injection</h1>
    </div>

    <JobStatus :job="job" :polling="polling">
      <template #result="{ result }">
        <div class="space-y-3">
          <div v-if="result.risk_level">
            <UBadge :color="result.risk_level === 'high' ? 'red' : result.risk_level === 'medium' ? 'yellow' : 'green'" size="lg">
              Risco: {{ result.risk_level }}
            </UBadge>
          </div>
          <div v-if="result.findings?.length">
            <h3 class="font-semibold mb-2">Achados</h3>
            <ul class="text-sm space-y-1">
              <li v-for="(f, i) in result.findings" :key="i">• {{ f }}</li>
            </ul>
          </div>
          <details class="mt-4">
            <summary class="cursor-pointer text-sm text-gray-500">Ver relatório completo</summary>
            <pre class="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-auto max-h-96">{{ JSON.stringify(result, null, 2) }}</pre>
          </details>
        </div>
      </template>
    </JobStatus>
  </div>
</template>
