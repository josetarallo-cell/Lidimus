<script setup lang="ts">
import type { ErroUpload } from '~/composables/useUploadErro'

useHead({ title: 'Analisar matrícula — Lidimus' })

const { data: acesso } = await useAcesso()
const liberado = computed(() => acesso.value?.podeMatricula !== false)
const viaAvulso = computed(
  () => !acesso.value?.ferramentas?.includes('matricula') && (acesso.value?.avulsosMatricula ?? 0) > 0,
)

const uploading = ref(false)
const erro = ref<ErroUpload | null>(null)

async function onSubmit(file: File) {
  uploading.value = true
  erro.value = null
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('params', JSON.stringify({ incluirMemorial: true, incluirCroqui: false }))

    const { jobId } = await $fetch<{ jobId: string; custo: number; paginas: number }>(
      '/api/matriculas',
      { method: 'POST', body: form },
    )
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

    <section v-if="!liberado" class="ld-painel bloqueio">
      <p class="bloqueio-rotulo">Não incluída no seu plano</p>
      <h2 class="bloqueio-titulo">A análise de matrícula começa no Essencial</h2>
      <p class="bloqueio-texto">
        O plano Croqui cobre croqui, memorial descritivo e Detector. Para o parecer jurídico —
        cadeia dominial, ônus, gravames e alertas de risco — assine o Essencial, com 5 matrículas
        por mês, ou compre uma análise avulsa quando precisar de uma só.
      </p>
      <div class="bloqueio-acoes">
        <NuxtLink to="/conta/assinatura" class="ld-btn ld-btn--primary">Ver o Essencial</NuxtLink>
        <NuxtLink to="/conta/creditos" class="ld-btn ld-btn--secondary">Comprar análise avulsa</NuxtLink>
      </div>
    </section>

    <template v-else>
      <p v-if="viaAvulso" class="avulso-aviso" role="status">
        Você tem {{ acesso?.avulsosMatricula }}
        {{ acesso?.avulsosMatricula === 1 ? 'análise avulsa' : 'análises avulsas' }} — esta leitura
        consome uma delas. Análise que falha não é descontada.
      </p>

      <UploadCard
        title="Enviar certidão de matrícula"
        description="PDF da certidão, digitalizada ou nato-digital. A leitura e a análise jurídica acontecem automaticamente."
        accept=".pdf,application/pdf"
        :uploading="uploading"
        :custo-por-pagina="8"
        :custo-base="83"
        @submit="onSubmit"
      />

      <p v-if="erro" class="ld-erro pagina-erro" role="alert">
        {{ erro.texto }}
        <NuxtLink v-if="erro.linkTo" :to="erro.linkTo" class="pagina-erro-link">{{ erro.linkLabel }}</NuxtLink>
      </p>
    </template>
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
.bloqueio {
  padding: var(--ld-space-lg);
  max-width: 62ch;
}
.bloqueio-rotulo {
  margin: 0 0 var(--ld-space-xs);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.bloqueio-titulo {
  margin: 0 0 var(--ld-space-sm);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.25rem;
  line-height: 1.25;
}
.bloqueio-texto {
  margin: 0 0 var(--ld-space-lg);
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--ld-tinta-suave);
  text-wrap: pretty;
}
.bloqueio-acoes {
  display: flex;
  gap: var(--ld-space-sm);
  flex-wrap: wrap;
}

/* Mesmo tratamento dos avisos positivos do resto do painel (ver .retorno--ok
   em conta/assinatura.vue): filete e fundo do selo verde, sem faixa lateral. */
.avulso-aviso {
  margin: 0 0 var(--ld-space-md);
  border: 1px solid var(--ld-verde);
  border-radius: var(--ld-r-sm);
  background: var(--ld-verde-selo);
  padding: 10px 14px;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--ld-verde-profundo);
  max-width: 62ch;
}

.pagina-erro {
  margin-top: var(--ld-space-md);
}
.pagina-erro-link {
  color: var(--ld-carimbo-tinta);
  font-weight: 600;
}
</style>
