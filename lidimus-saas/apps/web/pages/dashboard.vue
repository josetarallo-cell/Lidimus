<script setup lang="ts">
const { data: jobList, refresh } = await useFetch('/api/jobs')

const typeLabel: Record<string, string> = {
  matricula: 'Matrícula',
  kml: 'Memorial KML',
  injection: 'Detector',
}

onMounted(() => {
  const timer = setInterval(refresh, 10_000)
  onUnmounted(() => clearInterval(timer))
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Dashboard</h1>
      <div class="flex gap-3">
        <UButton to="/matriculas" variant="outline">Nova Matrícula</UButton>
        <UButton to="/kml" variant="outline">Novo KML</UButton>
        <UButton to="/injection" variant="outline">Novo PDF</UButton>
      </div>
    </div>

    <UCard>
      <template #header>
        <h2 class="font-semibold">Análises Recentes</h2>
      </template>

      <div v-if="!jobList?.length" class="text-gray-400 text-sm py-4 text-center">
        Nenhuma análise ainda. Envie um arquivo para começar.
      </div>

      <UTable
        v-else
        :rows="jobList"
        :columns="[
          { key: 'type', label: 'Tipo' },
          { key: 'status', label: 'Status' },
          { key: 'createdAt', label: 'Criado em' },
          { key: 'actions', label: '' },
        ]"
      >
        <template #type-data="{ row }">
          {{ typeLabel[row.type] ?? row.type }}
        </template>
        <template #status-data="{ row }">
          <UBadge
            :color="
              row.status === 'done' ? 'green'
                : row.status === 'error' ? 'red'
                : 'yellow'
            "
          >
            {{ row.status }}
          </UBadge>
        </template>
        <template #createdAt-data="{ row }">
          {{ new Date(row.createdAt).toLocaleString('pt-BR') }}
        </template>
        <template #actions-data="{ row }">
          <UButton
            v-if="row.type === 'matricula'"
            :to="`/matriculas/${row.id}`"
            size="xs"
            variant="ghost"
          >
            Ver
          </UButton>
          <UButton
            v-else-if="row.type === 'kml'"
            :to="`/kml/${row.id}`"
            size="xs"
            variant="ghost"
          >
            Ver
          </UButton>
          <UButton
            v-else-if="row.type === 'injection'"
            :to="`/injection/${row.id}`"
            size="xs"
            variant="ghost"
          >
            Ver
          </UButton>
        </template>
      </UTable>
    </UCard>
  </div>
</template>
