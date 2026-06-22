<script setup lang="ts">
const route = useRoute()
const jobId = ref(route.params.id as string)
const { job, polling } = useJobPoller(jobId)
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <UButton to="/dashboard" variant="ghost" icon="i-heroicons-arrow-left" size="xs">Voltar</UButton>
      <h1 class="text-2xl font-bold">Memorial Descritivo</h1>
    </div>

    <JobStatus :job="job" :polling="polling">
      <template #result="{ result }">
        <div v-if="result.memorial_descritivo">
          <pre class="whitespace-pre-wrap text-sm bg-gray-50 dark:bg-gray-800 p-4 rounded">{{ result.memorial_descritivo }}</pre>
        </div>
        <div v-if="result.area_m2" class="mt-4 flex gap-6 text-sm">
          <div><span class="text-gray-500">Área:</span> {{ result.area_m2 }} m²</div>
          <div><span class="text-gray-500">Perímetro:</span> {{ result.perimetro_m }} m</div>
        </div>
        <details class="mt-4">
          <summary class="cursor-pointer text-sm text-gray-500">Ver JSON completo</summary>
          <pre class="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-auto max-h-96">{{ JSON.stringify(result, null, 2) }}</pre>
        </details>
      </template>
    </JobStatus>
  </div>
</template>
