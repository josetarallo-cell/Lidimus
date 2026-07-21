<script setup lang="ts">
import type { ErroUpload } from '~/composables/useUploadErro'

useHead({ title: 'Memorial descritivo — Lidimus' })

const uploading = ref(false)
const erro = ref<ErroUpload | null>(null)
const rua = ref('')

async function onSubmit(file: File) {
  uploading.value = true
  erro.value = null
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('params', JSON.stringify({ rua: rua.value.trim() }))

    const { jobId } = await $fetch<{ jobId: string }>('/api/kml', {
      method: 'POST',
      body: form,
    })
    await navigateTo(`/kml/${jobId}`)
  } catch (err) {
    erro.value = mensagemDeErroDeUpload(err)
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
      :custo-creditos="50"
      @submit="onSubmit"
    >
      <template #campos>
        <div class="ld-campo">
          <label for="rua-frente">Inclua a Rua/Av para a qual o imóvel faz frente</label>
          <input
            id="rua-frente"
            v-model="rua"
            type="text"
            class="ld-input"
            placeholder="Ex.: Rua Luiz Gama"
            maxlength="120"
            :disabled="uploading"
          />
          <p class="campo-ajuda">
            Opcional — o memorial abre situando o imóvel neste logradouro. Sem preencher, o texto
            sai sem a rua.
          </p>
        </div>
      </template>
    </UploadCard>

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
.campo-ajuda {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.pagina-erro {
  margin-top: var(--ld-space-md);
}
.pagina-erro-link {
  color: var(--ld-carimbo-tinta);
  font-weight: 600;
}
</style>
