<script setup lang="ts">
const route = useRoute()
const jobId = ref(route.params.id as string)
const { job } = useJobPoller(jobId)

// O guilhoché de segurança forra o corpo da página (ver lidimus.css); a folha
// do memorial repousa limpa sobre ele
useHead({
  title: 'Memorial descritivo — Lidimus',
  bodyAttrs: { class: 'ld-pagina-certidao' },
})

const result = computed(() => job.value?.result as Record<string, any> | undefined)

const processando = computed(
  () => !job.value || (job.value.status !== 'done' && job.value.status !== 'error'),
)

const protocolo = computed(() => String(jobId.value ?? '').slice(0, 8).toUpperCase())

const emitidoEm = computed(() => {
  const ts = job.value?.completedAt as string | undefined
  return ts
    ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '—'
})

// Croqui do terreno: desenha o polígono real a partir das coordenadas UTM
// já calculadas no memorial (utm_e/utm_n são planas, então plotam direto sem
// projeção esférica) — mesmo padrão visual do "mapa" da landing page.
const CROQUI_VIEWBOX = { w: 160, h: 120, pad: 16 }

const croqui = computed(() => {
  const vertices = result.value?.vertices as
    | Array<{ utm_e: number; utm_n: number; label?: string }>
    | undefined
  if (!vertices?.length) return null
  if (vertices.some((v) => typeof v.utm_e !== 'number' || typeof v.utm_n !== 'number')) return null

  const xs = vertices.map((v) => v.utm_e)
  const ys = vertices.map((v) => v.utm_n)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1

  const { w, h, pad } = CROQUI_VIEWBOX
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
  const offX = (w - spanX * scale) / 2
  const offY = (h - spanY * scale) / 2

  const pontos = vertices.map((v) => ({
    x: offX + (v.utm_e - minX) * scale,
    // eixo Y invertido: norte (utm_n maior) fica no topo, como num mapa
    y: h - (offY + (v.utm_n - minY) * scale),
  }))

  return {
    pontos,
    pontosAttr: pontos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
  }
})

const arquivoOriginal = computed(() => {
  const meta = job.value?.inputMeta as Record<string, any> | undefined
  return meta?.originalName ?? 'poligonal.kml'
})

// ── Estrutura do memorial ────────────────────────────────────────────────
// O modelo devolve o memorial como um bloco de texto único, com seções
// numeradas ("1. IDENTIFICAÇÃO DO IMÓVEL", "2. DESCRIÇÃO DOS VÉRTICES"...).
// Quebramos esse bloco em seções para dar a cada uma seu próprio tratamento
// tipográfico; se o formato fugir do esperado, caímos no texto corrido.
type SecaoMemorial = { titulo: string; corpo: string }

const secoes = computed<SecaoMemorial[]>(() => {
  const texto = result.value?.memorial_descritivo
  if (typeof texto !== 'string' || !texto.trim()) return []
  const out: SecaoMemorial[] = []
  let atual: SecaoMemorial | null = null
  // Cabeçalho de seção: "N. TÍTULO" — exige letra no início do título para não
  // confundir com uma linha de coordenada ("1.234,56").
  const reHeader = /^\s*\d+\.\s+([A-Za-zÀ-ÿ].*?)\s*$/
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(reHeader)
    if (m) {
      if (atual) out.push(atual)
      atual = { titulo: m[1].trim(), corpo: '' }
    } else if (atual) {
      atual.corpo += (atual.corpo ? '\n' : '') + linha
    }
    // linhas antes da 1ª seção (ex.: o título "MEMORIAL DESCRITIVO") caem fora
  }
  if (atual) out.push(atual)
  return out.map((s) => ({ ...s, corpo: s.corpo.replace(/^\n+|\n+$/g, '') }))
})

const acharSecao = (re: RegExp) => secoes.value.find((s) => re.test(s.titulo))
const secIdentificacao = computed(() => acharSecao(/identifica/i))
const secVertices = computed(() => acharSecao(/v[eé]rtice/i))
const secPerimetro = computed(() => acharSecao(/per[ií]metro/i))
const secResumo = computed(() => acharSecao(/resumo/i))
const secEncerramento = computed(() => acharSecao(/encerra/i))

// A "Identificação do imóvel" vira um cartão chave→valor no cabeçalho.
const identLinhas = computed(() =>
  (secIdentificacao.value?.corpo ?? '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const i = l.indexOf(':')
      return i === -1
        ? { chave: '', valor: l.trim() }
        : { chave: l.slice(0, i).trim(), valor: l.slice(i + 1).trim() }
    }),
)

// A narrativa do perímetro é o destaque cartorial; prefere a seção parseada,
// mas aceita o campo dedicado `descricao_perimetro` quando disponível.
const perimetroTexto = computed(() => {
  if (secPerimetro.value?.corpo) return secPerimetro.value.corpo
  const dp = result.value?.descricao_perimetro
  return typeof dp === 'string' ? dp.trim() : ''
})

// Seções fora das categorias conhecidas — renderizadas ao fim como notas,
// para nunca descartar conteúdo do memorial.
const secoesExtras = computed(() =>
  secoes.value.filter(
    (s) => !/identifica|v[eé]rtice|per[ií]metro|resumo|encerra/i.test(s.titulo),
  ),
)

const copiado = ref(false)
async function copiarMemorial() {
  if (!result.value?.memorial_descritivo) return
  await navigator.clipboard.writeText(String(result.value.memorial_descritivo))
  copiado.value = true
  setTimeout(() => (copiado.value = false), 2000)
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
      <template v-if="job?.status === 'done' && result?.memorial_descritivo">
        <button class="ld-btn ld-btn--secondary acoes-copiar" @click="copiarMemorial">
          {{ copiado ? 'Copiado ✓' : 'Copiar texto' }}
        </button>
        <button class="ld-btn ld-btn--primary" @click="exportarPdf">Exportar PDF</button>
      </template>
    </div>

    <!-- Processando -->
    <div v-if="processando" class="print-hidden" aria-live="polite">
      <p class="nota-processando">
        Calculando vértices e redigindo o memorial — esta página atualiza sozinha, não é preciso
        recarregar.
      </p>
      <PranchaEsqueleto />
    </div>

    <!-- Erro -->
    <PranchaFalha
      v-else-if="job?.status === 'error'"
      titulo="Não foi possível gerar o memorial"
      :mensagem="String(job.errorMessage ?? 'Ocorreu um erro inesperado durante o processamento.')"
      retry-to="/kml"
      retry-label="enviar o KML novamente"
    />

    <!-- A prancha: o memorial -->
    <article v-else-if="result" id="documento-memorial" class="prancha">
      <BlocoCarimbo
        analise="Memorial descritivo"
        documento-label="Protocolo"
        :documento="protocolo"
        :emitido="emitidoEm"
      >
        <span class="ld-selo ld-selo--verde">Concluído</span>
      </BlocoCarimbo>

      <div class="prancha-cabecalho-grade">
        <div class="prancha-titulo">
          <h1>Memorial descritivo</h1>
          <p class="prancha-eyebrow">Identificação do imóvel</p>
          <dl class="meta-grid">
            <div v-if="result.area_m2">
              <dt>Área</dt>
              <dd class="dd-num">{{ Number(result.area_m2).toLocaleString('pt-BR') }} m²</dd>
            </div>
            <div v-if="result.perimetro_m">
              <dt>Perímetro</dt>
              <dd class="dd-num">{{ Number(result.perimetro_m).toLocaleString('pt-BR') }} m</dd>
            </div>
            <div v-if="result.vertices?.length">
              <dt>Vértices</dt>
              <dd class="dd-num">{{ result.vertices.length }}</dd>
            </div>
          </dl>
        </div>

        <!-- Identificação do imóvel: ocupa o lugar antes reservado ao croqui,
             que desce para o rodapé da folha (ver seção). -->
        <aside v-if="identLinhas.length" class="ident-bloco" aria-label="Identificação do imóvel">
          <dl class="ident-lista">
            <div v-for="(l, i) in identLinhas" :key="i" class="ident-item">
              <dt v-if="l.chave">{{ l.chave }}</dt>
              <dd>{{ l.valor }}</dd>
            </div>
          </dl>
        </aside>
        <div v-else-if="croqui && !secoes.length" class="croqui-mapa" aria-hidden="true">
          <svg viewBox="0 0 160 120" width="180" height="132">
            <polygon :points="croqui.pontosAttr" fill="rgba(228,243,234,0.14)" stroke="#8FC3A8" stroke-width="1.5" />
            <circle v-for="(p, i) in croqui.pontos" :key="i" :cx="p.x" :cy="p.y" r="2.5" fill="#8FC3A8" />
          </svg>
          <span class="croqui-arquivo">{{ arquivoOriginal }}</span>
        </div>
      </div>

      <section class="secao" aria-labelledby="sec-memorial">
        <h2 id="sec-memorial" class="sr-only">Texto do memorial</h2>

        <template v-if="secoes.length">
          <!-- Descrição dos vértices (corpo miúdo, sem serifa) à esquerda;
               o croqui gerado à direita, no rodapé da folha. -->
          <div class="vertices-linha">
            <div v-if="secVertices" class="vertices-bloco">
              <h3 class="bloco-titulo">{{ secVertices.titulo }}</h3>
              <p class="vertices-corpo">{{ secVertices.corpo }}</p>
            </div>
            <div v-if="croqui" class="croqui-mapa croqui-mapa--rodape" aria-hidden="true">
              <svg viewBox="0 0 160 120" width="180" height="132">
                <polygon :points="croqui.pontosAttr" fill="rgba(228,243,234,0.14)" stroke="#8FC3A8" stroke-width="1.5" />
                <circle v-for="(p, i) in croqui.pontos" :key="i" :cx="p.x" :cy="p.y" r="2.5" fill="#8FC3A8" />
              </svg>
              <span class="croqui-arquivo">{{ arquivoOriginal }}</span>
            </div>
          </div>

          <!-- Descrição do perímetro: a representação cartorial do imóvel, o
               trecho mais importante — em destaque, com serifa itálica. -->
          <div v-if="perimetroTexto" class="perimetro-bloco">
            <h3 class="bloco-titulo bloco-titulo--destaque">
              {{ secPerimetro?.titulo ?? 'Descrição do perímetro' }}
            </h3>
            <p class="perimetro-corpo">{{ perimetroTexto }}</p>
          </div>

          <!-- Resumo geométrico e encerramento legal: notas em corpo miúdo. -->
          <div v-if="secResumo" class="nota-bloco">
            <h3 class="bloco-titulo">{{ secResumo.titulo }}</h3>
            <p class="nota-corpo">{{ secResumo.corpo }}</p>
          </div>
          <div v-if="secEncerramento" class="nota-bloco">
            <h3 class="bloco-titulo">{{ secEncerramento.titulo }}</h3>
            <p class="nota-corpo">{{ secEncerramento.corpo }}</p>
          </div>
          <div v-for="(s, i) in secoesExtras" :key="i" class="nota-bloco">
            <h3 class="bloco-titulo">{{ s.titulo }}</h3>
            <p class="nota-corpo">{{ s.corpo }}</p>
          </div>
        </template>

        <p v-else-if="result.memorial_descritivo" class="memorial-texto">{{ result.memorial_descritivo }}</p>
        <p v-else class="vazio">O memorial não foi retornado para esta análise. Confira os dados completos abaixo.</p>
      </section>

      <footer class="prancha-rodape">
        <p>
          Documento gerado automaticamente pela Lidimus a partir do arquivo KML enviado. É uma
          ferramenta de apoio e não substitui a responsabilidade técnica de profissional habilitado.
        </p>
      </footer>
    </article>

    <details v-if="result" class="depuracao print-hidden">
      <summary>Dados completos da análise (JSON)</summary>
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
.acoes-copiar {
  margin-left: auto;
}

.nota-processando {
  margin: 0 0 var(--ld-space-md);
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}

/* Prancha — a folha do memorial repousa sobre o papel de segurança da página:
   sombra leve para descolar do guilhoché, folha amarelada, dados em azul anil. */
.prancha {
  background: var(--ld-certidao-papel);
  border: 1px solid var(--ld-certidao-filete);
  border-radius: var(--ld-r-md);
  overflow: hidden;
  box-shadow: var(--ld-shadow-flutuante);
}
.prancha-cabecalho-grade {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ld-space-xl);
  padding: var(--ld-space-xl) var(--ld-space-xl) var(--ld-space-lg);
  flex-wrap: wrap;
}
.prancha-titulo {
  flex: 1 1 320px;
  min-width: 0;
}
.prancha-titulo h1 {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.2;
}
/* Caixa normal: uppercase é exclusivo do bloco-carimbo (DESIGN.md) */
.prancha-eyebrow {
  margin: 6px 0 0;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ld-tinta-suave);
}

/* Croqui: o mesmo padrão visual do "mapa" da landing page, em escala de relatório */
.croqui-mapa {
  position: relative;
  flex: none;
  width: 200px;
  min-height: 148px;
  background: var(--ld-verde-profundo);
  border-radius: var(--ld-r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background-image: linear-gradient(rgba(228, 243, 234, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(228, 243, 234, 0.1) 1px, transparent 1px);
  background-size: 24px 24px;
}
.croqui-mapa svg {
  max-width: 100%;
  height: auto;
}
.croqui-arquivo {
  position: absolute;
  bottom: 10px;
  left: 12px;
  font-family: var(--ld-font-mono);
  font-size: 0.6875rem;
  color: #8fc3a8;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
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

/* Identificação do imóvel — cartão chave→valor no cabeçalho, sem serifa e
   em corpo miúdo, no espaço antes ocupado pelo croqui. */
.ident-bloco {
  flex: 0 1 320px;
  min-width: 220px;
}
.ident-lista {
  margin: 0;
  display: grid;
  gap: 6px 0;
}
.ident-item {
  display: grid;
  grid-template-columns: minmax(78px, max-content) 1fr;
  gap: 0 var(--ld-space-sm);
  align-items: baseline;
}
.ident-item dt {
  font-family: var(--ld-font-sans);
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ld-tinta-suave);
}
.ident-item dd {
  margin: 0;
  font-family: var(--ld-font-sans);
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--ld-tinta);
  overflow-wrap: break-word;
}

/* Rótulo de seção — sem numeração, sem serifa, discreto como a legenda do
   carimbo. Serve todas as seções do corpo. */
.bloco-titulo {
  margin: 0 0 var(--ld-space-sm);
  font-family: var(--ld-font-sans);
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ld-tinta-suave);
}
.bloco-titulo--destaque {
  color: var(--ld-anil);
}

/* Vértices (esquerda) + croqui (direita) */
.vertices-linha {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ld-space-xl);
  flex-wrap: wrap;
}
.vertices-bloco {
  flex: 1 1 320px;
  min-width: 0;
}
.vertices-corpo {
  margin: 0;
  font-family: var(--ld-font-sans);
  font-size: 0.75rem;
  line-height: 1.55;
  color: var(--ld-tinta);
  white-space: pre-wrap;
  overflow-wrap: break-word;
  font-variant-numeric: tabular-nums;
}
.croqui-mapa--rodape {
  align-self: flex-start;
  margin-left: auto;
}

/* Descrição do perímetro — o destaque cartorial: folha de certidão (papel
   quente) embutida sobre o campo anil de leitura, com serifa itálica. O
   contraste do fundo é o próprio destaque; sem barra lateral. */
.perimetro-bloco {
  margin-top: var(--ld-space-xl);
  padding: var(--ld-space-lg);
  background: var(--ld-certidao-papel);
  border: 1px solid var(--ld-certidao-filete);
  border-radius: var(--ld-r-sm);
  box-shadow: var(--ld-shadow-flutuante);
}
.perimetro-corpo {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-style: italic;
  font-size: 1rem;
  line-height: 1.8;
  color: var(--ld-tinta);
  max-width: 72ch;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  text-wrap: pretty;
}

/* Resumo geométrico e encerramento legal — notas sem serifa, corpo miúdo. */
.nota-bloco {
  margin-top: var(--ld-space-xl);
}
.nota-corpo {
  margin: 0;
  font-family: var(--ld-font-sans);
  font-size: 0.8125rem;
  line-height: 1.65;
  color: var(--ld-tinta-suave);
  max-width: 80ch;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  font-variant-numeric: tabular-nums;
}

.secao {
  border-top: 1px solid var(--ld-filete);
  padding: var(--ld-space-lg) var(--ld-space-xl) var(--ld-space-xl);
  background: var(--ld-certidao-conteudo);
}
.memorial-texto {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-size: 1.0625rem;
  line-height: 1.75;
  max-width: 72ch;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  text-wrap: pretty;
}
.vazio {
  margin: 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
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
  .croqui-mapa {
    width: 100%;
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
  #documento-memorial {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    font-size: 12px;
  }
  #documento-memorial,
  #documento-memorial .secao,
  #documento-memorial .carimbo,
  #documento-memorial .ld-selo,
  #documento-memorial .croqui-mapa,
  #documento-memorial .perimetro-bloco {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  #documento-memorial .prancha-titulo h1 {
    font-size: 20px;
  }
  #documento-memorial .memorial-texto {
    font-size: 12.5px;
  }
  #documento-memorial .perimetro-corpo {
    font-size: 12px;
  }
  #documento-memorial .vertices-corpo {
    font-size: 10px;
  }
  #documento-memorial .nota-corpo,
  #documento-memorial .ident-item dd {
    font-size: 10.5px;
  }
  /* Não fragmentar o destaque cartorial entre páginas. */
  #documento-memorial .perimetro-bloco,
  #documento-memorial .croqui-mapa {
    break-inside: avoid;
  }
}
</style>
