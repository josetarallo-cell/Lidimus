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
  // Envio em lote. Fora dele o componente se comporta exatamente como antes —
  // um arquivo, emit `submit`.
  multiple?: boolean
  maxArquivos?: number
  // 0 a 100 durante o envio; nulo quando não há progresso a mostrar. Só o lote
  // usa, porque só ele demora o bastante para uma barra fazer diferença.
  progresso?: number | null
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
//
// No lote a tarifa é por arquivo, e o total exato continua sendo do servidor: o
// número de páginas de cada PDF só é conhecido lá.
const textoCusto = computed(() => {
  const sufixo = props.multiple && arquivos.value.length > 1 ? ', por arquivo' : ''
  if (props.custoPorPagina != null) {
    const porPag = props.custoPorPagina
    const fmt = porPag.toLocaleString('pt-BR')
    const tarifa = `${fmt} crédito${porPag === 1 ? '' : 's'} por página`
    const base = props.custoBase ?? 0
    if (base > 0) {
      return `Esta análise consome ${base} créditos + ${tarifa}${sufixo}`
    }
    return `Esta análise consome ${tarifa}${sufixo}`
  }
  if (props.custoCreditos != null) {
    return `Esta análise consome ${props.custoCreditos} crédito${props.custoCreditos === 1 ? '' : 's'}${sufixo}`
  }
  return null
})

// Dois eventos em vez de trocar a assinatura de `submit` para File[]: as páginas
// de croqui, memorial e detector continuam com `@submit="onSubmit"` intacto.
const emit = defineEmits<{
  (e: 'submit', file: File): void
  (e: 'submitLote', files: File[]): void
}>()

const arquivos = ref<File[]>([])
const dragOver = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const excedente = ref(0)

const teto = computed(() => (props.multiple ? (props.maxArquivos ?? 10) : 1))

// O servidor continua sendo a autoridade sobre o teto; recusar aqui é só para o
// usuário não subir 30MB para receber um 400.
function acrescentar(novos: File[]) {
  excedente.value = 0
  if (!props.multiple) {
    arquivos.value = novos.slice(0, 1)
    return
  }

  // Mesmo nome e mesmo tamanho é o mesmo arquivo escolhido duas vezes — cobrar
  // duas análises idênticas por um deslize de clique seria indefensável.
  const jaTem = new Set(arquivos.value.map((f) => `${f.name}:${f.size}`))
  const somar = novos.filter((f) => !jaTem.has(`${f.name}:${f.size}`))

  const vagas = teto.value - arquivos.value.length
  if (somar.length > vagas) excedente.value = somar.length - vagas
  arquivos.value = [...arquivos.value, ...somar.slice(0, vagas)]
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  acrescentar(Array.from(input.files ?? []))
  // Zerar o input permite reescolher o mesmo arquivo depois de removê-lo da lista
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  acrescentar(Array.from(e.dataTransfer?.files ?? []))
}

function remover(i: number) {
  arquivos.value = arquivos.value.filter((_, idx) => idx !== i)
  excedente.value = 0
}

function limpar() {
  arquivos.value = []
  excedente.value = 0
  if (inputEl.value) inputEl.value.value = ''
}

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const rotuloBotao = computed(() => {
  if (!props.uploading) {
    return arquivos.value.length > 1
      ? `Enviar ${arquivos.value.length} arquivos para análise`
      : 'Enviar para análise'
  }
  if (props.progresso != null) return `Enviando… ${props.progresso}%`
  return 'Enviando…'
})

function submit() {
  if (arquivos.value.length === 0) return
  if (props.multiple) emit('submitLote', [...arquivos.value])
  else emit('submit', arquivos.value[0])
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
      :class="{ 'envio-zona--ativa': dragOver, 'envio-zona--pronta': arquivos.length > 0 }"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <template v-if="!arquivos.length">
        <svg width="22" height="22" viewBox="0 0 28 28" aria-hidden="true" class="envio-losango">
          <polygon points="14,2 26,14 14,26 2,14" fill="none" stroke="currentColor" stroke-width="2" />
          <polygon points="14,9 19,14 14,19 9,14" fill="currentColor" />
        </svg>
        <p class="envio-instrucao">
          {{ multiple ? 'Arraste os arquivos aqui ou' : 'Arraste o arquivo aqui ou' }}
          <label class="envio-selecionar">
            clique para selecionar
            <input
              ref="inputEl"
              type="file"
              :accept="accept"
              :multiple="multiple"
              class="envio-input"
              @change="onFile"
            />
          </label>
        </p>
        <p v-if="multiple" class="envio-teto">Até {{ teto }} PDFs por envio.</p>
      </template>

      <!-- Envio unitário: o arquivo escolhido e o "trocar", como sempre foi -->
      <template v-else-if="!multiple">
        <p class="envio-arquivo">
          {{ arquivos[0].name }}
          <span class="envio-tamanho">{{ tamanho(arquivos[0].size) }}</span>
        </p>
        <button type="button" class="envio-trocar" :disabled="uploading" @click="limpar">
          Trocar arquivo
        </button>
      </template>

      <!-- Lote: a lista é o estado. Sem ela o usuário não tem como conferir o que
           vai ser cobrado antes de mandar. -->
      <template v-else>
        <ul class="envio-lista">
          <li v-for="(f, i) in arquivos" :key="`${f.name}:${f.size}:${i}`" class="envio-item">
            <span class="envio-item-nome" :title="f.name">{{ f.name }}</span>
            <span class="envio-tamanho">{{ tamanho(f.size) }}</span>
            <button
              type="button"
              class="envio-remover"
              :disabled="uploading"
              :aria-label="`Remover ${f.name}`"
              @click="remover(i)"
            >
              Remover
            </button>
          </li>
        </ul>

        <p class="envio-contagem">
          {{ arquivos.length }} de {{ teto }} arquivos
          <label v-if="arquivos.length < teto" class="envio-selecionar">
            · adicionar mais
            <input
              ref="inputEl"
              type="file"
              :accept="accept"
              multiple
              class="envio-input"
              @change="onFile"
            />
          </label>
          <button type="button" class="envio-trocar" :disabled="uploading" @click="limpar">
            Limpar
          </button>
        </p>

        <p v-if="excedente" class="envio-excedente" role="status">
          {{ excedente }} arquivo{{ excedente === 1 ? '' : 's' }} não {{ excedente === 1 ? 'coube' : 'couberam' }}
          no limite de {{ teto }} — envie {{ excedente === 1 ? 'ele' : 'eles' }} num segundo lote.
        </p>
      </template>
    </div>

    <div v-if="uploading && progresso != null" class="envio-progresso">
      <div
        class="envio-progresso-barra"
        role="progressbar"
        :aria-valuenow="progresso"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Progresso do envio"
      >
        <span class="envio-progresso-preenchida" :style="{ transform: `scaleX(${progresso / 100})` }" />
      </div>
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
        :disabled="!arquivos.length || uploading"
        @click="submit"
      >
        <span v-if="uploading" class="ld-spinner" aria-hidden="true" />
        {{ rotuloBotao }}
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

.envio-teto {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}

/* Lista do lote: alinhada à esquerda dentro da zona centralizada — nome de
   arquivo é texto de leitura, não legenda */
.envio-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  text-align: left;
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: var(--ld-folha);
}
.envio-item {
  display: flex;
  align-items: baseline;
  gap: var(--ld-space-sm);
  padding: 8px 12px;
  border-bottom: 1px solid var(--ld-filete);
}
.envio-item:last-child {
  border-bottom: none;
}
.envio-item-nome {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  font-weight: 500;
}
.envio-item .envio-tamanho {
  margin-left: 0;
}
.envio-remover {
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 2px 4px;
  font-family: var(--ld-font-sans);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.envio-remover:hover:not(:disabled) {
  color: var(--ld-carimbo-tinta);
}
.envio-remover:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.envio-contagem {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  margin: 0;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.envio-contagem .envio-trocar {
  padding: 0 4px;
  font-size: 0.8125rem;
}

.envio-excedente {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--ld-ocre);
  max-width: 48ch;
}

/* Barra de progresso: só o lote a usa, e só enquanto os bytes sobem. Depois do
   último byte o servidor ainda conta páginas e debita, então ela para em 100%
   com o botão ainda em "Enviando…" — o spinner cobre essa janela. */
.envio-progresso {
  padding: 0 var(--ld-space-lg) var(--ld-space-md);
}
.envio-progresso-barra {
  height: 4px;
  border-radius: 2px;
  background: var(--ld-bancada);
  overflow: hidden;
}
/* scaleX e não width: a barra atualiza dezenas de vezes por segundo durante o
   envio, e animar largura recalcularia layout a cada quadro */
.envio-progresso-preenchida {
  display: block;
  height: 100%;
  width: 100%;
  transform-origin: left center;
  background: var(--ld-verde);
  transition: transform 120ms var(--ld-ease);
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
