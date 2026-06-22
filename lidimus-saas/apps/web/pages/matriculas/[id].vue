<script setup lang="ts">
const route = useRoute()
const jobId = ref(route.params.id as string)
const { job, polling } = useJobPoller(jobId)
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <UButton to="/dashboard" variant="ghost" icon="i-heroicons-arrow-left" size="xs">Voltar</UButton>
      <h1 class="text-2xl font-bold">Matrícula</h1>
    </div>

    <JobStatus :job="job" :polling="polling">
      <template #result="{ result }">
        <div v-if="result.documento" class="mb-4">
          <h3 class="font-semibold">Documento</h3>
          <p class="text-sm text-gray-600">Matrícula: {{ result.documento.numero_matricula }}</p>
          <p class="text-sm text-gray-600">Cartório: {{ result.documento.cartorio }}</p>
          <p class="text-sm text-gray-600">Endereço: {{ result.documento.endereco }}</p>
        </div>

        <div v-if="result.resumo_executivo" class="mb-4">
          <h3 class="font-semibold mb-2">Resumo Executivo</h3>
          <UBadge
            :color="
              result.resumo_executivo.classificacao_risco === 'alto' ? 'red'
              : result.resumo_executivo.classificacao_risco === 'medio' ? 'yellow'
              : 'green'
            "
          >
            Risco {{ result.resumo_executivo.classificacao_risco }}
          </UBadge>
          <p class="mt-2 text-sm text-gray-700">{{ result.resumo_executivo.conclusao }}</p>
        </div>

        <div v-if="result.riscos?.length" class="mb-4">
          <h3 class="font-semibold mb-2">Riscos</h3>
          <div v-for="(r, i) in result.riscos" :key="i" class="border-l-4 pl-3 mb-2"
            :class="r.severidade === 'alta' ? 'border-red-500' : r.severidade === 'media' ? 'border-yellow-500' : 'border-green-500'">
            <p class="text-sm font-medium">{{ r.tipo }}</p>
            <p class="text-xs text-gray-500">{{ r.evidencia }}</p>
          </div>
        </div>

        <details class="mt-4">
          <summary class="cursor-pointer text-sm text-gray-500">Ver JSON completo</summary>
          <pre class="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-auto max-h-96">{{ JSON.stringify(result, null, 2) }}</pre>
        </details>
      </template>
    </JobStatus>
  </div>
</template>
