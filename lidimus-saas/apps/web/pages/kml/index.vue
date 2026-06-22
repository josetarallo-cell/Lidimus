<script setup lang="ts">
const uploading = ref(false)
const jobId = ref<string | null>(null)
const { job, polling } = useJobPoller(jobId)

async function onSubmit(file: File) {
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('params', JSON.stringify({}))

    const { jobId: id } = await $fetch<{ jobId: string }>('/api/kml', {
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
    <h1 class="text-2xl font-bold mb-6">Memorial Descritivo de Terreno</h1>

    <UploadCard
      title="Enviar arquivo KML"
      description="Envie o arquivo KML do terreno. O memorial descritivo é gerado automaticamente no padrão do cartório."
      accept=".kml,application/vnd.google-earth.kml+xml"
      :uploading="uploading"
      @submit="onSubmit"
    />

    <JobStatus :job="job" :polling="polling">
      <template #result="{ result }">
        <div v-if="result.memorial_descritivo">
          <h3 class="font-semibold mb-2">Memorial Descritivo</h3>
          <pre class="whitespace-pre-wrap text-sm bg-gray-50 dark:bg-gray-800 p-4 rounded">{{ result.memorial_descritivo }}</pre>
        </div>

        <div v-if="result.area_m2" class="mt-4 flex gap-6 text-sm">
          <div><span class="text-gray-500">Área:</span> {{ result.area_m2 }} m²</div>
          <div><span class="text-gray-500">Perímetro:</span> {{ result.perimetro_m }} m</div>
          <div><span class="text-gray-500">Vértices:</span> {{ result.vertices?.length }}</div>
        </div>
      </template>
    </JobStatus>
  </div>
</template>
