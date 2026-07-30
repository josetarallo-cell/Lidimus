<script setup lang="ts">
useHead({ title: 'Clientes — Lidimus' })

const { data: me } = await useFetch('/api/me')
if (!me.value?.isPlatformAdmin) {
  await navigateTo('/dashboard')
}

const { data: clientes, refresh } = await useFetch('/api/admin/clients')

type Cliente = {
  id: string
  name: string
  owner_email: string
  created_at: string
  balance: number
  last_job_at: string | null
  subscription_id: string | null
  subscription_status: string | null
  plan_name: string | null
}

const statusSelo: Record<string, { classe: string; texto: string }> = {
  trialing: { classe: 'ld-selo--neutro', texto: 'Teste' },
  active: { classe: 'ld-selo--verde', texto: 'Ativa' },
  past_due: { classe: 'ld-selo--ocre', texto: 'Pendente' },
  canceled: { classe: 'ld-selo--neutro', texto: 'Cancelada' },
}

function dataFmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

// Concessão de créditos inline: um formulário por vez
const concedendoOrg = ref('')
const concessaoDelta = ref<number | null>(null)
const acaoErro = ref('')
const salvando = ref(false)

function abrirConcessao(orgId: string) {
  concedendoOrg.value = orgId
  concessaoDelta.value = null
  acaoErro.value = ''
}

async function conceder() {
  if (!concessaoDelta.value) return
  salvando.value = true
  acaoErro.value = ''
  try {
    await $fetch(`/api/admin/clients/${concedendoOrg.value}/credits`, {
      method: 'POST',
      body: { delta: concessaoDelta.value },
    })
    concedendoOrg.value = ''
    await refresh()
  } catch {
    acaoErro.value = 'Não foi possível registrar o ajuste.'
  } finally {
    salvando.value = false
  }
}

// Plano de contrato: o Enterprise (e qualquer outro marcado como sobContrato)
// não passa pelo checkout, então quem coloca o cliente nele é o admin daqui.
const { data: planos } = await useFetch('/api/billing/plans')
const planosDeContrato = computed(() => (planos.value ?? []).filter((p) => p.features?.sobContrato))

const aplicandoOrg = ref('')
const planoEscolhido = ref('')
const cicloEscolhido = ref<'mensal' | 'anual'>('mensal')

function abrirPlano(orgId: string) {
  aplicandoOrg.value = orgId
  planoEscolhido.value = planosDeContrato.value[0]?.id ?? ''
  cicloEscolhido.value = 'mensal'
  acaoErro.value = ''
}

async function aplicarPlano() {
  if (!planoEscolhido.value) return
  const plano = planosDeContrato.value.find((p) => p.id === planoEscolhido.value)
  const meses = cicloEscolhido.value === 'anual' ? 12 : 1
  if (
    !confirm(
      `Colocar este cliente no plano ${plano?.name} (${cicloEscolhido.value}) e lançar ` +
        `${((plano?.creditsPerCycle ?? 0) * meses).toLocaleString('pt-BR')} créditos?\n\n` +
        'Esta assinatura não passa pelo Stripe: os créditos do próximo ciclo terão de ser lançados à mão.',
    )
  )
    return

  salvando.value = true
  acaoErro.value = ''
  try {
    await $fetch(`/api/admin/clients/${aplicandoOrg.value}/plan`, {
      method: 'POST',
      body: { planId: planoEscolhido.value, ciclo: cicloEscolhido.value },
    })
    aplicandoOrg.value = ''
    await refresh()
  } catch (e: unknown) {
    acaoErro.value =
      (e as { data?: { message?: string } })?.data?.message ?? 'Não foi possível aplicar o plano.'
  } finally {
    salvando.value = false
  }
}

async function suspender(cliente: Cliente) {
  if (!confirm(`Suspender a assinatura de "${cliente.name}"? A cobrança no Stripe também será cancelada.`)) return
  acaoErro.value = ''
  try {
    await $fetch(`/api/admin/clients/${cliente.id}/suspend`, { method: 'POST' })
    await refresh()
  } catch {
    acaoErro.value = 'Não foi possível suspender a assinatura.'
  }
}
</script>

<template>
  <div>
    <header class="admin-cabecalho">
      <h1>Clientes</h1>
    </header>

    <AdminNav />

    <p v-if="acaoErro" class="acao-erro" role="alert">{{ acaoErro }}</p>

    <section class="ld-painel">
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th scope="col">Organização</th>
              <th scope="col">Plano</th>
              <th scope="col">Assinatura</th>
              <th scope="col" class="th-num">Saldo</th>
              <th scope="col">Último job</th>
              <th scope="col"><span class="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cliente in (clientes as Cliente[])" :key="cliente.id">
              <td>
                <span class="celula-nome">{{ cliente.name }}</span>
                <span class="celula-email">{{ cliente.owner_email }}</span>
              </td>
              <td>{{ cliente.plan_name ?? '—' }}</td>
              <td>
                <span
                  v-if="cliente.subscription_status"
                  class="ld-selo"
                  :class="statusSelo[cliente.subscription_status]?.classe"
                >
                  {{ statusSelo[cliente.subscription_status]?.texto ?? cliente.subscription_status }}
                </span>
                <span v-else class="sem-assinatura">—</span>
              </td>
              <td class="celula-num">{{ cliente.balance }}</td>
              <td class="celula-data">{{ dataFmt(cliente.last_job_at) }}</td>
              <td class="celula-acoes">
                <form
                  v-if="concedendoOrg === cliente.id"
                  class="concessao"
                  @submit.prevent="conceder"
                >
                  <input
                    v-model.number="concessaoDelta"
                    type="number"
                    step="1"
                    required
                    placeholder="+créditos"
                    class="concessao-input"
                    :aria-label="`Créditos a conceder para ${cliente.name} (negativo retira)`"
                  />
                  <button type="submit" class="ld-btn ld-btn--primary ld-btn--sm" :disabled="salvando">
                    OK
                  </button>
                  <button
                    type="button"
                    class="ld-btn ld-btn--ghost ld-btn--sm"
                    @click="concedendoOrg = ''"
                  >
                    Cancelar
                  </button>
                </form>
                <form
                  v-else-if="aplicandoOrg === cliente.id"
                  class="concessao"
                  @submit.prevent="aplicarPlano"
                >
                  <select v-model="planoEscolhido" class="concessao-input" aria-label="Plano de contrato">
                    <option v-for="p in planosDeContrato" :key="p.id" :value="p.id">{{ p.name }}</option>
                  </select>
                  <select v-model="cicloEscolhido" class="concessao-input" aria-label="Ciclo">
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                  <button type="submit" class="ld-btn ld-btn--primary ld-btn--sm" :disabled="salvando">
                    OK
                  </button>
                  <button type="button" class="ld-btn ld-btn--ghost ld-btn--sm" @click="aplicandoOrg = ''">
                    Cancelar
                  </button>
                </form>
                <template v-else>
                  <button
                    type="button"
                    class="ld-btn ld-btn--secondary ld-btn--sm"
                    @click="abrirConcessao(cliente.id)"
                  >
                    Conceder créditos
                  </button>
                  <!-- Só aparece se existir plano sob contrato cadastrado -->
                  <button
                    v-if="planosDeContrato.length"
                    type="button"
                    class="ld-btn ld-btn--ghost ld-btn--sm"
                    @click="abrirPlano(cliente.id)"
                  >
                    Plano de contrato
                  </button>
                  <button
                    v-if="cliente.subscription_status === 'active' || cliente.subscription_status === 'trialing' || cliente.subscription_status === 'past_due'"
                    type="button"
                    class="ld-btn ld-btn--ghost ld-btn--sm"
                    @click="suspender(cliente)"
                  >
                    Suspender
                  </button>
                </template>
              </td>
            </tr>
            <tr v-if="!clientes?.length">
              <td colspan="6" class="celula-vazia">Nenhuma organização ainda.</td>
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
  margin: 0;
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.75rem;
  line-height: 1.2;
}

.acao-erro {
  margin: 0 0 var(--ld-space-md);
  font-size: 0.875rem;
  color: var(--ld-carimbo-tinta);
}

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
  border-bottom: 1px solid var(--ld-filete);
  white-space: nowrap;
}
.th-num {
  text-align: right;
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
  display: block;
  font-weight: 500;
}
.celula-email {
  display: block;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.celula-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.celula-data {
  color: var(--ld-tinta-suave);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.celula-acoes {
  text-align: right;
  white-space: nowrap;
}
.celula-vazia {
  text-align: center;
  color: var(--ld-tinta-suave);
  padding: var(--ld-space-xl) var(--ld-space-lg);
}
.sem-assinatura {
  color: var(--ld-tinta-suave);
}

.concessao {
  display: inline-flex;
  align-items: center;
  gap: var(--ld-space-xs);
}
.concessao-input {
  width: 7rem;
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: var(--ld-folha);
  color: var(--ld-tinta);
  padding: 6px 10px;
  font-size: 0.875rem;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
}
.concessao-input:focus-visible {
  outline: 2px solid var(--ld-verde);
  outline-offset: 1px;
}

</style>
