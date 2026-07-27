<script setup lang="ts">
useHead({ title: 'Créditos — Lidimus' })

const { data: creditos } = await useFetch('/api/account/credits')

// Abaixo do custo da análise mais cara (memorial KML, 50) o usuário pode ser
// surpreendido por um 402 — avisar antes.
const SALDO_BAIXO = 50
const saldoBaixo = computed(() => (creditos.value?.balance ?? 0) < SALDO_BAIXO)

const reasonLabel: Record<string, string> = {
  signup_grant: 'Créditos de boas-vindas',
  purchase: 'Compra de créditos',
  consumption: 'Análise',
  refund: 'Estorno — análise falhou',
  admin_adjustment: 'Ajuste administrativo',
}

const jobTypeLabel: Record<string, string> = {
  matricula: 'matrícula',
  kml: 'memorial KML',
  injection: 'verificação de PDF',
}

type Tx = {
  id: string
  delta: number
  reason: string
  createdAt: string
  jobId: string | null
  jobType: string | null
}

function descricao(tx: Tx): string {
  const base = reasonLabel[tx.reason] ?? tx.reason
  if (tx.jobType && (tx.reason === 'consumption' || tx.reason === 'refund')) {
    return `${base} · ${jobTypeLabel[tx.jobType] ?? tx.jobType}`
  }
  return base
}

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function deltaFmt(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta)
}
</script>

<template>
  <div>
    <header class="conta-cabecalho">
      <h1>Créditos</h1>
    </header>

    <ContaNav />

    <section class="ld-painel saldo">
      <div class="saldo-info">
        <p class="saldo-rotulo">Saldo atual</p>
        <p class="saldo-valor">{{ creditos?.balance ?? 0 }} <span>créditos</span></p>
        <p v-if="saldoBaixo" class="saldo-aviso">
          Saldo baixo — uma análise de memorial consome 50 créditos.
        </p>
      </div>
      <NuxtLink to="/conta/assinatura" class="ld-btn ld-btn--primary">Ver planos e créditos</NuxtLink>
    </section>

    <section class="ld-painel avulso">
      <div class="avulso-info">
        <p class="avulso-rotulo">Créditos avulsos</p>
        <p class="avulso-titulo">Precisa de créditos agora?</p>
        <p class="avulso-texto">
          Compre um pacote avulso por R$ 89 via Pix, sem precisar mudar de plano. Depois de
          confirmado o pagamento, os créditos são adicionados à sua conta.
        </p>
      </div>
      <a
        href="https://www.asaas.com/c/0wglmp28h3nehpto"
        target="_blank"
        rel="noopener noreferrer"
        class="ld-btn ld-btn--secondary"
      >
        Comprar via Pix — R$ 89
      </a>
    </section>

    <section class="ld-painel historico">
      <h2 class="historico-titulo">Histórico</h2>

      <p v-if="!creditos?.transactions?.length" class="historico-vazio">
        Nenhuma movimentação ainda.
      </p>

      <div v-else class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Descrição</th>
              <th scope="col" class="th-delta">Créditos</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tx in (creditos.transactions as Tx[])" :key="tx.id">
              <td class="celula-data">{{ dataFmt(tx.createdAt) }}</td>
              <td>{{ descricao(tx) }}</td>
              <td class="celula-delta" :class="{ 'celula-delta--positivo': tx.delta > 0 }">
                {{ deltaFmt(tx.delta) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.conta-cabecalho {
  margin-bottom: var(--ld-space-lg);
}
.conta-cabecalho h1 {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.75rem;
  line-height: 1.2;
}

.saldo {
  padding: var(--ld-space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-lg);
  flex-wrap: wrap;
  margin-bottom: var(--ld-space-lg);
}
.saldo-rotulo {
  margin: 0 0 2px;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.saldo-valor {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 2rem;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.saldo-valor span {
  font-family: var(--ld-font-sans);
  font-weight: 400;
  font-size: 1rem;
  color: var(--ld-tinta-suave);
}
.saldo-aviso {
  margin: var(--ld-space-xs) 0 0;
  font-size: 0.875rem;
  color: var(--ld-ocre);
}

.avulso {
  padding: var(--ld-space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-lg);
  flex-wrap: wrap;
  margin-bottom: var(--ld-space-lg);
}
.avulso-rotulo {
  margin: 0 0 2px;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.avulso-titulo {
  margin: 0 0 4px;
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.125rem;
  line-height: 1.3;
}
.avulso-texto {
  margin: 0;
  max-width: 46ch;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
  line-height: 1.5;
}

.historico {
  padding: 0;
}
.historico-titulo {
  margin: 0;
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}
.historico-vazio {
  margin: 0;
  padding: var(--ld-space-xl) var(--ld-space-lg);
  text-align: center;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
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
.th-delta {
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
.celula-data {
  color: var(--ld-tinta-suave);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.celula-delta {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.celula-delta--positivo {
  color: var(--ld-verde-profundo);
  font-weight: 500;
}
</style>
