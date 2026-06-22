<script setup lang="ts">
const props = defineProps<{
  title: string
  description: string
  accept: string
  uploading: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', file: File): void
}>()

const file = ref<File | null>(null)
const dragOver = ref(false)

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  file.value = e.dataTransfer?.files?.[0] ?? null
}

function submit() {
  if (file.value) emit('submit', file.value)
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-xl font-semibold">{{ title }}</h2>
      <p class="text-sm text-gray-500 mt-1">{{ description }}</p>
    </template>

    <div
      class="border-2 border-dashed rounded-lg p-8 text-center transition-colors"
      :class="dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-300'"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <p v-if="!file" class="text-gray-400">
        Arraste o arquivo aqui ou
        <label class="text-primary-500 cursor-pointer underline">
          clique para selecionar
          <input type="file" :accept="accept" class="hidden" @change="onFile" />
        </label>
      </p>
      <p v-else class="text-gray-700 font-medium">{{ file.name }}</p>
    </div>

    <template #footer>
      <UButton
        :loading="uploading"
        :disabled="!file || uploading"
        @click="submit"
        block
      >
        Enviar
      </UButton>
    </template>
  </UCard>
</template>
