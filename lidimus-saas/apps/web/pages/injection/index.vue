<script setup lang="ts">
const uploading = ref(false)
const jobId = ref<string | null>(null)
const { job, polling } = useJobPoller(jobId)

async function onSubmit(file: File) {
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)

    const { jobId: id } = await $fetch<{ jobId: string }>('/api/injection', {
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
    <h1 class="text-2xl font-bold mb-6">Detector de Prompt Injection</h1>

    <UploadCard
      title="Enviar PDF para análise"
      description="Detecta texto oculto, imagens escondidas, metadados suspeitos e tentativas de prompt injection em PDFs."
      accept=".pdf,application/pdf"
      :uploading="uploading"
      @submit="onSubmit"
    />

    <JobStatus :job="job" :polling="polling">
      <template #result="{ result }">
        <div class="space-y-3">
          <div v-if="result.risk_level">
            <UBadge
              :color="result.risk_level === 'high' ? 'red' : result.risk_level === 'medium' ? 'yellow' : 'green'"
              size="lg"
            >
              Risco: {{ result.risk_level }}
            </UBadge>
          </div>

          <div v-if="result.findings?.length">
            <h3 class="font-semibold mb-2">Achados</h3>
            <ul class="text-sm space-y-1">
              <li v-for="(f, i) in result.findings" :key="i" class="text-gray-700">
                • {{ f }}
              </li>
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
