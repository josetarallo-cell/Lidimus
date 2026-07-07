<script setup lang="ts">
useHead({ title: 'Memorial descritivo — Lidimus' })

const uploading = ref(false)
const erro = ref('')

async function onSubmit(file: File) {
  uploading.value = true
  erro.value = ''
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('params', JSON.stringify({}))

    const { jobId } = await $fetch<{ jobId: string }>('/api/kml', {
      method: 'POST',
      body: form,
    })
    await navigateTo(`/kml/${jobId}`)
  } catch {
    erro.value = 'Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.'
    uploading.value = false
  }
}
</script>

<template>
  <div>
    <header class="pagina-cabecalho">
      <h1>Memorial descritivo de terreno</h1>
      <p>
        Envie o KML com a poligonal do terreno e receba o memorial técnico-jurídico pronto para
        o registro de imóveis — vértices, azimutes, distâncias e confrontações.
      </p>
    </header>

    <UploadCard
      title="Enviar arquivo KML"
      description="Arquivo KML do Google Earth com o desenho do terreno. O memorial é redigido automaticamente no padrão do cartório."
      accept=".kml,application/vnd.google-earth.kml+xml"
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
