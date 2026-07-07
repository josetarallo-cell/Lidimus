<script setup lang="ts">
useHead({ title: 'Faturamento — Lidimus' })

const { data: me } = await useFetch('/api/me')
if (!me.value?.isPlatformAdmin) {
  await navigateTo('/dashboard')
}

const { data: faturamento } = await useFetch('/api/admin/billing')

type PlanoLinha = {
  plan_name: string
  active_count: number
  past_due_count: number
  canceled_count: number
  mrr_cents: number
}

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
</script>

<template>
  <div>
    <header class="admin-cabecalho">
      <h1>Faturamento</h1>
    </header>

    <AdminNav />

    <div class="indicadores">
      <section class="ld-painel indicador">
        <p class="indicador-rotulo">MRR</p>
        <p class="indicador-valor">{{ moeda(faturamento?.totals?.mrr_cents ?? 0) }}</p>
      </section>
      <section class="ld-painel indicador">
        <p class="indicador-rotulo">Assinaturas ativas</p>
        <p class="indicador-valor">{{ faturamento?.totals?.active_count ?? 0 }}</p>
      </section>
      <section class="ld-painel indicador">
        <p class="indicador-rotulo">Canceladas</p>
        <p class="indicador-valor">{{ faturamento?.totals?.canceled_count ?? 0 }}</p>
      </section>
    </div>

    <section class="ld-painel distribuicao">
      <h2 class="distribuicao-titulo">Distribuição por plano</h2>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th scope="col">Plano</th>
              <th scope="col" class="th-num">Ativas</th>
              <th scope="col" class="th-num">Pendentes</th>
              <th scope="col" class="th-num">Canceladas</th>
              <th scope="col" class="th-num">MRR</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="linha in (faturamento?.byPlan as PlanoLinha[])" :key="linha.plan_name">
              <td class="celula-nome">{{ linha.plan_name }}</td>
              <td class="celula-num">{{ linha.active_count }}</td>
              <td class="celula-num">{{ linha.past_due_count }}</td>
              <td class="celula-num">{{ linha.canceled_count }}</td>
              <td class="celula-num">{{ moeda(linha.mrr_cents) }}</td>
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

.indicadores {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ld-space-lg);
  margin-bottom: var(--ld-space-lg);
}
.indicador {
  padding: var(--ld-space-lg);
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
  font-size: 1.75rem;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.distribuicao {
  padding: 0;
}
.distribuicao-titulo {
  margin: 0;
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
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
  font-weight: 500;
}
.celula-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
