<script setup lang="ts">
const props = defineProps<{
  title: string
  description: string
  accept: string
  uploading: boolean
  // Custo fixo da análise em créditos (ex.: KML). Para análises cobradas por
  // página, use custoPorPagina + custoBase — o total só é conhecido no servidor,
  // então aqui mostramos a tarifa. Mostrado no rodapé para o usuário decidir com
  // a informação à vista, em vez de descobrir num erro 402.
  custoCreditos?: number
  custoPorPagina?: number
  custoBase?: number
}>()

const { data: creditos } = await useFetch<{ balance: number }>('/api/account/credits', {
  server: false,
})

// Piso de crédito para a checagem de saldo: custo fixo, ou o mínimo de 1 página.
const custoMinimo = computed(() =>
  props.custoPorPagina != null
    ? Math.ceil((props.custoBase ?? 0) + props.custoPorPagina)
    : props.custoCreditos,
)

const saldoInsuficiente = computed(
  () =>
    custoMinimo.value != null &&
    creditos.value != null &&
    creditos.value.balance < custoMinimo.value,
)

// Texto do custo: por página (tarifa) ou fixo. Quando há custo base relevante além
// da tarifa por página, mostramos os dois para não subestimar o total — o piso já
// é "base + 1 página", então uma análise nunca custa só a tarifa por página.
const textoCusto = computed(() => {
  if (props.custoPorPagina != null) {
    const porPag = props.custoPorPagina
    const fmt = porPag.toLocaleString('pt-BR')
    const tarifa = `${fmt} crédito${porPag === 1 ? '' : 's'} por página`
    const base = props.custoBase ?? 0
    if (base > 0) {
      return `Esta análise consome ${base} créditos + ${tarifa}`
    }
    return `Esta análise consome ${tarifa}`
  }
  if (props.custoCreditos != null) {
    return `Esta análise consome ${props.custoCreditos} crédito${props.custoCreditos === 1 ? '' : 's'}`
  }
  return null
})

const emit = defineEmits<{
  (e: 'submit', file: File): void
}>()

const file = ref<File | null>(null)
const dragOver = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  file.value = e.dataTransfer?.files?.[0] ?? null
}

function limpar() {
  file.value = null
  if (inputEl.value) inputEl.value.value = ''
}

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function submit() {
  if (file.value) emit('submit', file.value)
}
</script>

<template>
  <section class="ld-painel envio">
    <header class="envio-cabecalho">
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </header>

    <div
      class="envio-zona"
      :class="{ 'envio-zona--ativa': dragOver, 'envio-zona--pronta': file }"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <template v-if="!file">
        <svg width="22" height="22" viewBox="0 0 28 28" aria-hidden="true" class="envio-losango">
          <polygon points="14,2 26,14 14,26 2,14" fill="none" stroke="currentColor" stroke-width="2" />
          <polygon points="14,9 19,14 14,19 9,14" fill="currentColor" />
        </svg>
        <p class="envio-instrucao">
          Arraste o arquivo aqui ou
          <label class="envio-selecionar">
            clique para selecionar
            <input
              ref="inputEl"
              type="file"
              :accept="accept"
              class="envio-input"
              @change="onFile"
            />
          </label>
        </p>
      </template>
      <template v-else>
        <p class="envio-arquivo">
          {{ file.name }}
          <span class="envio-tamanho">{{ tamanho(file.size) }}</span>
        </p>
        <button type="button" class="envio-trocar" :disabled="uploading" @click="limpar">
          Trocar arquivo
        </button>
      </template>
    </div>

    <!-- Campos extras da análise (ex.: rua de frente no KML), entre a zona e o rodapé -->
    <div v-if="$slots.campos" class="envio-campos">
      <slot name="campos" />
    </div>

    <footer class="envio-rodape">
      <p v-if="textoCusto != null" class="envio-custo" :class="{ 'envio-custo--alerta': saldoInsuficiente }">
        {{ textoCusto }}<template v-if="creditos != null"> · você tem {{ creditos.balance }}</template>.
        <NuxtLink v-if="saldoInsuficiente" to="/conta/assinatura" class="envio-custo-link">
          Ver planos e créditos
        </NuxtLink>
      </p>
      <button
        type="button"
        class="ld-btn ld-btn--primary"
        :disabled="!file || uploading"
        @click="submit"
      >
        <span v-if="uploading" class="ld-spinner" aria-hidden="true" />
        {{ uploading ? 'Enviando…' : 'Enviar para análise' }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.envio-cabecalho {
  padding: var(--ld-space-lg) var(--ld-space-lg) 0;
}
.envio-cabecalho h2 {
  margin: 0 0 var(--ld-space-xs);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}
.envio-cabecalho p {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
  max-width: 60ch;
}

.envio-zona {
  margin: var(--ld-space-lg);
  border: 1px dashed var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: var(--ld-papel);
  padding: var(--ld-space-xl) var(--ld-space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ld-space-md);
  text-align: center;
  transition: border-color var(--ld-dur-estado) var(--ld-ease),
    background var(--ld-dur-estado) var(--ld-ease);
}
.envio-zona--ativa {
  border-color: var(--ld-verde);
  background: var(--ld-verde-selo);
}
.envio-zona--pronta {
  border-style: solid;
  border-color: var(--ld-verde);
}
.envio-losango {
  color: var(--ld-verde);
}
.envio-instrucao {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}
.envio-selecionar {
  color: var(--ld-verde);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.envio-selecionar:hover {
  color: var(--ld-verde-profundo);
}
.envio-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.envio-input:focus-visible + *,
.envio-selecionar:has(.envio-input:focus-visible) {
  outline: 2px solid var(--ld-verde);
  outline-offset: 2px;
}
.envio-arquivo {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.envio-tamanho {
  margin-left: var(--ld-space-sm);
  font-weight: 400;
  color: var(--ld-tinta-suave);
  font-size: 0.875rem;
  white-space: nowrap;
}
.envio-trocar {
  border: none;
  background: none;
  padding: 4px 8px;
  font-family: var(--ld-font-sans);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ld-tinta-suave);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.envio-trocar:hover:not(:disabled) {
  color: var(--ld-tinta);
}
.envio-trocar:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.envio-campos {
  margin: 0 var(--ld-space-lg) var(--ld-space-lg);
}

.envio-rodape {
  border-top: 1px solid var(--ld-filete);
  padding: var(--ld-space-md) var(--ld-space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
}
.envio-custo {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.envio-custo--alerta {
  color: var(--ld-ocre);
}
.envio-custo-link {
  color: var(--ld-verde);
  font-weight: 500;
}
.envio-custo-link:hover {
  color: var(--ld-verde-profundo);
}
.envio-rodape .ld-btn {
  margin-left: auto;
}
</style>
