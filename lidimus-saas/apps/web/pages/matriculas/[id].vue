<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify'

const route = useRoute()
const jobId = ref(route.params.id as string)
const { job } = useJobPoller(jobId)

// O guilhoché de segurança forra o corpo da página (ver lidimus.css); a folha
// do parecer repousa limpa sobre ele
useHead({
  title: 'Parecer de matrícula — Lidimus',
  bodyAttrs: { class: 'ld-pagina-certidao' },
})

// ─── Etapas do pipeline (sequência real: a ordem informa) ────────────────────
const STAGES = [
  { key: 'ocr', label: 'Leitura do documento' },
  { key: 'juridico', label: 'Análise jurídica' },
  { key: 'doc', label: 'Montagem do parecer' },
] as const

const stageIndex = computed(() => {
  const s = job.value?.stage as string | undefined
  const idx = STAGES.findIndex((x) => x.key === s)
  return idx === -1 ? 0 : idx
})

function stageState(idx: number): 'done' | 'active' | 'pending' {
  if (!job.value) return 'pending'
  if (job.value.status === 'done') return 'done'
  if (idx < stageIndex.value) return 'done'
  if (idx === stageIndex.value) return 'active'
  return 'pending'
}

// ─── Documento ────────────────────────────────────────────────────────────────
const doc = computed(() => {
  const result = job.value?.result as Record<string, any> | undefined
  return result?.documento ?? null
})

const textoOcr = computed(() => {
  const stageData = job.value?.stageData as Record<string, any> | undefined
  return stageData?.ocr?.texto_ocr ?? null
})

const processando = computed(
  () => !!job.value && job.value.status !== 'done' && job.value.status !== 'error',
)

// Classificação de risco → selo (A Regra do Carimbo: vermelho só em risco real)
function nivelRisco(valor: unknown): 'baixo' | 'medio' | 'alto' | null {
  const r = String(valor ?? '').toLowerCase()
  if (r.startsWith('baix')) return 'baixo'
  if (r.startsWith('alt')) return 'alto'
  if (r) return 'medio'
  return null
}

const risco = computed(() => nivelRisco(doc.value?.cabecalho?.classificacao_risco))

const riscoSeloClass = computed(() => {
  if (risco.value === 'baixo') return 'ld-selo--verde'
  if (risco.value === 'alto') return 'ld-selo--carimbo'
  if (risco.value === 'medio') return 'ld-selo--ocre'
  return 'ld-selo--neutro'
})

// O carimbo do parecer estampa o veredito em destaque — cor forte por nível,
// respeitando A Regra do Carimbo (vermelho só em risco alto)
function carimboRiscoClass(valor: unknown): string {
  const nivel = nivelRisco(valor)
  if (nivel === 'baixo') return 'ld-carimbo--baixo'
  if (nivel === 'medio') return 'ld-carimbo--medio'
  if (nivel === 'alto') return 'ld-carimbo--alto'
  return 'ld-carimbo--neutro'
}

// O selo exibe o veredito em português correto — nunca o enum cru do
// pipeline ("medio" sem acento é dialeto de máquina num parecer jurídico)
function riscoLabel(valor: unknown): string {
  const nivel = nivelRisco(valor)
  if (nivel === 'baixo') return 'Risco baixo'
  if (nivel === 'medio') return 'Risco médio'
  if (nivel === 'alto') return 'Risco alto'
  return 'Risco não classificado'
}

// Traduz o prefixo técnico "[ocr]"/"[juridico]"/"[doc]" que o backend anexa
// à mensagem de erro — jargão de máquina não aparece na UI
const mensagemFalha = computed(() => {
  const msg = job.value?.errorMessage as string | undefined
  if (!msg) return 'Ocorreu um erro inesperado durante o processamento.'
  const m = msg.match(/^\[(\w+)\]\s*(.*)$/)
  if (!m) return msg
  const etapa = STAGES.find((s) => s.key === m[1])?.label
  return etapa ? `${etapa}: ${m[2]}` : m[2]
})

const emitidoEm = computed(() => {
  const ts = job.value?.completedAt as string | undefined
  if (ts) {
    return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }
  return doc.value?.metadados?.data_extracao ?? '—'
})

// A data em que o cartório expediu a certidão (detectada na montagem do
// documento). Não é a abertura da matrícula nem a emissão do parecer: é o que
// diz até onde o documento analisado enxerga o registro.
const certidao = computed(() => doc.value?.cabecalho?.certidao ?? null)

const certidaoLabel = computed(() => {
  const c = certidao.value
  if (!c?.data) return 'Não identificada'
  return c.hora ? `${c.data} · ${c.hora}` : c.data
})

const certidaoAlerta = computed(() => {
  const c = certidao.value
  return !c?.detectada || c.situacao === 'desatualizada'
})

const temConfrontantes = computed(() => {
  const c = doc.value?.imovel?.confrontantes
  return c && Object.values(c).some(Boolean)
})

// O HTML da análise e o SVG do croqui vêm do pipeline (n8n/LLM), que processa
// texto controlado pelo cliente — sanitizar antes de renderizar
function sanitizar(html: unknown): string {
  return html ? DOMPurify.sanitize(String(html)) : ''
}
function sanitizarSvg(svg: unknown): string {
  return svg
    ? DOMPurify.sanitize(String(svg), { USE_PROFILES: { svg: true, svgFilters: true } })
    : ''
}

function exportarPdf() {
  window.print()
}

// ─── Croqui do terreno: ferramenta separada que reaproveita o texto já lido ──
const gerandoCroqui = ref(false)
const erroCroqui = ref<string | null>(null)

// Um croqui já gerado a partir desta matrícula? Se sim, o parecer leva a ele
// ("Visualizar croqui") em vez de oferecer gerar de novo — o croqui é acessível
// pelo laudo, e não se duplica trabalho já pago.
const { data: croquiVinculado } = await useFetch<{ croquiJobId: string | null }>(
  () => `/api/jobs/${jobId.value}/croqui`,
)
const croquiJobId = computed(() => croquiVinculado.value?.croquiJobId ?? null)

async function gerarCroquiDaMatricula() {
  gerandoCroqui.value = true
  erroCroqui.value = null
  try {
    const { jobId: novoCroquiId } = await $fetch<{ jobId: string }>('/api/croqui', {
      method: 'POST',
      body: { matriculaJobId: jobId.value },
    })
    await navigateTo(`/croqui/${novoCroquiId}`)
  } catch (err) {
    erroCroqui.value = mensagemDeErroDeUpload(err).texto
    gerandoCroqui.value = false
  }
}
</script>

<template>
  <div>
    <!-- Barra de ações (fora do documento; some na impressão) -->
    <div class="acoes print-hidden">
      <NuxtLink to="/dashboard" class="ld-btn ld-btn--ghost">← Painel</NuxtLink>
      <NuxtLink
        v-if="job?.status === 'done' && croquiJobId"
        :to="`/croqui/${croquiJobId}`"
        class="ld-btn ld-btn--secondary acoes-croqui"
      >
        Visualizar croqui
      </NuxtLink>
      <button
        v-else-if="job?.status === 'done' && textoOcr"
        class="ld-btn ld-btn--secondary acoes-croqui"
        :disabled="gerandoCroqui"
        @click="gerarCroquiDaMatricula"
      >
        <span v-if="gerandoCroqui" class="ld-spinner" aria-hidden="true" />
        {{ gerandoCroqui ? 'Gerando…' : 'Gerar croqui do terreno' }}
      </button>
      <button
        v-if="job?.status === 'done' && doc"
        class="ld-btn ld-btn--primary acoes-exportar"
        @click="exportarPdf"
      >
        Exportar PDF
      </button>
    </div>
    <p v-if="erroCroqui" class="ld-erro acoes-erro print-hidden" role="alert">{{ erroCroqui }}</p>

    <!-- ── Processando: etapas reais + esqueleto da prancha ─────────────── -->
    <div v-if="!job || processando" class="print-hidden" aria-live="polite">
      <div v-if="job" class="etapas" role="list" aria-label="Etapas da análise">
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
      <p v-if="job" class="etapas-nota">
        Analisando sua certidão — esta página atualiza sozinha, não é preciso recarregar.
      </p>

      <PranchaEsqueleto />
    </div>

    <!-- ── Erro ──────────────────────────────────────────────────────────── -->
    <PranchaFalha
      v-else-if="job.status === 'error'"
      titulo="Não foi possível concluir a análise"
      :mensagem="mensagemFalha"
      retry-to="/matriculas"
      retry-label="enviar a certidão novamente"
    />

    <!-- ── A Prancha: o parecer ──────────────────────────────────────────── -->
    <article v-else-if="doc" id="documento-matricula" class="prancha">
      <!-- Bloco-carimbo -->
      <BlocoCarimbo
        analise="Parecer de matrícula"
        documento-label="Documento"
        :documento="`MAT ${doc.cabecalho.numero_matricula ?? '—'}`"
        :certidao="certidaoLabel"
        :certidao-alerta="certidaoAlerta"
        :emitido="emitidoEm"
      >
        <span class="ld-selo" :class="riscoSeloClass">
          {{ riscoLabel(doc.cabecalho.classificacao_risco) }}
        </span>
      </BlocoCarimbo>

      <!-- Título do documento -->
      <div class="prancha-titulo">
        <p v-if="doc.cabecalho.titulo" class="prancha-fonte">{{ doc.cabecalho.titulo }}</p>
        <h1>Matrícula {{ doc.cabecalho.numero_matricula ?? '—' }}</h1>
        <p v-if="doc.cabecalho.cartorio" class="prancha-cartorio">{{ doc.cabecalho.cartorio }}</p>

        <dl class="meta-grid">
          <div v-if="doc.cabecalho.data_abertura">
            <dt>Abertura</dt>
            <dd>{{ doc.cabecalho.data_abertura }}</dd>
          </div>
          <div v-if="doc.cabecalho.livro_folha">
            <dt>Livro / Folha</dt>
            <dd>{{ doc.cabecalho.livro_folha }}</dd>
          </div>
          <div v-if="doc.cabecalho.matricula_anterior">
            <dt>Matrícula anterior</dt>
            <dd class="dd-id">{{ doc.cabecalho.matricula_anterior }}</dd>
          </div>
          <div v-if="doc.cabecalho.sql_iptu">
            <dt>SQL / IPTU</dt>
            <dd class="dd-id">{{ doc.cabecalho.sql_iptu }}</dd>
          </div>
        </dl>
      </div>

      <!-- Imóvel -->
      <section class="secao" aria-labelledby="sec-imovel">
        <h2 id="sec-imovel">Imóvel</h2>
        <p class="prosa">{{ doc.imovel.endereco ?? 'Endereço não identificado no documento.' }}</p>
        <dl class="meta-grid">
          <div v-if="doc.imovel.area_total_display">
            <dt>Área total</dt>
            <dd>{{ doc.imovel.area_total_display }}</dd>
          </div>
          <div v-if="doc.imovel.area_construida_display">
            <dt>Área construída</dt>
            <dd>{{ doc.imovel.area_construida_display }}</dd>
          </div>
          <div v-if="doc.imovel.testada">
            <dt>Testada</dt>
            <dd>{{ doc.imovel.testada }}</dd>
          </div>
          <div>
            <dt>Ônus ativos</dt>
            <dd>{{ doc.imovel.tem_onus_display }}</dd>
          </div>
        </dl>
        <dl v-if="temConfrontantes" class="meta-grid meta-grid--separada">
          <template v-for="(lado, dir) in doc.imovel.confrontantes" :key="dir">
            <div v-if="lado">
              <dt class="dt-capitalize">{{ dir }}</dt>
              <dd>{{ lado }}</dd>
            </div>
          </template>
        </dl>
      </section>

      <!-- Croqui -->
      <section v-if="doc.croqui?.disponivel" class="secao" aria-labelledby="sec-croqui">
        <div class="secao-cabecalho">
          <h2 id="sec-croqui">Croqui do terreno</h2>
          <span v-if="doc.croqui.precisao" class="secao-nota">Precisão: {{ doc.croqui.precisao }}</span>
        </div>
        <figure class="croqui">
          <img
            v-if="doc.croqui.data_uri"
            :src="doc.croqui.data_uri"
            alt="Croqui do terreno gerado a partir das medidas descritas na matrícula"
            loading="lazy"
          />
          <div v-else class="croqui-svg" v-html="sanitizarSvg(doc.croqui.svg)" />
        </figure>
      </section>

      <!-- Proprietários -->
      <section class="secao" aria-labelledby="sec-prop">
        <h2 id="sec-prop">Proprietários atuais</h2>
        <ol v-if="doc.proprietarios.lista?.length" class="pessoas">
          <li v-for="p in doc.proprietarios.lista" :key="p.ordem" class="pessoa">
            <p class="pessoa-nome">{{ p.ordem }}. {{ p.nome }}</p>
            <p v-if="p.documento_tipo && p.documento_numero" class="pessoa-meta">
              {{ p.documento_tipo }} <span class="dd-id">{{ p.documento_numero }}</span>
            </p>
            <p v-if="p.estado_civil" class="pessoa-meta">
              {{ p.estado_civil }}<template v-if="p.regime_bens"> — {{ p.regime_bens }}</template>
            </p>
            <p v-if="p.ato_aquisitivo" class="pessoa-meta">
              Adquirido em {{ p.ato_aquisitivo }}<template v-if="p.data_aquisicao"> — {{ p.data_aquisicao }}</template>
              <template v-if="p.percentual"> — {{ p.percentual }}</template>
            </p>
            <p v-if="p.endereco_domicilio" class="pessoa-meta">Domicílio: {{ p.endereco_domicilio }}</p>
            <p v-if="p.observacao" class="pessoa-meta">{{ p.observacao }}</p>
          </li>
        </ol>
        <p v-else class="vazio">
          Não foi possível identificar os proprietários automaticamente. Confira o documento original.
        </p>

        <!-- Titulares de direitos registrados que NÃO são donos: promitente
             comprador, cessionário. Separá-los evita confundi-los com o titular. -->
        <div v-if="doc.proprietarios.promissarios?.lista?.length" class="subsecao">
          <h3 class="subsecao-titulo">Promitentes compradores e cessionários</h3>
          <p class="subsecao-nota">
            Titulares de direitos registrados sobre o imóvel — não são os proprietários.
          </p>
          <ol class="pessoas">
            <li v-for="p in doc.proprietarios.promissarios.lista" :key="'pc-' + p.ordem" class="pessoa">
              <p class="pessoa-nome">{{ p.ordem }}. {{ p.nome }}</p>
              <p v-if="p.natureza" class="pessoa-meta">{{ p.natureza }}</p>
              <p v-if="p.documento_tipo && p.documento_numero" class="pessoa-meta">
                {{ p.documento_tipo }} <span class="dd-id">{{ p.documento_numero }}</span>
              </p>
              <p v-if="p.observacao" class="pessoa-meta">{{ p.observacao }}</p>
            </li>
          </ol>
        </div>
      </section>

      <!-- Parecer: a conclusão — o veredito vem antes do detalhamento -->
      <section class="secao secao--parecer" aria-labelledby="sec-parecer">
        <div class="secao-cabecalho">
          <h2 id="sec-parecer">Parecer</h2>
          <span class="ld-carimbo ld-carimbo--grande" :class="carimboRiscoClass(doc.parecer.classificacao_risco)">
            {{ riscoLabel(doc.parecer.classificacao_risco) }}
          </span>
        </div>
        <p v-if="doc.parecer.texto" class="parecer-texto">{{ doc.parecer.texto }}</p>
        <p v-else class="vazio">Parecer não disponível para esta análise.</p>
      </section>

      <!-- Análise jurídica -->
      <section class="secao" aria-labelledby="sec-analise">
        <h2 id="sec-analise">Análise jurídica</h2>
        <div class="analise">
          <div v-if="doc.analise_juridica.resumo_executivo">
            <h3>Resumo executivo</h3>
            <p class="prosa">{{ doc.analise_juridica.resumo_executivo }}</p>
          </div>
          <div v-if="doc.analise_juridica.riscos_html">
            <h3>Riscos</h3>
            <div class="prosa analise-html" v-html="sanitizar(doc.analise_juridica.riscos_html)" />
          </div>
          <div v-if="doc.analise_juridica.inconsistencias_html">
            <h3>Inconsistências</h3>
            <div class="prosa analise-html" v-html="sanitizar(doc.analise_juridica.inconsistencias_html)" />
          </div>
          <div v-if="doc.analise_juridica.problemas_html">
            <h3>Possíveis problemas</h3>
            <div class="prosa analise-html" v-html="sanitizar(doc.analise_juridica.problemas_html)" />
          </div>
          <div v-if="doc.analise_juridica.cadeia_dominial_html">
            <h3>Cadeia dominial</h3>
            <div class="prosa analise-html" v-html="sanitizar(doc.analise_juridica.cadeia_dominial_html)" />
          </div>
          <div v-if="doc.analise_juridica.fundamentacao_html">
            <h3>Fundamentação legal</h3>
            <div class="prosa analise-html" v-html="sanitizar(doc.analise_juridica.fundamentacao_html)" />
          </div>
        </div>
      </section>

      <!-- Histórico de atos -->
      <section class="secao" aria-labelledby="sec-atos">
        <h2 id="sec-atos">Histórico de atos <span class="contagem">({{ doc.historico_atos.total }})</span></h2>
        <ol v-if="doc.historico_atos.lista?.length" class="atos">
          <li
            v-for="a in doc.historico_atos.lista"
            :key="a.sequencia"
            class="ato"
            :class="{ 'ato--cancelado': a.status === 'cancelado' }"
          >
            <span class="ato-seq">{{ a.sequencia }}</span>
            <div class="ato-corpo">
              <p class="ato-tipo">
                {{ a.tipo_label }}
                <span v-if="a.status === 'cancelado'" class="ld-selo ld-selo--carimbo">Cancelado</span>
              </p>
              <p v-if="a.partes" class="ato-meta">Partes: {{ a.partes }}</p>
              <p v-if="a.cancelado_por" class="ato-meta ato-meta--cancelamento">
                Cancelado por {{ a.cancelado_por }}
              </p>
            </div>
            <span v-if="a.valor" class="ato-valor">R$ {{ a.valor }}</span>
            <span v-if="a.data" class="ato-data">{{ a.data }}</span>
          </li>
        </ol>
        <p v-else class="vazio">Nenhum ato registrado.</p>
      </section>

      <!-- Ônus ativos: risco jurídico real — o único vermelho da prancha -->
      <section class="secao" aria-labelledby="sec-onus">
        <h2 id="sec-onus">Ônus e gravames ativos <span class="contagem">({{ doc.onus.total }})</span></h2>
        <ul v-if="doc.onus.ativos?.length" class="onus-lista">
          <li v-for="o in doc.onus.ativos" :key="o.sequencia" class="onus">
            <div class="onus-linha">
              <span class="onus-seq">{{ o.sequencia }}</span>
              <span class="onus-tipo">{{ o.tipo_label }}</span>
              <span v-if="o.valor" class="onus-valor">R$ {{ o.valor }}</span>
              <span v-if="o.data" class="onus-data">{{ o.data }}</span>
            </div>
            <p v-if="o.partes" class="onus-partes">Partes: {{ o.partes }}</p>
          </li>
        </ul>
        <p v-else><span class="ld-selo ld-selo--verde">Nenhum ônus ativo identificado</span></p>
      </section>

      <!-- Rodapé de metadados -->
      <footer class="prancha-rodape">
        <div v-if="doc.metadados.validacao?.avisos?.length" class="avisos">
          <p class="avisos-titulo">Avisos da extração</p>
          <ul>
            <li v-for="(av, i) in doc.metadados.validacao.avisos" :key="i">{{ av }}</li>
          </ul>
        </div>
        <p>
          Extraído em {{ doc.metadados.data_extracao
          }}<template v-if="doc.metadados.total_paginas">
            · {{ doc.metadados.total_paginas }} página(s) analisada(s)</template>
        </p>
        <p>
          Documento gerado automaticamente pela Lidimus. É uma ferramenta de apoio e não substitui a
          certidão oficial do cartório nem o parecer de profissional habilitado.
        </p>
      </footer>
    </article>

    <!-- ── Concluído em formato anterior (fallback) ──────────────────────── -->
    <div v-else-if="job.status === 'done'" class="legado">
      <p>Esta análise foi gerada em um formato anterior da plataforma. Dados completos:</p>
      <pre>{{ JSON.stringify(job.result, null, 2) }}</pre>
    </div>

    <!-- Texto OCR completo -->
    <details v-if="textoOcr" class="depuracao print-hidden">
      <summary>Texto completo do documento</summary>
      <pre>{{ textoOcr }}</pre>
    </details>
  </div>
</template>

<style scoped>
/* ── Barra de ações ─────────────────────────────────────── */
.acoes {
  display: flex;
  align-items: center;
  gap: var(--ld-space-md);
  margin-bottom: var(--ld-space-lg);
  flex-wrap: wrap;
}
/* Os botões de ação alinham à direita; o croqui abre a margem */
.acoes-croqui {
  margin-left: auto;
}
.acoes-croqui + .acoes-exportar {
  margin-left: 0;
}
.acoes-exportar {
  margin-left: auto;
}
.acoes-erro {
  margin: calc(-1 * var(--ld-space-sm)) 0 var(--ld-space-lg);
}

/* ── Etapas (pipeline em andamento) ─────────────────────── */
.etapas {
  display: flex;
  align-items: center;
  gap: var(--ld-space-md);
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-md);
  background: var(--ld-folha);
  padding: var(--ld-space-lg);
  flex-wrap: wrap;
}
.etapa {
  display: flex;
  align-items: center;
  gap: 10px;
}
.etapa-marco {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1px solid var(--ld-filete);
  color: var(--ld-tinta-suave);
  background: var(--ld-bancada);
  transition: background var(--ld-dur-estado) var(--ld-ease),
    color var(--ld-dur-estado) var(--ld-ease);
}
.etapa--done .etapa-marco {
  background: var(--ld-verde);
  border-color: var(--ld-verde);
  color: var(--ld-papel);
}
.etapa--active .etapa-marco {
  background: var(--ld-folha);
  border-color: var(--ld-verde);
  color: var(--ld-verde);
  animation: pulso 1.6s var(--ld-ease) infinite;
}
.etapa-label {
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}
.etapa--active .etapa-label,
.etapa--done .etapa-label {
  color: var(--ld-tinta);
  font-weight: 500;
}
.etapa-regua {
  flex: 1;
  min-width: 24px;
  height: 1px;
  background: var(--ld-filete);
}
.etapas-nota {
  margin: var(--ld-space-md) 0 0;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
@keyframes pulso {
  0%, 100% { box-shadow: 0 0 0 0 rgba(12, 92, 60, 0.28); }
  55% { box-shadow: 0 0 0 6px rgba(12, 92, 60, 0); }
}

/* ── A prancha ──────────────────────────────────────────── */
/* A folha do parecer repousa sobre o papel de segurança da página: sombra
   leve para descolar do guilhoché, folha amarelada, dados em azul anil. */
.prancha {
  background: var(--ld-certidao-papel);
  border: 1px solid var(--ld-certidao-filete);
  border-radius: var(--ld-r-md);
  overflow: hidden;
  box-shadow: var(--ld-shadow-flutuante);
}
/* Carimbo de identificação e título ficam sobre a folha amarelada */
.prancha :deep(.carimbo) {
  background: transparent;
}

/* Título do documento */
.prancha-titulo {
  padding: var(--ld-space-xl) var(--ld-space-xl) var(--ld-space-lg);
}
.prancha-fonte {
  margin: 0 0 var(--ld-space-sm);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.prancha-titulo h1 {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.2;
  text-wrap: balance;
}
.prancha-cartorio {
  margin: var(--ld-space-xs) 0 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
}

/* Grades de metadados <dl> */
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
  gap: var(--ld-space-md) var(--ld-space-lg);
  margin: var(--ld-space-lg) 0 0;
}
.meta-grid--separada {
  border-top: 1px solid var(--ld-filete);
  padding-top: var(--ld-space-md);
}
.meta-grid dt {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ld-tinta-suave);
  margin-bottom: 2px;
}
.dt-capitalize {
  text-transform: capitalize;
}
.meta-grid dd {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 500;
}
.dd-id {
  font-family: var(--ld-font-mono);
  font-size: 0.875rem;
  font-weight: 400;
}

/* Seções — o campo de leitura em azul anil suave */
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
.secao-cabecalho {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
}
.secao-nota {
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.contagem {
  color: var(--ld-tinta-suave);
  font-weight: 400;
}
.prosa {
  margin: 0;
  max-width: 72ch;
  line-height: 1.6;
  text-wrap: pretty;
  overflow-wrap: break-word;
}
.vazio {
  margin: 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
}

/* Croqui */
.croqui {
  margin: var(--ld-space-md) 0 0;
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: var(--ld-folha);
  padding: var(--ld-space-lg);
}
.croqui img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}
.croqui-svg :deep(svg) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

/* Proprietários */
.pessoas {
  list-style: none;
  margin: 0;
  padding: 0;
}
.pessoa {
  padding: var(--ld-space-md) 0;
  border-bottom: 1px solid var(--ld-filete);
}
.pessoa:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.pessoa:first-child {
  padding-top: 0;
}
.pessoa-nome {
  margin: 0;
  font-weight: 600;
  font-size: 0.9375rem;
}
.pessoa-meta {
  margin: 2px 0 0;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.subsecao {
  margin-top: var(--ld-space-lg);
  padding-top: var(--ld-space-md);
  border-top: 1px solid var(--ld-filete);
}
.subsecao-titulo {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}
.subsecao-nota {
  margin: 2px 0 var(--ld-space-md);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}

/* Histórico de atos */
.atos {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ato {
  display: grid;
  grid-template-columns: 64px 1fr auto auto;
  gap: var(--ld-space-xs) var(--ld-space-md);
  align-items: baseline;
  padding: 12px 0;
  border-bottom: 1px solid var(--ld-filete);
  font-size: 0.9375rem;
}
.ato:last-child {
  border-bottom: none;
}
.ato-seq {
  font-family: var(--ld-font-mono);
  font-size: 0.875rem;
  color: var(--ld-verde);
}
.ato-tipo {
  margin: 0;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  flex-wrap: wrap;
}
.ato-meta {
  margin: 2px 0 0;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.ato-meta--cancelamento {
  color: var(--ld-carimbo-tinta);
}
.ato-valor {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  white-space: nowrap;
}
.ato-data {
  color: var(--ld-tinta-suave);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ato--cancelado .ato-tipo,
.ato--cancelado .ato-seq,
.ato--cancelado .ato-valor {
  color: var(--ld-tinta-suave);
  text-decoration: none;
}

/* Ônus ativos — risco real: o único vermelho da prancha */
.onus-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-sm);
}
.onus {
  border: 1px solid var(--ld-carimbo);
  background: var(--ld-carimbo-selo);
  border-radius: var(--ld-r-sm);
  padding: 12px var(--ld-space-md);
}
.onus-linha {
  display: flex;
  align-items: baseline;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  font-size: 0.9375rem;
}
.onus-seq {
  font-family: var(--ld-font-mono);
  font-size: 0.875rem;
  color: var(--ld-carimbo-tinta);
}
.onus-tipo {
  font-weight: 600;
  color: var(--ld-carimbo-tinta);
}
.onus-valor {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: var(--ld-tinta);
}
.onus-data {
  color: var(--ld-tinta-suave);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}
.onus-partes {
  margin: var(--ld-space-xs) 0 0;
  font-size: 0.8125rem;
  color: var(--ld-tinta);
}

/* Análise jurídica */
.analise {
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-lg);
}
.analise h3 {
  margin: 0 0 var(--ld-space-sm);
  font-size: 0.9375rem;
  font-weight: 600;
}
.analise-html :deep(p) {
  margin: 0 0 var(--ld-space-sm);
}
.analise-html :deep(ul),
.analise-html :deep(ol) {
  margin: 0 0 var(--ld-space-sm);
  padding-left: 1.25rem;
}
.analise-html :deep(li) {
  margin-bottom: var(--ld-space-xs);
}
.analise-html :deep(strong) {
  font-weight: 600;
}

/* Parecer — a folha amarelada e o filete anil destacam a conclusão selada */
.secao--parecer {
  border-top: 3px solid var(--ld-anil);
  background: var(--ld-certidao-papel);
}
.secao--parecer .secao-cabecalho {
  align-items: center;
}
.parecer-texto {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-size: 1.125rem;
  line-height: 1.65;
  max-width: 72ch;
  text-wrap: pretty;
}

/* Rodapé */
.prancha-rodape {
  border-top: 1px solid var(--ld-filete);
  padding: var(--ld-space-md) var(--ld-space-xl) var(--ld-space-lg);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.prancha-rodape p {
  margin: 0 0 var(--ld-space-xs);
  max-width: 90ch;
}
.avisos {
  border: 1px solid var(--ld-ocre);
  background: var(--ld-ocre-selo);
  border-radius: var(--ld-r-sm);
  padding: 12px var(--ld-space-md);
  margin-bottom: var(--ld-space-md);
  color: var(--ld-ocre);
}
.avisos-titulo {
  font-weight: 600;
  margin: 0 0 var(--ld-space-xs);
}
.avisos ul {
  margin: 0;
  padding-left: 1.25rem;
}

/* Fallback legado e depuração */
.legado {
  border: 1px solid var(--ld-filete);
  background: var(--ld-folha);
  border-radius: var(--ld-r-md);
  padding: var(--ld-space-lg);
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}
.legado pre,
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


/* Responsivo */
@media (max-width: 640px) {
  .prancha-titulo,
  .secao {
    padding-left: var(--ld-space-md);
    padding-right: var(--ld-space-md);
  }
  .prancha-titulo {
    padding-top: var(--ld-space-lg);
  }
  .ato {
    grid-template-columns: 64px 1fr;
  }
  .ato-valor,
  .ato-data {
    grid-column: 2;
    justify-self: start;
  }
}
</style>

<style>
/* Impressão: a prancha vira o documento A4 (global — atravessa o layout) */
@media print {
  @page {
    size: A4;
    margin: 14mm;
  }

  .print-hidden {
    display: none !important;
  }

  #documento-matricula {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    font-size: 12px;
  }

  #documento-matricula,
  #documento-matricula .secao,
  #documento-matricula .carimbo,
  #documento-matricula .secao--parecer,
  #documento-matricula .ld-selo,
  #documento-matricula .ld-carimbo,
  #documento-matricula .onus,
  #documento-matricula .avisos {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  #documento-matricula .secao,
  #documento-matricula .onus,
  #documento-matricula .pessoa {
    break-inside: avoid;
  }

  #documento-matricula .prancha-titulo h1 {
    font-size: 20px;
  }

  #documento-matricula .parecer-texto {
    font-size: 13px;
  }
}
</style>
