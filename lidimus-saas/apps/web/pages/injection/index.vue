<script setup lang="ts">
useHead({ title: 'Verificar PDF — Lidimus' })

const uploading = ref(false)
const erro = ref('')

async function onSubmit(file: File) {
  uploading.value = true
  erro.value = ''
  try {
    const form = new FormData()
    form.append('file', file)

    const { jobId } = await $fetch<{ jobId: string }>('/api/injection', {
      method: 'POST',
      body: form,
    })
    await navigateTo(`/injection/${jobId}`)
  } catch {
    erro.value = 'Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.'
    uploading.value = false
  }
}
</script>

<template>
  <div>
    <header class="pagina-cabecalho">
      <h1>Verificar integridade de PDF</h1>
      <p>
        O Lidimus varre o arquivo em busca de instruções ocultas — texto invisível, fontes
        minúsculas, metadados suspeitos — e sinaliza o risco.
      </p>
    </header>

    <UploadCard
      title="Enviar PDF para verificação"
      description="Qualquer PDF, não só matrículas. O laudo aponta o conteúdo oculto encontrado e o nível de risco."
      accept=".pdf,application/pdf"
      :uploading="uploading"
      @submit="onSubmit"
    />

    <p v-if="erro" class="ld-erro pagina-erro" role="alert">{{ erro }}</p>
  </div>
</template>

<style scoped>
.pagina-cabecalho {
  margin-bottom: var(--ld-space-lg);
}
.pagina-cabecalho h1 {
  margin: 0 0 var(--ld-space-xs);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.75rem;
  line-height: 1.2;
}
.pagina-cabecalho p {
  margin: 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
  max-width: 60ch;
}
.pagina-erro {
  margin-top: var(--ld-space-md);
}
</style>
