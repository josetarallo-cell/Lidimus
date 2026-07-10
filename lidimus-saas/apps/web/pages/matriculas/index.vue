<script setup lang="ts">
import type { ErroUpload } from '~/composables/useUploadErro'

useHead({ title: 'Analisar matrícula — Lidimus' })

const uploading = ref(false)
const erro = ref<ErroUpload | null>(null)

async function onSubmit(file: File) {
  uploading.value = true
  erro.value = null
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('params', JSON.stringify({ incluirMemorial: true, incluirCroqui: false }))

    const { jobId } = await $fetch<{ jobId: string }>('/api/matriculas', {
      method: 'POST',
      body: form,
    })
    await navigateTo(`/matriculas/${jobId}`)
  } catch (err) {
    erro.value = mensagemDeErroDeUpload(err)
    uploading.value = false
  }
}
</script>

<template>
  <div>
    <header class="pagina-cabecalho">
      <h1>Analisar matrícula</h1>
      <p>
        Envie a certidão de matrícula em PDF e receba o parecer estruturado: cadeia dominial,
        ônus, gravames e alertas de risco.
      </p>
    </header>

    <UploadCard
      title="Enviar certidão de matrícula"
      description="PDF da certidão, digitalizada ou nato-digital. A leitura e a análise jurídica acontecem automaticamente."
      accept=".pdf,application/pdf"
      :uploading="uploading"
      :custo-creditos="20"
      @submit="onSubmit"
    />

    <p v-if="erro" class="ld-erro pagina-erro" role="alert">
      {{ erro.texto }}
      <NuxtLink v-if="erro.linkTo" :to="erro.linkTo" class="pagina-erro-link">{{ erro.linkLabel }}</NuxtLink>
    </p>
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
.pagina-erro-link {
  color: var(--ld-carimbo-tinta);
  font-weight: 600;
}
</style>
