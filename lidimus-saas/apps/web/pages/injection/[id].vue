<script setup lang="ts">
const route = useRoute()
const jobId = ref(route.params.id as string)
const { job } = useJobPoller(jobId)

const result = computed(() => job.value?.result as Record<string, any> | undefined)

const processando = computed(
  () => !job.value || (job.value.status !== 'done' && job.value.status !== 'error'),
)

// O guilhoché de segurança forra o corpo da página (ver lidimus.css); a folha do
// laudo repousa limpa sobre ele. Entra junto com o laudo: durante a espera não
// há folha, e o papel verde brigaria com a tela de espera (Modernista).
useHead({
  title: 'Laudo de verificação — Lidimus',
  bodyAttrs: { class: computed(() => (processando.value ? '' : 'ld-pagina-certidao')) },
})

// A varredura fecha em segundos (mediana medida: 4s), então a tela de espera
// aqui não anuncia estimativa — só diz o que está sendo feito enquanto passa.
const TITULOS_ESPERA: Record<string, string> = { _: 'Varrendo o documento' }
const MENSAGENS_ESPERA: Record<string, string[]> = {
  _: [
    'Extraindo o texto e as camadas ocultas',
    'Procurando texto invisível e metadados',
    'Avaliando o risco do que foi encontrado',
  ],
}

const protocolo = computed(() => String(jobId.value ?? '').slice(0, 8).toUpperCase())

const arquivo = computed(() => {
  const meta = job.value?.inputMeta as Record<string, any> | undefined
  const nome = meta?.originalName
  return typeof nome === 'string' && nome.trim() ? nome : undefined
})

const emitidoEm = computed(() => {
  const ts = job.value?.completedAt as string | undefined
  return ts
    ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '—'
})

// A Regra do Carimbo: vermelho somente onde há risco real. O carimbo estampa
// o veredito em destaque no bloco de identificação.
const risco = computed(() => {
  const r = String(result.value?.risk_level ?? '').toLowerCase()
  if (r === 'high') return { classe: 'ld-carimbo--alto', texto: 'Risco alto' }
  if (r === 'medium') return { classe: 'ld-carimbo--medio', texto: 'Risco médio' }
  if (r === 'low') return { classe: 'ld-carimbo--baixo', texto: 'Risco baixo' }
  return { classe: 'ld-carimbo--neutro', texto: 'Não classificado' }
})

const temAchados = computed(() => (result.value?.findings?.length ?? 0) > 0)

// Alguns achados citam o trecho oculto entre aspas. Quando esse trecho está em
// tags Unicode (sem glifo), a citação crua renderiza como um par de aspas vazio
// — o achado anuncia a fraude sem mostrá-la. Revelar aqui, na exibição, também
// conserta os laudos já gravados, sem reprocessar job nenhum.
const achados = computed(() =>
  ((result.value?.findings ?? []) as string[]).map((f) => revelarTextoOculto(f)),
)

// Evidências: cada bloco só aparece quando a análise correspondente encontrou
// material para demonstrar — o laudo mostra a fraude, não apenas a anuncia
const evidenciaTexto = computed(() => {
  const a = result.value?.hiddenTextAnalysis as Record<string, any> | undefined
  return a?.hiddenTextFound && a.hiddenItems?.length ? a : null
})

const evidenciaImagem = computed(() => {
  const a = result.value?.imageAnalysis as Record<string, any> | undefined
  if (!a?.imagePreviews?.length) return null
  return a.suspicious || a.imageTexts?.length ? a : null
})

const evidenciaMetadados = computed(() => {
  const a = result.value?.metadataAnalysis as Record<string, any> | undefined
  return a?.isSuspicious || a?.aiAnalysis?.isInjection ? a : null
})

// O alarme sem orientação abandona o usuário no pico da ansiedade — o laudo
// diz o que o achado significa e o que fazer, em linguagem leiga
const veredito = computed(() => {
  if (!temAchados.value) return null
  const r = String(result.value?.risk_level ?? '').toLowerCase()
  if (r === 'high') {
    return (
      'Este arquivo contém instruções ocultas destinadas a manipular análises feitas por ' +
      'inteligência artificial. Recomendamos não confiar em resumos ou análises automáticas ' +
      'deste documento e conferir o conteúdo original antes de aceitá-lo.'
    )
  }
  return (
    'Este arquivo apresenta indícios que merecem verificação. Confira os achados abaixo e o ' +
    'documento original antes de confiar em análises automáticas deste arquivo.'
  )
})

function exportarPdf() {
  window.print()
}
</script>

<template>
  <div>
    <!-- Barra de ações -->
    <div class="acoes print-hidden">
      <NuxtLink to="/dashboard" class="ld-btn ld-btn--ghost">← Painel</NuxtLink>
      <button
        v-if="job?.status === 'done' && result"
        class="ld-btn ld-btn--primary acoes-exportar"
        @click="exportarPdf"
      >
        Exportar PDF
      </button>
    </div>

    <!-- Processando -->
    <EstadoProcessando
      v-if="processando"
      :job="job"
      :titulos="TITULOS_ESPERA"
      :mensagens="MENSAGENS_ESPERA"
      :limite-atraso="60"
    />

    <!-- Erro -->
    <PranchaFalha
      v-else-if="job?.status === 'error'"
      titulo="Não foi possível concluir a verificação"
      :mensagem="String(job.errorMessage ?? 'Ocorreu um erro inesperado durante o processamento.')"
      retry-to="/injection"
      retry-label="enviar o PDF novamente"
    />

    <!-- A prancha: o laudo -->
    <article v-else-if="result" id="documento-laudo" class="prancha">
      <BlocoCarimbo
        analise="Verificação de integridade"
        documento-label="Protocolo"
        :documento="protocolo"
        :arquivo="arquivo"
        :emitido="emitidoEm"
      >
        <span class="ld-carimbo" :class="risco.classe">{{ risco.texto }}</span>
      </BlocoCarimbo>

      <div class="prancha-titulo">
        <h1>Laudo de verificação</h1>
        <p class="prancha-sub">
          Varredura de instruções ocultas: texto invisível, fontes minúsculas, camadas e metadados.
        </p>
      </div>

      <section class="secao" aria-labelledby="sec-achados">
        <h2 id="sec-achados">
          Achados
          <span v-if="temAchados" class="contagem">({{ result.findings.length }})</span>
        </h2>
        <p v-if="veredito" class="veredito">{{ veredito }}</p>
        <ul v-if="temAchados" class="achados">
          <li v-for="(f, i) in achados" :key="i" class="achado">{{ f }}</li>
        </ul>
        <p v-else>
          <span class="ld-selo ld-selo--verde">Nenhum conteúdo oculto identificado</span>
        </p>
      </section>

      <section v-if="evidenciaTexto" class="secao" aria-labelledby="sec-ev-texto">
        <h2 id="sec-ev-texto">Demonstração — texto oculto no corpo do documento</h2>
        <EvidenciaTextoOculto :analysis="evidenciaTexto" />
      </section>

      <section v-if="evidenciaImagem" class="secao" aria-labelledby="sec-ev-imagem">
        <h2 id="sec-ev-imagem">Demonstração — imagem com texto oculto</h2>
        <EvidenciaImagemOculta :analysis="evidenciaImagem" />
      </section>

      <section v-if="evidenciaMetadados" class="secao" aria-labelledby="sec-ev-metadados">
        <h2 id="sec-ev-metadados">Demonstração — texto oculto nos metadados</h2>
        <EvidenciaMetadados :analysis="evidenciaMetadados" />
      </section>

      <footer class="prancha-rodape">
        <p>
          Laudo gerado automaticamente pela Lidimus. É uma ferramenta de apoio e não substitui a
          análise de profissional habilitado.
        </p>
      </footer>
    </article>

    <details v-if="result?.fullText" class="depuracao print-hidden">
      <summary>
        Texto completo do documento<template v-if="temAchados"> (inclui o conteúdo oculto encontrado)</template>
      </summary>
      <pre>{{ result.fullText }}</pre>
    </details>
  </div>
</template>

<style scoped>
.acoes {
  display: flex;
  align-items: center;
  gap: var(--ld-space-md);
  margin-bottom: var(--ld-space-lg);
  flex-wrap: wrap;
}
.acoes-exportar {
  margin-left: auto;
}

/* A tela de espera vive em EstadoProcessando.vue */

/* Prancha — a folha do laudo repousa sobre o papel de segurança da página:
   sombra leve para descolar do guilhoché, folha amarelada, dados em azul anil. */
.prancha {
  background: var(--ld-certidao-papel);
  border: 1px solid var(--ld-certidao-filete);
  border-radius: var(--ld-r-md);
  overflow: hidden;
  box-shadow: var(--ld-shadow-flutuante);
}
.prancha :deep(.carimbo) {
  background: transparent;
}
.prancha-titulo {
  padding: var(--ld-space-xl) var(--ld-space-xl) var(--ld-space-lg);
}
.prancha-titulo h1 {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.2;
}
.prancha-sub {
  margin: var(--ld-space-xs) 0 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
  max-width: 60ch;
}

.secao {
  border-top: 1px solid var(--ld-filete);
  padding: var(--ld-space-lg) var(--ld-space-xl) var(--ld-space-xl);
  background: var(--ld-certidao-conteudo);
}
.secao h2 {
  margin: 0 0 var(--ld-space-md);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}
.contagem {
  color: var(--ld-tinta-suave);
  font-weight: 400;
}

.veredito {
  margin: 0 0 var(--ld-space-md);
  max-width: 72ch;
  font-size: 0.9375rem;
  line-height: 1.6;
  text-wrap: pretty;
}

/* Achados: conteúdo oculto real — o vermelho é o alarme */
.achados {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-sm);
}
.achado {
  border: 1px solid var(--ld-carimbo);
  background: var(--ld-carimbo-selo);
  border-radius: var(--ld-r-sm);
  padding: 12px var(--ld-space-md);
  font-size: 0.9375rem;
  color: var(--ld-tinta);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.prancha-rodape {
  border-top: 1px solid var(--ld-filete);
  padding: var(--ld-space-md) var(--ld-space-xl) var(--ld-space-lg);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.prancha-rodape p {
  margin: 0;
  max-width: 90ch;
}

.depuracao {
  margin-top: var(--ld-space-lg);
}
.depuracao summary {
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.depuracao summary:hover {
  color: var(--ld-tinta);
}
.depuracao pre {
  margin-top: var(--ld-space-sm);
  font-family: var(--ld-font-mono);
  font-size: 0.75rem;
  background: var(--ld-bancada);
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  padding: var(--ld-space-md);
  overflow: auto;
  max-height: 24rem;
  /* Texto extraído tem linhas longas — quebrar em vez de rolar na horizontal */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .prancha-titulo,
  .secao {
    padding-left: var(--ld-space-md);
    padding-right: var(--ld-space-md);
  }
  .prancha-titulo {
    padding-top: var(--ld-space-lg);
  }
}
</style>

<style>
@media print {
  @page {
    size: A4;
    margin: 14mm;
  }
  .print-hidden {
    display: none !important;
  }
  #documento-laudo {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    font-size: 12px;
  }
  #documento-laudo,
  #documento-laudo .secao,
  #documento-laudo .carimbo,
  #documento-laudo .ld-selo,
  #documento-laudo .ld-carimbo,
  #documento-laudo .achado,
  #documento-laudo .quadro-folha,
  #documento-laudo .quadro-moldura,
  #documento-laudo .ficha-linha {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  #documento-laudo .prancha-titulo h1 {
    font-size: 20px;
  }
}
</style>
