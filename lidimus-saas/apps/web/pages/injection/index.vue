<script setup lang="ts">
import type { ErroUpload } from '~/composables/useUploadErro'

useHead({ title: 'Verificar PDF — Lidimus' })

const uploading = ref(false)
const erro = ref<ErroUpload | null>(null)

const amostras = [
  {
    nome: 'Texto oculto',
    desc: 'Instrução para IA escondida no corpo do texto (fonte reduzida).',
    href: '/amostras/documento-texto-oculto.pdf',
  },
  {
    nome: 'Imagem oculta',
    desc: 'Instrução para IA escondida dentro de uma imagem incorporada no PDF.',
    href: '/amostras/documento-imagem-oculta.pdf',
  },
  {
    nome: 'Metadados ocultos',
    desc: 'Instrução para IA escondida em campos de metadados do arquivo.',
    href: '/amostras/documento-metadados-ocultos.pdf',
  },
]

async function onSubmit(file: File) {
  uploading.value = true
  erro.value = null
  try {
    const form = new FormData()
    form.append('file', file)

    const { jobId } = await $fetch<{ jobId: string }>('/api/injection', {
      method: 'POST',
      body: form,
    })
    await navigateTo(`/injection/${jobId}`)
  } catch (err) {
    erro.value = mensagemDeErroDeUpload(err)
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
      :custo-creditos="5"
      @submit="onSubmit"
    />

    <p v-if="erro" class="ld-erro pagina-erro" role="alert">
      {{ erro.texto }}
      <NuxtLink v-if="erro.linkTo" :to="erro.linkTo" class="pagina-erro-link">{{ erro.linkLabel }}</NuxtLink>
    </p>

    <section class="ld-painel amostras">
      <header class="amostras-cabecalho">
        <h2>Documentos de exemplo</h2>
        <p>
          Três PDFs de teste que usamos aqui internamente — cada um esconde uma fraude diferente.
          Abra e veja que a olho nu não dá pra perceber nada; depois envie o mesmo arquivo acima e
          veja o Lidimus apontar o conteúdo oculto.
        </p>
      </header>
      <ul class="amostras-lista">
        <li v-for="a in amostras" :key="a.href" class="amostra">
          <div class="amostra-info">
            <span class="amostra-nome">{{ a.nome }}</span>
            <span class="amostra-desc">{{ a.desc }}</span>
          </div>
          <a :href="a.href" download class="ld-btn ld-btn--ghost ld-btn--sm">Baixar</a>
        </li>
      </ul>
    </section>
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

.amostras {
  margin-top: var(--ld-space-lg);
}
.amostras-cabecalho {
  padding: var(--ld-space-lg) var(--ld-space-lg) 0;
}
.amostras-cabecalho h2 {
  margin: 0 0 var(--ld-space-xs);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}
.amostras-cabecalho p {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
  max-width: 68ch;
}

.amostras-lista {
  list-style: none;
  margin: var(--ld-space-lg);
  margin-top: var(--ld-space-md);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-sm);
}
.amostra {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: var(--ld-papel);
  padding: 12px var(--ld-space-md);
}
.amostra-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.amostra-nome {
  font-weight: 600;
  font-size: 0.9375rem;
}
.amostra-desc {
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
  overflow-wrap: anywhere;
}
</style>
