<script setup lang="ts">
// A tela de espera das quatro ferramentas.
//
// A espera é longa de verdade — a mediana de uma matrícula é de quase três
// minutos, e o p90 passa de quatro e meio. Uma barra cinza pulsando nesse tempo
// lê como sistema travado, e o usuário recarrega a página (ou desiste). A tela
// responde às três perguntas de quem espera, sem inventar percentual:
//
//   • o que está acontecendo agora  → título da etapa + microtexto rotativo
//   • há quanto tempo               → cronômetro
//   • quanto ainda falta            → a estimativa medida, e o aviso quando passa
//
// E a cada etapa que fecha há uma recompensa visível: o visto carimba na régua e
// o painel confirma a etapa vencida antes de anunciar a próxima.
const props = withDefaults(
  defineProps<{
    /** O job em acompanhamento; `null` no primeiro paint, antes do SSE responder */
    job: Record<string, any> | null
    /** Etapas do pipeline; vazio nas ferramentas de etapa única */
    etapas?: readonly { key: string; label: string }[]
    /** stage → título do painel. A chave '_' atende quem não tem etapa. */
    titulos: Record<string, string>
    /** stage → microtextos que se revezam. Mesma convenção de chave. */
    mensagens: Record<string, string[]>
    /** Texto já lido do documento, quando existe: vira o fundo da cena */
    texto?: string | null
    /** "de 2 a 5 minutos" — medida, não chutada. Ausente = sem a linha. */
    estimativa?: string | null
    /** Segundos até avisar que está demorando mais que o normal */
    limiteAtraso?: number
    rotulo?: string
  }>(),
  {
    etapas: () => [],
    texto: null,
    estimativa: null,
    limiteAtraso: 0,
    rotulo: 'Etapas',
  },
)

const CHAVE_PADRAO = '_'
const INTERVALO_MENSAGEM = 4000
const DURACAO_CONFIRMACAO = 1900
// Cronômetro só depois de 10s: em job de 4 segundos (o detector fecha nesse
// tempo) um contador piscando na tela é ruído, não informação.
const PISO_RELOGIO = 10

const stage = computed(() => (props.job?.stage as string | undefined) ?? null)

const indice = computed(() => {
  if (!props.etapas.length) return 0
  const i = props.etapas.findIndex((e) => e.key === stage.value)
  return i === -1 ? 0 : i
})

// Chave de consulta dos textos: a etapa corrente, ou o padrão de quem não tem
const chave = computed(() => {
  const s = stage.value ?? props.etapas[indice.value]?.key
  if (s && (props.titulos[s] || props.mensagens[s])) return s
  return CHAVE_PADRAO
})

const titulo = computed(() => props.titulos[chave.value] ?? props.titulos[CHAVE_PADRAO] ?? 'Processando')
const mensagens = computed(() => props.mensagens[chave.value] ?? props.mensagens[CHAVE_PADRAO] ?? [])

// ─── Microtexto rotativo ─────────────────────────────────────────────────────
const iMensagem = ref(0)
const mensagem = computed(() => mensagens.value[iMensagem.value % (mensagens.value.length || 1)] ?? '')
let giro: ReturnType<typeof setInterval> | null = null

// ─── Confirmação da etapa vencida (o carimbo) ────────────────────────────────
const confirmacao = ref<string | null>(null)
const carimbando = ref<number | null>(null)
let carimbo: ReturnType<typeof setTimeout> | null = null

watch(stage, (novo, antigo) => {
  iMensagem.value = 0
  if (!antigo || novo === antigo || !props.etapas.length) return

  const anterior = props.etapas.findIndex((e) => e.key === antigo)
  if (anterior === -1) return

  confirmacao.value = `${props.etapas[anterior].label} concluída`
  carimbando.value = anterior
  if (carimbo) clearTimeout(carimbo)
  carimbo = setTimeout(() => {
    confirmacao.value = null
    carimbando.value = null
  }, DURACAO_CONFIRMACAO)
})

// ─── Cronômetro ──────────────────────────────────────────────────────────────
const criadoEm = computed(() => (props.job?.createdAt as string | undefined) ?? null)
const { segundos } = useTempoDecorrido(criadoEm)

const relogio = computed(() => (segundos.value >= PISO_RELOGIO ? formatarDecorrido(segundos.value) : null))
const atrasado = computed(() => props.limiteAtraso > 0 && segundos.value > props.limiteAtraso)

// ─── Anúncio para leitor de tela ─────────────────────────────────────────────
// Só a virada de etapa é anunciada. O cronômetro e o microtexto ficam de fora
// (aria-hidden): num aria-live, um contador de segundo em segundo transforma a
// espera num leitor de tela falando sem parar.
const anuncio = computed(() => {
  if (!props.job) return 'Preparando a análise.'
  if (!props.etapas.length) return `${titulo.value}.`
  return `Etapa ${indice.value + 1} de ${props.etapas.length}: ${props.etapas[indice.value]?.label ?? titulo.value}.`
})

onMounted(() => {
  giro = setInterval(() => {
    iMensagem.value += 1
  }, INTERVALO_MENSAGEM)
})

onUnmounted(() => {
  if (giro) clearInterval(giro)
  if (carimbo) clearTimeout(carimbo)
})
</script>

<template>
  <div class="processando print-hidden">
    <EtapasPipeline
      v-if="job && etapas.length"
      class="processando-etapas"
      :etapas="etapas"
      :indice="indice"
      :carimbando="carimbando"
      :rotulo="rotulo"
    />

    <CenaLeitura :texto="texto">
      <div class="painel">
        <span class="painel-glifo" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="30" height="30">
            <rect
              x="5"
              y="3"
              width="22"
              height="26"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            />
            <g class="painel-glifo-linhas" stroke="currentColor" stroke-width="2">
              <path d="M9 10h14" />
              <path d="M9 16h14" />
              <path d="M9 22h9" />
            </g>
          </svg>
        </span>

        <p v-if="job && etapas.length" class="painel-kicker cond">
          Etapa {{ indice + 1 }} de {{ etapas.length }}
        </p>
        <p v-else-if="!job" class="painel-kicker cond">Na fila</p>

        <h2 class="painel-titulo">{{ job ? titulo : 'Preparando a análise' }}</h2>

        <p v-if="confirmacao" class="painel-confirmacao" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 12 12">
            <path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
          {{ confirmacao }}
        </p>
        <p v-else-if="mensagem" :key="mensagem" class="painel-mensagem" aria-hidden="true">
          {{ mensagem }}
        </p>

        <p v-if="relogio || estimativa" class="painel-relogio mono" aria-hidden="true">
          <template v-if="relogio">{{ relogio }}</template>
          <template v-if="relogio && (estimativa || atrasado)"> · </template>
          <template v-if="atrasado">está levando mais que o normal</template>
          <template v-else-if="estimativa">costuma levar {{ estimativa }}</template>
        </p>

        <p class="painel-nota">Esta página atualiza sozinha — não é preciso recarregar.</p>
      </div>
    </CenaLeitura>

    <p class="sr-only" aria-live="polite">{{ anuncio }}</p>
  </div>
</template>

<style scoped>
.processando-etapas {
  margin-bottom: var(--space-md);
}

/* O painel é o cartaz da espera: folha, régua de 2px e a sombra sólida do
   sistema. Repousa no centro da folha, mas o texto dentro dele é rente à
   esquerda (A Regra do Alinhamento à Esquerda). */
.painel {
  width: min(30rem, 100%);
  padding: var(--space-lg);
  background: var(--color-folha);
  border: var(--rule) solid var(--color-text);
  box-shadow: var(--shadow-cartaz-curto);
  font-family: var(--font-body);
  text-align: left;
}

.painel-glifo {
  display: block;
  margin-bottom: var(--space-sm);
  color: var(--color-accent);
}
/* As linhas do documento se desenham em sequência, sem parar: é o sinal mais
   barato de "continua trabalhando" que a tela tem */
.painel-glifo-linhas path {
  stroke-dasharray: 16;
  stroke-dashoffset: 16;
  animation: painel-escrever 2.4s var(--motion-ease) infinite;
}
.painel-glifo-linhas path:nth-child(2) {
  animation-delay: 0.25s;
}
.painel-glifo-linhas path:nth-child(3) {
  animation-delay: 0.5s;
}

.painel-kicker {
  margin: 0 0 var(--space-xs);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent-700);
}

.painel-titulo {
  margin: 0 0 var(--space-sm);
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
  color: var(--color-text);
}

/* Linha viva: troca a cada quatro segundos, dizendo o que o pipeline faz agora.
   `:key` no template remonta o nó, e a entrada roda de novo a cada troca. */
.painel-mensagem,
.painel-confirmacao {
  margin: 0 0 var(--space-md);
  min-height: 1.5em;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: color-mix(in srgb, var(--color-text) 72%, transparent);
  animation: painel-entrar var(--motion-dur-superficie) var(--motion-ease);
}
.painel-confirmacao {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: var(--color-text);
}

.painel-relogio {
  margin: 0 0 var(--space-sm);
  padding-top: var(--space-sm);
  border-top: var(--rule-fina) solid var(--color-divider);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--color-text) 65%, transparent);
}

.painel-nota {
  margin: 0;
  font-size: 0.8125rem;
  color: color-mix(in srgb, var(--color-text) 55%, transparent);
}

@keyframes painel-escrever {
  0% {
    stroke-dashoffset: 16;
  }
  40%,
  75% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: -16;
  }
}

@keyframes painel-entrar {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .painel-glifo-linhas path {
    animation: none;
    stroke-dashoffset: 0;
  }
  .painel-mensagem,
  .painel-confirmacao {
    animation: none;
  }
}

@media (max-width: 640px) {
  .painel {
    padding: var(--space-md);
  }
  .painel-titulo {
    font-size: 1.25rem;
  }
}
</style>
