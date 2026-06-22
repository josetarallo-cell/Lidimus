<script setup lang="ts">
defineProps<{
  job: Record<string, unknown> | null
  polling: boolean
}>()
</script>

<template>
  <div v-if="job" class="mt-6">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UBadge
            :color="
              job.status === 'done' ? 'green'
                : job.status === 'error' ? 'red'
                : 'yellow'
            "
          >
            {{ job.status }}
          </UBadge>
          <span class="text-sm text-gray-500">Job {{ job.id }}</span>
          <UIcon v-if="polling" name="i-heroicons-arrow-path" class="animate-spin text-gray-400 ml-auto" />
        </div>
      </template>

      <div v-if="job.status === 'done' && job.result">
        <slot name="result" :result="job.result" />
      </div>

      <div v-else-if="job.status === 'error'" class="text-red-600 text-sm">
        {{ job.errorMessage ?? 'Erro desconhecido.' }}
      </div>

      <div v-else class="text-gray-400 text-sm">
        Processando… aguarde.
      </div>
    </UCard>
  </div>
</template>
