<script setup lang="ts">
const uploading = ref(false)
const jobId = ref<string | null>(null)
const { job, polling } = useJobPoller(jobId)

async function onSubmit(file: File) {
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('params', JSON.stringify({ incluirMemorial: true, incluirCroqui: false }))

    const { jobId: id } = await $fetch<{ jobId: string }>('/api/matriculas', {
      method: 'POST',
      body: form,
    })
    jobId.value = id
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">Analisar Matrícula</h1>

    <UploadCard
      title="Enviar PDF de Matrícula"
      description="Envie a certidão de matrícula em PDF. O OCR e a análise jurídica são gerados automaticamente."
      accept=".pdf,application/pdf"
      :uploading="uploading"
      @submit="onSubmit"
    />

    <JobStatus :job="job" :polling="polling">
      <template #result="{ result }">
        <!-- Resumo executivo -->
        <div v-if="result.resumo_executivo" class="mb-4">
          <h3 class="font-semibold mb-2">Resumo Executivo</h3>
          <UBadge :color="result.resumo_executivo.classificacao_risco === 'alto' ? 'red' : result.resumo_executivo.classificacao_risco === 'medio' ? 'yellow' : 'green'">
            Risco {{ result.resumo_executivo.classificacao_risco }}
          </UBadge>
          <p class="mt-2 text-sm text-gray-700">{{ result.resumo_executivo.conclusao }}</p>
          <p class="text-sm text-gray-500 mt-1">{{ result.resumo_executivo.recomendacao }}</p>
        </div>

        <!-- Ônus ativos -->
        <div v-if="result.estado_atual?.onus_ativos?.length" class="mb-4">
          <h3 class="font-semibold mb-2">Ônus Ativos</h3>
          <ul class="list-disc list-inside text-sm text-red-600">
            <li v-for="(onus, i) in result.estado_atual.onus_ativos" :key="i">{{ onus }}</li>
          </ul>
        </div>

        <!-- JSON completo expansível -->
        <details class="mt-4">
          <summary class="cursor-pointer text-sm text-gray-500">Ver JSON completo</summary>
          <pre class="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-auto max-h-96">{{ JSON.stringify(result, null, 2) }}</pre>
        </details>
      </template>
    </JobStatus>
  </div>
</template>
