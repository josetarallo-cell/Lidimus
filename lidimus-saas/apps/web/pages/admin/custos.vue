<script setup lang="ts">
useHead({ title: 'Custos — Lidimus' })

const { data: me } = await useFetch('/api/me')
if (!me.value?.isPlatformAdmin) {
  await navigateTo('/dashboard')
}

type ModeloLinha = {
  model: string
  workflow: string
  jobs: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  units: number
  costUsd: number
  costBrl: number
}
type CustoOperacional = {
  id: string
  name: string
  category: string
  amountCents: number
  currency: string
  period: 'mensal' | 'anual' | 'unico'
  active: boolean
  notes: string | null
}
type Resposta = {
  usdBrlRate: number
  models: ModeloLinha[]
  totals: {
    modelCostUsd: number
    modelCostBrl: number
    modelCostUsd30d: number
    modelCostBrl30d: number
    totalTokens: number
  }
  operationalCosts: CustoOperacional[]
}

const { data, refresh } = await useFetch<Resposta>('/api/admin/costs')

// ─── Formatação ───────────────────────────────────────────────────────────────
function num(n: number): string {
  return (n ?? 0).toLocaleString('pt-BR')
}
function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function brlFromReais(v: number): string {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function usd(v: number): string {
  return (v ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 })
}

// ─── Gráfico de tokens por modelo (barras horizontais) ────────────────────────
const modelos = computed(() => data.value?.models ?? [])
const maxTokens = computed(() => Math.max(1, ...modelos.value.map((m) => m.totalTokens)))
function larguraBarra(tok: number): string {
  return `${Math.max(tok > 0 ? 2 : 0, (tok / maxTokens.value) * 100)}%`
}

// ─── Custos operacionais: normalização para custo mensal ──────────────────────
function mensalCents(c: CustoOperacional): number {
  if (!c.active) return 0
  if (c.period === 'mensal') return c.amountCents
  if (c.period === 'anual') return Math.round(c.amountCents / 12)
  return 0 // 'unico' não entra no custo mensal recorrente
}
const custoOperacionalMensal = computed(() =>
  (data.value?.operationalCosts ?? []).reduce((s, c) => s + mensalCents(c), 0),
)
// Custo de modelos nos últimos 30 dias serve de proxy para o mensal.
const custoModelosMensalReais = computed(() => data.value?.totals.modelCostBrl30d ?? 0)
const totalMensalEstimadoReais = computed(
  () => custoModelosMensalReais.value + custoOperacionalMensal.value / 100,
)

const PERIODO_LABEL: Record<string, string> = { mensal: '/mês', anual: '/ano', unico: 'único' }

// ─── Formulário de novo custo ─────────────────────────────────────────────────
const form = ref({ name: '', category: 'hospedagem', valor: '', period: 'mensal' as const, notes: '' })
const salvando = ref(false)
const erro = ref('')

const CATEGORIAS = ['hospedagem', 'impostos', 'salarios', 'ferramentas', 'marketing', 'outros']

async function adicionar() {
  erro.value = ''
  const reais = Number(String(form.value.valor).replace(/\./g, '').replace(',', '.'))
  if (!form.value.name.trim() || !Number.isFinite(reais) || reais < 0) {
    erro.value = 'Preencha nome e um valor válido.'
    return
  }
  salvando.value = true
  try {
    await $fetch('/api/admin/costs', {
      method: 'POST',
      body: {
        name: form.value.name.trim(),
        category: form.value.category,
        amountCents: Math.round(reais * 100),
        period: form.value.period,
        notes: form.value.notes.trim() || undefined,
      },
    })
    form.value = { name: '', category: 'hospedagem', valor: '', period: 'mensal', notes: '' }
    await refresh()
  } catch {
    erro.value = 'Não foi possível salvar.'
  } finally {
    salvando.value = false
  }
}

async function alternarAtivo(c: CustoOperacional) {
  await $fetch(`/api/admin/costs/${c.id}`, { method: 'PATCH', body: { active: !c.active } })
  await refresh()
}
async function remover(c: CustoOperacional) {
  if (!confirm(`Remover "${c.name}"?`)) return
  await $fetch(`/api/admin/costs/${c.id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <div>
    <header class="admin-cabecalho">
      <h1>Custos</h1>
      <p>Consumo de tokens por modelo dos workflows e custos operacionais do negócio.</p>
    </header>

    <AdminNav />

    <!-- Resumo -->
    <div class="indicadores">
      <section class="ld-painel indicador">
        <p class="indicador-rotulo">Custo de modelos (30 dias)</p>
        <p class="indicador-valor">{{ brlFromReais(custoModelosMensalReais) }}</p>
        <p class="indicador-nota">{{ usd(data?.totals.modelCostUsd30d ?? 0) }}</p>
      </section>
      <section class="ld-painel indicador">
        <p class="indicador-rotulo">Custo operacional / mês</p>
        <p class="indicador-valor">{{ brl(custoOperacionalMensal) }}</p>
        <p class="indicador-nota">hospedagem, impostos, salários…</p>
      </section>
      <section class="ld-painel indicador indicador--destaque">
        <p class="indicador-rotulo">Total mensal estimado</p>
        <p class="indicador-valor">{{ brlFromReais(totalMensalEstimadoReais) }}</p>
        <p class="indicador-nota">modelos (30d) + operacional</p>
      </section>
    </div>

    <!-- Gráfico: tokens por modelo -->
    <section class="ld-painel bloco">
      <div class="bloco-cabecalho">
        <h2 class="bloco-titulo">Consumo de tokens por modelo</h2>
        <span class="bloco-sub">{{ num(data?.totals.totalTokens ?? 0) }} tokens no total · câmbio US$1 = R$ {{ (data?.usdBrlRate ?? 0).toLocaleString('pt-BR') }}</span>
      </div>

      <div v-if="modelos.length" class="grafico" role="img" aria-label="Tokens consumidos por modelo">
        <div v-for="m in modelos" :key="m.model + m.workflow" class="grafico-linha">
          <div class="grafico-rotulo">
            <span class="grafico-modelo">{{ m.model }}</span>
            <span class="grafico-wf">{{ m.workflow }}</span>
          </div>
          <div class="grafico-trilho">
            <div class="grafico-barra" :style="{ width: larguraBarra(m.totalTokens) }" />
          </div>
          <span class="grafico-valor">{{ num(m.totalTokens) }}</span>
        </div>
      </div>
      <p v-else class="vazio">
        Ainda não há consumo registrado. Os workflows do n8n passam a alimentar este painel conforme
        emitem <code>usage</code> nos callbacks.
      </p>

      <!-- Detalhamento -->
      <div v-if="modelos.length" class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th scope="col">Modelo</th>
              <th scope="col">Workflow</th>
              <th scope="col" class="th-num">Jobs</th>
              <th scope="col" class="th-num">Tokens entrada</th>
              <th scope="col" class="th-num">Tokens saída</th>
              <th scope="col" class="th-num">Total</th>
              <th scope="col" class="th-num">Custo (US$)</th>
              <th scope="col" class="th-num">Custo (R$)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in modelos" :key="'row-' + m.model + m.workflow">
              <td class="celula-nome">{{ m.model }}</td>
              <td class="celula-suave">{{ m.workflow }}</td>
              <td class="celula-num">{{ num(m.jobs) }}</td>
              <td class="celula-num">{{ num(m.promptTokens) }}</td>
              <td class="celula-num">{{ num(m.completionTokens) }}</td>
              <td class="celula-num">{{ num(m.totalTokens) }}</td>
              <td class="celula-num">{{ usd(m.costUsd) }}</td>
              <td class="celula-num">{{ brlFromReais(m.costBrl) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Custos operacionais -->
    <section class="ld-painel bloco">
      <div class="bloco-cabecalho">
        <h2 class="bloco-titulo">Custos operacionais</h2>
        <span class="bloco-sub">Adicione qualquer custo do negócio — a base é aberta a novos tipos.</span>
      </div>

      <form class="form-custo" @submit.prevent="adicionar">
        <input v-model="form.name" class="ld-input campo-nome" placeholder="Nome (ex.: Hospedagem GCP)" />
        <select v-model="form.category" class="ld-input">
          <option v-for="c in CATEGORIAS" :key="c" :value="c">{{ c }}</option>
        </select>
        <input v-model="form.valor" class="ld-input campo-valor" inputmode="decimal" placeholder="Valor R$" />
        <select v-model="form.period" class="ld-input">
          <option value="mensal">/mês</option>
          <option value="anual">/ano</option>
          <option value="unico">único</option>
        </select>
        <button type="submit" class="ld-btn ld-btn--primary" :disabled="salvando">
          {{ salvando ? 'Salvando…' : 'Adicionar' }}
        </button>
      </form>
      <p v-if="erro" class="ld-erro form-erro" role="alert">{{ erro }}</p>

      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th scope="col">Custo</th>
              <th scope="col">Categoria</th>
              <th scope="col" class="th-num">Valor</th>
              <th scope="col" class="th-num">Equivalente / mês</th>
              <th scope="col" class="th-acao">Ativo</th>
              <th scope="col" class="th-acao"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in data?.operationalCosts" :key="c.id" :class="{ 'linha-inativa': !c.active }">
              <td class="celula-nome">
                {{ c.name }}
                <span v-if="c.notes" class="celula-obs">{{ c.notes }}</span>
              </td>
              <td class="celula-suave">{{ c.category }}</td>
              <td class="celula-num">{{ brl(c.amountCents) }} <span class="celula-periodo">{{ PERIODO_LABEL[c.period] }}</span></td>
              <td class="celula-num">{{ mensalCents(c) ? brl(mensalCents(c)) : '—' }}</td>
              <td class="celula-acao">
                <button type="button" class="chip" :class="c.active ? 'chip--on' : 'chip--off'" @click="alternarAtivo(c)">
                  {{ c.active ? 'Ativo' : 'Inativo' }}
                </button>
              </td>
              <td class="celula-acao">
                <button type="button" class="link-remover" @click="remover(c)">Remover</button>
              </td>
            </tr>
            <tr v-if="!data?.operationalCosts?.length">
              <td colspan="6" class="vazio-celula">Nenhum custo cadastrado ainda.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-cabecalho {
  margin-bottom: var(--ld-space-lg);
}
.admin-cabecalho h1 {
  margin: 0 0 var(--ld-space-xs);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.75rem;
  line-height: 1.2;
}
.admin-cabecalho p {
  margin: 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
}

.indicadores {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--ld-space-lg);
  margin-bottom: var(--ld-space-lg);
}
.indicador {
  padding: var(--ld-space-lg);
}
.indicador--destaque {
  border-color: var(--ld-verde);
}
.indicador-rotulo {
  margin: 0 0 2px;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.indicador-valor {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.625rem;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.indicador-nota {
  margin: 4px 0 0;
  font-size: 0.75rem;
  color: var(--ld-tinta-suave);
}

.bloco {
  padding: 0;
  margin-bottom: var(--ld-space-lg);
}
.bloco-cabecalho {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
}
.bloco-titulo {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}
.bloco-sub {
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}

/* Gráfico */
.grafico {
  padding: var(--ld-space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-md);
}
.grafico-linha {
  display: grid;
  grid-template-columns: minmax(140px, 200px) 1fr auto;
  align-items: center;
  gap: var(--ld-space-md);
}
.grafico-rotulo {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}
.grafico-modelo {
  font-size: 0.875rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.grafico-wf {
  font-size: 0.75rem;
  color: var(--ld-tinta-suave);
}
.grafico-trilho {
  height: 14px;
  background: var(--ld-bancada);
  border-radius: var(--ld-r-sm);
  overflow: hidden;
}
.grafico-barra {
  height: 100%;
  background: var(--ld-verde);
  border-radius: var(--ld-r-sm);
  min-width: 2px;
}
.grafico-valor {
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  color: var(--ld-tinta-suave);
  white-space: nowrap;
}

.vazio {
  margin: 0;
  padding: var(--ld-space-lg);
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}
.vazio code {
  font-family: var(--ld-font-mono, monospace);
  font-size: 0.85em;
}

/* Formulário */
.form-custo {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ld-space-sm);
  padding: var(--ld-space-lg) var(--ld-space-lg) var(--ld-space-sm);
}
.form-custo .ld-input {
  flex: 0 1 auto;
}
.campo-nome {
  flex: 1 1 220px;
}
.campo-valor {
  width: 120px;
}
.form-erro {
  margin: 0;
  padding: 0 var(--ld-space-lg) var(--ld-space-sm);
}

/* Tabelas */
.tabela-rolagem {
  overflow-x: auto;
}
.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
}
.tabela th {
  text-align: left;
  background: var(--ld-bancada);
  color: var(--ld-tinta-suave);
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 10px var(--ld-space-lg);
  border-top: 1px solid var(--ld-filete);
  border-bottom: 1px solid var(--ld-filete);
  white-space: nowrap;
}
.th-num {
  text-align: right;
}
.th-acao {
  text-align: center;
}
.tabela td {
  padding: 12px var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  vertical-align: middle;
}
.tabela tbody tr:last-child td {
  border-bottom: none;
}
.celula-nome {
  font-weight: 500;
}
.celula-obs {
  display: block;
  font-weight: 400;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.celula-suave {
  color: var(--ld-tinta-suave);
}
.celula-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.celula-periodo {
  color: var(--ld-tinta-suave);
  font-size: 0.8125rem;
}
.celula-acao {
  text-align: center;
}
.linha-inativa td {
  opacity: 0.55;
}
.chip {
  border: 1px solid var(--ld-filete);
  background: none;
  border-radius: 999px;
  padding: 3px 12px;
  font-family: var(--ld-font-sans);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
}
.chip--on {
  color: var(--ld-verde-profundo);
  border-color: var(--ld-verde);
  background: var(--ld-verde-selo);
}
.chip--off {
  color: var(--ld-tinta-suave);
}
.link-remover {
  border: none;
  background: none;
  color: var(--ld-ocre);
  font-family: var(--ld-font-sans);
  font-size: 0.875rem;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.vazio-celula {
  text-align: center;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
}
</style>
