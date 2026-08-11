<script setup lang="ts">
import type { ErroUpload } from '~/composables/useUploadErro'

useHead({ title: 'Analisar matrícula — Lidimus' })

const { data: acesso } = await useAcesso()
const liberado = computed(() => acesso.value?.podeMatricula !== false)
const semPlano = computed(() => !acesso.value?.ferramentas?.includes('matricula'))
const viaAvulso = computed(() => semPlano.value && (acesso.value?.avulsosMatricula ?? 0) > 0)
// A ordem é a mesma do servidor (plano → avulso → cortesia): a tela precisa
// anunciar a via que vai ser de fato usada, senão promete grátis o que vai sair
// de uma avulsa comprada.
const viaCortesia = computed(
  () =>
    semPlano.value &&
    (acesso.value?.avulsosMatricula ?? 0) === 0 &&
    (acesso.value?.cortesiasMatricula ?? 0) > 0,
)

const MAX_ARQUIVOS = 10
const PARAMS = { incluirMemorial: true, incluirCroqui: false }

const uploading = ref(false)
const progresso = ref<number | null>(null)
const erro = ref<ErroUpload | null>(null)

async function onSubmit(file: File) {
  uploading.value = true
  erro.value = null
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('params', JSON.stringify(PARAMS))

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

async function onSubmitLote(arquivos: File[]) {
  // Um arquivo só não é lote: mandar pela rota unitária mantém o destino de
  // sempre (a tela de espera daquele relatório) em vez de uma página de lote de um.
  if (arquivos.length === 1) return onSubmit(arquivos[0])

  uploading.value = true
  progresso.value = 0
  erro.value = null

  const form = new FormData()
  for (const f of arquivos) form.append('file', f)
  form.append('params', JSON.stringify(PARAMS))

  try {
    const { loteId } = await enviarComProgresso(form)
    await navigateTo(`/matriculas/lote/${loteId}`)
  } catch (err) {
    erro.value = mensagemDeErroDeUpload(err)
    uploading.value = false
    progresso.value = null
  }
}

type RespostaLote = { loteId: string; custoTotal: number }

// XMLHttpRequest e não $fetch: só ele expõe `upload.onprogress`, e dez PDFs
// subindo sem barra parecem uma tela travada. O erro é remontado no formato que
// mensagemDeErroDeUpload já entende ({ statusCode, data.statusMessage }).
function enviarComProgresso(form: FormData): Promise<RespostaLote> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/matriculas/lote')
    xhr.responseType = 'json'

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progresso.value = Math.round((e.loaded / e.total) * 100)
    }

    xhr.onload = () => {
      const corpo = xhr.response as Record<string, unknown> | null
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(corpo as unknown as RespostaLote)
        return
      }
      reject({
        statusCode: xhr.status,
        data: { statusMessage: (corpo?.statusMessage as string) ?? (corpo?.message as string) },
      })
    }

    xhr.onerror = () => reject({ statusCode: 0 })
    xhr.send(form)
  })
}
</script>

<template>
  <div>
    <header class="pagina-cabecalho">
      <h1>Analisar matrícula</h1>
      <p v-if="viaCortesia">
        Envie a certidão de matrícula em PDF e receba o relatório técnico estruturado: cadeia
        dominial, ônus, gravames e alertas de risco.
      </p>
      <p v-else>
        Envie a certidão de matrícula em PDF — uma ou até {{ MAX_ARQUIVOS }} de uma vez — e receba o
        relatório técnico estruturado de cada uma: cadeia dominial, ônus, gravames e alertas de
        risco.
      </p>
    </header>

    <section v-if="!liberado" class="ld-painel bloqueio">
      <p class="bloqueio-rotulo">Não incluída no seu plano</p>
      <h2 class="bloqueio-titulo">A análise de matrícula começa no Essencial</h2>
      <p class="bloqueio-texto">
        O plano Croqui cobre croqui, memorial descritivo e Detector. Para o relatório técnico —
        cadeia dominial, ônus, gravames e alertas de risco — assine o Essencial, com 5 matrículas
        por mês, ou compre uma análise avulsa quando precisar de uma só.
      </p>
      <div class="bloqueio-acoes">
        <NuxtLink to="/conta/assinatura" class="ld-btn ld-btn--primary">Ver o Essencial</NuxtLink>
        <NuxtLink to="/conta/creditos" class="ld-btn ld-btn--secondary">Comprar análise avulsa</NuxtLink>
      </div>
    </section>

    <template v-else>
      <p v-if="viaCortesia" class="avulso-aviso" role="status">
        Sua primeira análise de matrícula é por nossa conta — ela não consome créditos, e o que
        você tem hoje continua inteiro para croqui, memorial e Detector. Vale para um documento;
        análise que falha não gasta a cortesia.
      </p>

      <p v-else-if="viaAvulso" class="avulso-aviso" role="status">
        Você tem {{ acesso?.avulsosMatricula }}
        {{ acesso?.avulsosMatricula === 1 ? 'análise avulsa' : 'análises avulsas' }} — esta leitura
        consome uma delas. Análise que falha não é descontada.
      </p>

      <UploadCard
        title="Enviar certidões de matrícula"
        :description="
          viaCortesia
            ? 'O PDF da certidão, digitalizada ou nato-digital. A leitura e a análise jurídica acontecem automaticamente.'
            : 'PDFs das certidões, digitalizadas ou nato-digitais. Podem ser várias de uma vez — a leitura e a análise jurídica de cada uma acontecem automaticamente.'
        "
        accept=".pdf,application/pdf"
        :uploading="uploading"
        :progresso="progresso"
        :custo-por-pagina="8"
        :custo-base="83"
        :isento="viaCortesia"
        :multiple="!viaCortesia"
        :max-arquivos="MAX_ARQUIVOS"
        @submit="onSubmit"
        @submit-lote="onSubmitLote"
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
