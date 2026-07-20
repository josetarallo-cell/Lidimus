<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify'
import { gerarCroqui, fmtNum } from '@lidimus/croqui'

const route = useRoute()
const jobId = ref(route.params.id as string)
const { job } = useJobPoller(jobId)

useHead({
  title: 'Croqui do terreno — Lidimus',
  bodyAttrs: { class: 'ld-pagina-certidao' },
})

// Upload avulso passa pela leitura (ocr) antes do desenho; croqui gerado de uma
// matrícula já analisada pula direto para o desenho
const veioDeMatricula = computed(() => {
  const meta = job.value?.inputMeta as Record<string, any> | undefined
  return !!meta?.origem
})

const STAGES = computed(() =>
  veioDeMatricula.value
    ? [{ key: 'croqui', label: 'Desenho do croqui' }]
    : [
        { key: 'ocr', label: 'Leitura do documento' },
        { key: 'croqui', label: 'Desenho do croqui' },
      ],
)

const stageIndex = computed(() => {
  const s = job.value?.stage as string | undefined
  const idx = STAGES.value.findIndex((x) => x.key === s)
  return idx === -1 ? 0 : idx
})

function stageState(idx: number): 'done' | 'active' | 'pending' {
  if (!job.value) return 'pending'
  if (job.value.status === 'done') return 'done'
  if (idx < stageIndex.value) return 'done'
  if (idx === stageIndex.value) return 'active'
  return 'pending'
}

const processando = computed(
  () => !job.value || (job.value.status !== 'done' && job.value.status !== 'error'),
)

// ─── O croqui: extração (LLM, no n8n) + desenho (determinístico, aqui) ────────
const resultado = computed(() => {
  if (job.value?.status !== 'done') return null
  return gerarCroqui(job.value.result)
})

// O desenho é gerado por código próprio, mas os rótulos (confrontantes, rua)
// vêm do texto extraído pelo LLM — sanitizar antes de injetar
const svgSanitizado = computed(() => {
  const svg = resultado.value?.svg
  return svg
    ? DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
    : ''
})

const extracao = computed(() => (job.value?.result ?? {}) as Record<string, any>)

const FORMATO_LABEL: Record<string, string> = {
  retangular: 'Retangular (testada × profundidade)',
  retangular_4lados: 'Quatro lados medidos',
  deflexao: 'Levantamento por deflexões',
  azimute: 'Levantamento por azimutes',
  rumo: 'Levantamento por rumos',
  utm: 'Coordenadas UTM',
  confrontantes: 'Confrontantes com medidas',
  irregular: 'Polígono irregular',
  nao_identificado: 'Não identificado',
}

const PRECISAO_LABEL: Record<string, string> = {
  exata: 'Exata',
  aproximada: 'Aproximada',
  esquematica: 'Esquemática',
}

const avisos = computed(() => {
  const lista = [...(resultado.value?.avisos ?? [])]
  const obs = String(extracao.value.observacoes ?? '').trim()
  if (obs) lista.push(obs)
  return lista
})

const protocolo = computed(() => String(jobId.value ?? '').slice(0, 8).toUpperCase())

const emitidoEm = computed(() => {
  const ts = job.value?.completedAt as string | undefined
  return ts
    ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '—'
})

const arquivoOriginal = computed(() => {
  const meta = job.value?.inputMeta as Record<string, any> | undefined
  return meta?.originalName ?? 'matricula.pdf'
})

const mensagemFalha = computed(() => {
  const msg = job.value?.errorMessage as string | undefined
  if (!msg) return 'Ocorreu um erro inesperado durante o processamento.'
  const m = msg.match(/^\[(\w+)\]\s*(.*)$/)
  if (!m) return msg
  const etapa = STAGES.value.find((s) => s.key === m[1])?.label
  return etapa ? `${etapa}: ${m[2]}` : m[2]
})

function baixarSvg() {
  const svg = resultado.value?.svg
  if (!svg) return
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `croqui-${protocolo.value.toLowerCase()}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

function exportarPdf() {
  window.print()
}
</script>

<template>
  <div>
    <!-- Barra de ações -->
    <div class="acoes print-hidden">
      <NuxtLink to="/dashboard" class="ld-btn ld-btn--ghost">← Painel</NuxtLink>
      <template v-if="job?.status === 'done' && resultado?.ok">
        <button class="ld-btn ld-btn--secondary acoes-baixar" @click="baixarSvg">Baixar SVG</button>
        <button class="ld-btn ld-btn--primary" @click="exportarPdf">Exportar PDF</button>
      </template>
    </div>

    <!-- Processando -->
    <div v-if="processando" class="print-hidden" aria-live="polite">
      <div v-if="job" class="etapas" role="list" aria-label="Etapas do croqui">
        <template v-for="(s, i) in STAGES" :key="s.key">
          <div class="etapa" role="listitem" :class="`etapa--${stageState(i)}`">
            <span class="etapa-marco" aria-hidden="true">
              <svg v-if="stageState(i) === 'done'" width="12" height="12" viewBox="0 0 12 12">
                <path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" stroke-width="2" />
              </svg>
              <span v-else>{{ i + 1 }}</span>
            </span>
            <span class="etapa-label">
              {{ s.label }}
              <span v-if="stageState(i) === 'active'" class="sr-only">(em andamento)</span>
            </span>
          </div>
          <span v-if="i < STAGES.length - 1" class="etapa-regua" aria-hidden="true" />
        </template>
      </div>
      <p class="nota-processando">
        Interpretando a descrição do perímetro e desenhando o lote — esta página atualiza sozinha,
        não é preciso recarregar.
      </p>
      <PranchaEsqueleto />
    </div>

    <!-- Erro de processamento -->
    <PranchaFalha
      v-else-if="job?.status === 'error'"
      titulo="Não foi possível gerar o croqui"
      :mensagem="mensagemFalha"
      retry-to="/croqui"
      retry-label="tentar novamente"
    />

    <!-- Croqui pronto -->
    <article v-else-if="resultado" id="documento-croqui" class="prancha">
      <BlocoCarimbo
        analise="Croqui do terreno"
        documento-label="Protocolo"
        :documento="protocolo"
        :emitido="emitidoEm"
      >
        <span v-if="resultado.ok" class="ld-selo ld-selo--verde">Concluído</span>
        <span v-else class="ld-selo ld-selo--ocre">Croqui não viável</span>
      </BlocoCarimbo>

      <div class="prancha-cabecalho-grade">
        <div class="prancha-titulo">
          <h1>Croqui do terreno</h1>
          <p class="prancha-eyebrow">{{ arquivoOriginal }}</p>
          <dl v-if="resultado.ok" class="meta-grid">
            <div v-if="resultado.areaCalculadaM2 != null">
              <dt>Área do desenho</dt>
              <dd class="dd-num">{{ fmtNum(resultado.areaCalculadaM2) }} m²</dd>
            </div>
            <div v-if="resultado.areaDescritaM2 != null">
              <dt>Área na matrícula</dt>
              <dd class="dd-num">{{ fmtNum(resultado.areaDescritaM2) }} m²</dd>
            </div>
            <div v-if="resultado.precisao">
              <dt>Precisão</dt>
              <dd>{{ PRECISAO_LABEL[resultado.precisao] ?? resultado.precisao }}</dd>
            </div>
            <div v-if="extracao.formato">
              <dt>Descrição</dt>
              <dd>{{ FORMATO_LABEL[extracao.formato] ?? extracao.formato }}</dd>
            </div>
            <div v-if="extracao.rua_frente">
              <dt>Frente para</dt>
              <dd>{{ extracao.rua_frente }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- O desenho -->
      <section v-if="resultado.ok" class="secao" aria-labelledby="sec-desenho">
        <h2 id="sec-desenho" class="sr-only">Desenho do lote</h2>
        <figure class="croqui-figura">
          <div class="croqui-svg" v-html="svgSanitizado" />
        </figure>
      </section>

      <!-- Croqui não viável: o motivo, sem desenho -->
      <section v-else class="secao" aria-labelledby="sec-inviavel">
        <h2 id="sec-inviavel" class="inviavel-titulo">Por que o croqui não pôde ser desenhado</h2>
        <p class="inviavel-motivo">{{ resultado.motivo }}</p>
        <p class="inviavel-nota">
          Isso costuma acontecer quando a matrícula não descreve as medidas do perímetro (comum em
          matrículas antigas) ou quando a descrição está incompleta. A análise jurídica do
          documento não é afetada.
        </p>
      </section>

      <!-- Avisos da geometria e observações da extração -->
      <section v-if="avisos.length" class="secao secao-avisos" aria-labelledby="sec-avisos">
        <h2 id="sec-avisos">Observações</h2>
        <ul class="avisos-lista">
          <li v-for="(a, i) in avisos" :key="i">{{ a }}</li>
        </ul>
      </section>

      <footer class="prancha-rodape">
        <p>
          Croqui gerado automaticamente a partir da descrição do perímetro na matrícula. É um
          desenho de conferência — não substitui levantamento topográfico nem a responsabilidade
          técnica de profissional habilitado.
        </p>
      </footer>
    </article>

    <details v-if="job?.status === 'done'" class="depuracao print-hidden">
      <summary>Dados completos da extração (JSON)</summary>
      <pre>{{ JSON.stringify(job?.result, null, 2) }}</pre>
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
.acoes-baixar {
  margin-left: auto;
}

/* Etapas — mesmo padrão da página de matrícula */
.etapas {
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  margin-bottom: var(--ld-space-md);
  flex-wrap: wrap;
}
.etapa {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.etapa-marco {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--ld-filete);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ld-tinta-suave);
}
.etapa--done .etapa-marco {
  background: var(--ld-verde);
  border-color: var(--ld-verde);
  color: #fff;
}
.etapa--active .etapa-marco {
  border-color: var(--ld-verde);
  color: var(--ld-verde);
}
.etapa-label {
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.etapa--active .etapa-label {
  color: var(--ld-tinta);
  font-weight: 500;
}
.etapa-regua {
  flex: none;
  width: 24px;
  height: 1px;
  background: var(--ld-filete);
}

.nota-processando {
  margin: 0 0 var(--ld-space-md);
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}

/* Prancha sobre o guilhoché, como as demais folhas de resultado */
.prancha {
  background: var(--ld-certidao-papel);
  border: 1px solid var(--ld-certidao-filete);
  border-radius: var(--ld-r-md);
  overflow: hidden;
  box-shadow: var(--ld-shadow-flutuante);
}
.prancha-cabecalho-grade {
  padding: var(--ld-space-xl) var(--ld-space-xl) var(--ld-space-lg);
}
.prancha-titulo h1 {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.2;
}
.prancha-eyebrow {
  margin: 6px 0 0;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ld-tinta-suave);
  overflow-wrap: anywhere;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
  gap: var(--ld-space-md) var(--ld-space-lg);
  margin: var(--ld-space-lg) 0 0;
}
.meta-grid dt {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ld-tinta-suave);
  margin-bottom: 2px;
}
.meta-grid dd {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 500;
}
.dd-num {
  font-variant-numeric: tabular-nums;
}

.secao {
  border-top: 1px solid var(--ld-filete);
  padding: var(--ld-space-lg) var(--ld-space-xl) var(--ld-space-xl);
  background: var(--ld-certidao-conteudo);
}
.croqui-figura {
  margin: 0;
}
/* Lotes estreitos e compridos geram SVG mais alto que largo — limitar pela
   altura e centrar, senão os rótulos escalam gigantes na largura da folha */
.croqui-svg :deep(svg) {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: 72vh;
  margin-inline: auto;
}

.inviavel-titulo {
  margin: 0 0 var(--ld-space-sm);
  font-size: 1.125rem;
  font-weight: 600;
}
.inviavel-motivo {
  margin: 0 0 var(--ld-space-sm);
  font-family: var(--ld-font-serif);
  font-size: 1.0625rem;
  line-height: 1.6;
  max-width: 70ch;
}
.inviavel-nota {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
  max-width: 70ch;
}

.secao-avisos h2 {
  margin: 0 0 var(--ld-space-sm);
  font-size: 1rem;
  font-weight: 600;
}
.avisos-lista {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 80ch;
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
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .prancha-cabecalho-grade,
  .secao {
    padding-left: var(--ld-space-md);
    padding-right: var(--ld-space-md);
  }
  .prancha-cabecalho-grade {
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
  #documento-croqui {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    font-size: 12px;
  }
  #documento-croqui,
  #documento-croqui .secao,
  #documento-croqui .carimbo,
  #documento-croqui .ld-selo {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  #documento-croqui .prancha-titulo h1 {
    font-size: 20px;
  }
  #documento-croqui .croqui-svg svg {
    max-height: none;
  }
}
</style>
