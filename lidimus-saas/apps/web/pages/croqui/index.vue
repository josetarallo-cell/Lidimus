<script setup lang="ts">
import type { ErroUpload } from '~/composables/useUploadErro'

useHead({ title: 'Croqui do terreno — Lidimus' })

const uploading = ref(false)
const erro = ref<ErroUpload | null>(null)
const gerandoDe = ref<string | null>(null)

// Matrículas já lidas: gerar o croqui delas reaproveita o texto extraído,
// sem OCR novo — o caminho mais barato
const { data: jobData } = await useFetch('/api/jobs', { query: { limit: 50 } })

type JobItem = {
  id: string
  type: string
  status: string
  inputMeta?: Record<string, any> | null
  createdAt: string
}

const matriculasProntas = computed(() =>
  ((jobData.value?.items ?? []) as JobItem[]).filter(
    (j) => j.type === 'matricula' && j.status === 'done',
  ),
)

async function gerarDeMatricula(matriculaJobId: string) {
  gerandoDe.value = matriculaJobId
  erro.value = null
  try {
    const { jobId } = await $fetch<{ jobId: string }>('/api/croqui', {
      method: 'POST',
      body: { matriculaJobId },
    })
    await navigateTo(`/croqui/${jobId}`)
  } catch (err) {
    erro.value = mensagemDeErroDeUpload(err)
    gerandoDe.value = null
  }
}

async function onSubmit(file: File) {
  uploading.value = true
  erro.value = null
  try {
    const form = new FormData()
    form.append('file', file)

    const { jobId } = await $fetch<{ jobId: string }>('/api/croqui', {
      method: 'POST',
      body: form,
    })
    await navigateTo(`/croqui/${jobId}`)
  } catch (err) {
    erro.value = mensagemDeErroDeUpload(err)
    uploading.value = false
  }
}

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
</script>

<template>
  <div>
    <header class="pagina-cabecalho">
      <h1>Croqui do terreno</h1>
      <p>
        Desenho do lote a partir da descrição do perímetro na matrícula — medidas, confrontantes
        e área, prontos para conferência visual.
      </p>
    </header>

    <!-- Reaproveitar leitura já feita: sem OCR novo, custo mínimo -->
    <section v-if="matriculasProntas.length" class="ld-painel reaproveitar">
      <header class="reaproveitar-cabecalho">
        <h2>Usar uma matrícula já analisada</h2>
        <p>
          A leitura do documento já foi feita pelo Leitor de Matrículas — gerar o croqui a partir
          dela custa só 15 créditos, sem processar o PDF de novo.
        </p>
      </header>
      <ul class="reaproveitar-lista">
        <li v-for="m in matriculasProntas" :key="m.id" class="reaproveitar-item">
          <div class="reaproveitar-info">
            <span class="reaproveitar-nome">{{ m.inputMeta?.originalName ?? 'matricula.pdf' }}</span>
            <span class="reaproveitar-data">analisada em {{ dataFmt(m.createdAt) }}</span>
          </div>
          <button
            type="button"
            class="ld-btn ld-btn--secondary ld-btn--sm"
            :disabled="gerandoDe !== null"
            @click="gerarDeMatricula(m.id)"
          >
            <span v-if="gerandoDe === m.id" class="ld-spinner" aria-hidden="true" />
            {{ gerandoDe === m.id ? 'Gerando…' : 'Gerar croqui' }}
          </button>
        </li>
      </ul>
    </section>

    <UploadCard
      title="Enviar matrícula em PDF"
      description="Para matrículas que ainda não passaram pelo Leitor: enviamos o PDF para leitura e desenhamos o croqui a partir da descrição do perímetro."
      accept=".pdf,application/pdf"
      :uploading="uploading"
      :custo-base="12"
      :custo-por-pagina="3"
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

.reaproveitar {
  margin-bottom: var(--ld-space-lg);
}
.reaproveitar-cabecalho {
  padding: var(--ld-space-lg) var(--ld-space-lg) var(--ld-space-md);
}
.reaproveitar-cabecalho h2 {
  margin: 0 0 var(--ld-space-xs);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}
.reaproveitar-cabecalho p {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
  max-width: 60ch;
}
.reaproveitar-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 19rem;
  overflow-y: auto;
}
.reaproveitar-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  padding: 12px var(--ld-space-lg);
  border-top: 1px solid var(--ld-filete);
}
.reaproveitar-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.reaproveitar-nome {
  font-size: 0.9375rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.reaproveitar-data {
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.reaproveitar-item .ld-btn {
  flex: none;
}

.pagina-erro {
  margin-top: var(--ld-space-md);
}
.pagina-erro-link {
  color: var(--ld-carimbo-tinta);
  font-weight: 600;
}
</style>
