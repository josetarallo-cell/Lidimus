<script setup lang="ts">
useHead({ title: 'Assinatura — Lidimus' })

// A aba já não aparece para membro e leitor, mas a URL é adivinhável — e o
// /api/account/subscription abaixo responderia 403 e quebraria a página.
// Manda de volta para Créditos, que é o que essas pessoas podem ver.
const { data: me } = await useFetch('/api/me')
if (me.value && !me.value.donoDaOrg) {
  await navigateTo('/conta/creditos')
}

const { data: assinaturaData, refresh: refreshAssinatura } = await useFetch('/api/account/subscription')
const { data: planos } = await useFetch('/api/billing/plans')

// Cancelada conta como "sem assinatura": o usuário vê a grade de planos e assina de novo
const assinatura = computed(() => {
  const sub = assinaturaData.value?.subscription
  return sub && sub.status !== 'canceled' ? sub : null
})

const statusSelo: Record<string, { classe: string; texto: string }> = {
  trialing: { classe: 'ld-selo--neutro', texto: 'Período de teste' },
  active: { classe: 'ld-selo--verde', texto: 'Ativa' },
  past_due: { classe: 'ld-selo--ocre', texto: 'Pagamento pendente' },
  canceled: { classe: 'ld-selo--neutro', texto: 'Cancelada' },
}

const ciclo = ref<'mensal' | 'anual'>('mensal')

// Preço com centavos só quando existem — R$ 29,90 e R$ 197, nunca "R$ 197,00".
// O espaço é inquebrável: "R$" nunca fica sozinho no fim da linha.
function precoFmt(cents: number): string {
  const valor = cents / 100
  const opts = Number.isInteger(valor) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  return 'R$\u00A0' + valor.toLocaleString('pt-BR', opts)
}

// Desconto do anual (2 meses), calculado sobre o mensal — mesma conta da página pública
function economiaAnual(plano: { monthlyPriceCents: number; annualPriceCents: number }) {
  const cheio = plano.monthlyPriceCents * 12
  const eco = cheio - plano.annualPriceCents
  if (eco <= 0) return null
  return { cheio: precoFmt(cheio), eco: precoFmt(eco), pct: Math.round((eco / cheio) * 100) }
}

// Volume acima do Escritório é contrato — não tem checkout self-service
const enterpriseMailto =
  'mailto:jose.tarallo@gmail.com?subject=Lidimus%20Enterprise%20%E2%80%94%20contato%20comercial' +
  '&body=Ol%C3%A1%2C%20tenho%20interesse%20no%20plano%20Enterprise%20do%20Lidimus.%0AEscrit%C3%B3rio%2Fempresa%3A%20%0AVolume%20estimado%20de%20documentos%2Fm%C3%AAs%3A%20'

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

const carregando = ref('')
const erro = ref('')

// Retorno do checkout do Stripe (?checkout=sucesso|cancelado)
const route = useRoute()
const checkoutRetorno = computed(() => route.query.checkout as string | undefined)

// Assinar: cria uma Checkout Session no Stripe e redireciona
async function assinar(planId: string) {
  erro.value = ''
  carregando.value = planId
  try {
    const { url } = await $fetch<{ url: string }>('/api/billing/checkout', {
      method: 'POST',
      body: { planId, cycle: ciclo.value },
    })
    window.location.href = url
  } catch {
    erro.value = 'Não foi possível iniciar o pagamento. Tente novamente.'
    carregando.value = ''
  }
}

// Gerenciar: abre o Customer Portal do Stripe (cartão, cancelamento, faturas)
async function gerenciar() {
  erro.value = ''
  carregando.value = 'portal'
  try {
    const { url } = await $fetch<{ url: string }>('/api/billing/portal', { method: 'POST' })
    window.location.href = url
  } catch {
    erro.value = 'Não foi possível abrir o portal de gestão. Tente novamente.'
    carregando.value = ''
  }
}

// ── Migração de plano ──────────────────────────────────────────────────────
const alterandoPlano = ref(false)
const mudancaOk = ref('')

const outrosPlanos = computed(() => {
  if (!planos.value || !assinatura.value) return []
  // Sob contrato fica de fora: a troca passa pelo Stripe, e o servidor recusa
  // esses planos — oferecer o botão seria oferecer um 403.
  return planos.value.filter(
    (p) => p.name !== assinatura.value!.planName && !p.features?.sobContrato,
  )
})

function ehUpgrade(plano: { monthlyPriceCents: number }): boolean {
  return plano.monthlyPriceCents > (assinatura.value?.monthlyPriceCents ?? 0)
}

async function mudarPlano(plano: { id: string; name: string; monthlyPriceCents: number }) {
  const upgrade = ehUpgrade(plano)
  const aviso = upgrade
    ? `Mudar para o ${plano.name} agora? A diferença proporcional do ciclo é cobrada no cartão e os créditos adicionais entram na hora.`
    : `Mudar para o ${plano.name}? A mudança vale a partir da próxima renovação — você mantém o preço e os créditos já pagos até lá.`
  if (!confirm(aviso)) return

  erro.value = ''
  mudancaOk.value = ''
  carregando.value = plano.id
  try {
    const resp = await $fetch<{ change: string; planName: string; effective: string }>(
      '/api/billing/change-plan',
      { method: 'POST', body: { planId: plano.id } },
    )
    mudancaOk.value =
      resp.effective === 'agora'
        ? `Plano alterado para ${resp.planName}. Os créditos adicionais já estão no seu saldo.`
        : `Plano alterado para ${resp.planName} a partir da próxima renovação.`
    alterandoPlano.value = false
    await refreshAssinatura()
  } catch (e: unknown) {
    erro.value =
      (e as { data?: { statusMessage?: string } })?.data?.statusMessage ??
      'Não foi possível alterar o plano. Tente novamente.'
  } finally {
    carregando.value = ''
  }
}
</script>

<template>
  <div>
    <header class="conta-cabecalho">
      <h1>Assinatura</h1>
    </header>

    <ContaNav />

    <p v-if="erro" class="erro" role="alert">{{ erro }}</p>

    <p v-if="checkoutRetorno === 'sucesso'" class="retorno retorno--ok" role="status">
      Pagamento confirmado. A assinatura e os créditos aparecem aqui em instantes.
    </p>
    <p v-else-if="checkoutRetorno === 'cancelado'" class="retorno" role="status">
      Pagamento cancelado — nenhuma cobrança foi feita.
    </p>

    <p v-if="mudancaOk" class="retorno retorno--ok" role="status">{{ mudancaOk }}</p>

    <template v-if="assinatura">
      <section class="ld-painel atual">
        <div class="atual-info">
          <p class="atual-rotulo">Plano atual</p>
          <p class="atual-plano">{{ assinatura.planName }}</p>
          <p class="atual-preco">
            <span>{{ precoFmt(assinatura.priceCents ?? assinatura.monthlyPriceCents) }}</span>
            {{ assinatura.cycle === 'anual' ? '/ano' : '/mês' }}
          </p>
          <p class="atual-detalhe">
            <span class="ld-selo" :class="statusSelo[assinatura.status]?.classe">
              {{ statusSelo[assinatura.status]?.texto ?? assinatura.status }}
            </span>
            <span v-if="assinatura.currentPeriodEnd" class="atual-renovacao">
              Próxima cobrança em {{ dataFmt(assinatura.currentPeriodEnd) }}
            </span>
          </p>
          <p class="atual-creditos">{{ assinatura.creditsPerCycle.toLocaleString('pt-BR') }} créditos por ciclo</p>
          <ul v-if="assinatura.features?.specs?.length" class="atual-specs">
            <li v-for="spec in assinatura.features.specs" :key="spec">{{ spec }}</li>
          </ul>
        </div>
        <div class="atual-acoes">
          <button
            type="button"
            class="ld-btn ld-btn--primary"
            :aria-expanded="alterandoPlano"
            @click="alterandoPlano = !alterandoPlano"
          >
            Alterar plano
          </button>
          <button
            type="button"
            class="ld-btn ld-btn--secondary"
            :disabled="carregando === 'portal'"
            @click="gerenciar"
          >
            {{ carregando === 'portal' ? 'Abrindo…' : 'Gerenciar assinatura' }}
          </button>
        </div>
      </section>

      <section v-if="alterandoPlano" class="ld-painel migracao">
        <h2 class="migracao-titulo">Alterar plano</h2>
        <p class="migracao-regras">
          <strong>Upgrade</strong> vale na hora: a diferença proporcional do ciclo é cobrada no
          cartão e os créditos adicionais entram imediatamente.
          <strong>Downgrade</strong> vale na próxima renovação: você mantém o preço e os créditos
          já pagos até lá, sem cobrança nem estorno.
        </p>
        <div class="migracao-opcoes">
          <article v-for="plano in outrosPlanos" :key="plano.id" class="migracao-opcao">
            <div class="migracao-opcao-info">
              <p class="migracao-opcao-nome">
                {{ plano.name }}
                <span class="ld-selo" :class="ehUpgrade(plano) ? 'ld-selo--verde' : 'ld-selo--neutro'">
                  {{ ehUpgrade(plano) ? 'Upgrade' : 'Downgrade' }}
                </span>
              </p>
              <p class="migracao-opcao-detalhe">
                {{ precoFmt(plano.monthlyPriceCents) }}/mês ·
                {{ plano.creditsPerCycle.toLocaleString('pt-BR') }} créditos/mês
              </p>
              <p v-if="plano.features?.specs?.length" class="migracao-opcao-specs">
                {{ plano.features.specs.join(' · ') }}
              </p>
            </div>
            <button
              type="button"
              class="ld-btn ld-btn--sm"
              :class="ehUpgrade(plano) ? 'ld-btn--primary' : 'ld-btn--secondary'"
              :disabled="carregando === plano.id"
              @click="mudarPlano(plano)"
            >
              {{ carregando === plano.id ? 'Alterando…' : `Mudar para ${plano.name}` }}
            </button>
          </article>
        </div>
      </section>
    </template>

    <section v-else>
      <div class="escolha-cabecalho">
        <p class="escolha-texto">
          Nenhuma assinatura ativa. Assine um plano para receber créditos todo ciclo.
        </p>
        <div class="ciclo" role="group" aria-label="Ciclo de cobrança">
          <button
            type="button"
            class="ciclo-opcao"
            :class="{ 'ciclo-opcao--ativa': ciclo === 'mensal' }"
            :aria-pressed="ciclo === 'mensal'"
            @click="ciclo = 'mensal'"
          >
            Mensal
          </button>
          <button
            type="button"
            class="ciclo-opcao"
            :class="{ 'ciclo-opcao--ativa': ciclo === 'anual' }"
            :aria-pressed="ciclo === 'anual'"
            @click="ciclo = 'anual'"
          >
            Anual
          </button>
        </div>
      </div>

      <div class="planos-grade">
        <article
          v-for="plano in planos"
          :key="plano.id"
          class="ld-painel plano"
          :class="{ 'plano--destaque': plano.features?.destaque }"
        >
          <!-- As faixas abaixo são sempre renderizadas, mesmo vazias: é o que
               permite ao subgrid alinhar preço, franquia e CTA entre os cards -->
          <div class="plano-faixa-selo">
            <span v-if="plano.features?.destaque" class="ld-selo ld-selo--verde">Mais popular</span>
          </div>
          <h2 class="plano-nome">{{ plano.name }}</h2>
          <p class="plano-resumo">{{ plano.features?.resumo }}</p>
          <div class="plano-preco-bloco">
            <!-- Enterprise não tem preço de tabela: mostrar "R$ 0,00" seria
                 mentira, e mostrar um valor inventado, pior. -->
            <p v-if="plano.features?.sobContrato" class="plano-preco plano-preco--contrato">
              <span>Sob contrato</span>
            </p>
            <template v-else>
              <p class="plano-preco">
                <span>{{ precoFmt(ciclo === 'anual' ? plano.annualPriceCents : plano.monthlyPriceCents) }}</span>
                {{ ciclo === 'anual' ? '/ano' : '/mês' }}
              </p>
              <p v-if="ciclo === 'anual' && economiaAnual(plano)" class="plano-economia">
                De {{ economiaAnual(plano)!.cheio }} — economize {{ economiaAnual(plano)!.eco }}
                ({{ economiaAnual(plano)!.pct }}%)
              </p>
            </template>
          </div>
          <ul v-if="plano.features?.specs?.length" class="plano-specs">
            <li v-for="spec in plano.features.specs" :key="spec">{{ spec }}</li>
          </ul>
          <p v-else class="plano-usuarios">
            {{ plano.maxUsers === 1 ? '1 usuário' : `Até ${plano.maxUsers} usuários` }}
          </p>
          <p v-if="plano.features?.sobContrato" class="plano-creditos">Volume sob contrato</p>
          <p v-else class="plano-creditos">
            {{ plano.creditsPerCycle.toLocaleString('pt-BR') }} créditos / mês
          </p>

          <!-- Sob contrato não passa pelo checkout: o servidor recusa esse
               planId, e um botão "Assinar" só levaria a um 403. -->
          <a v-if="plano.features?.sobContrato" :href="enterpriseMailto" class="ld-btn ld-btn--secondary plano-cta">
            Falar com o comercial
          </a>
          <button
            v-else
            type="button"
            class="ld-btn plano-cta"
            :class="plano.features?.destaque ? 'ld-btn--primary' : 'ld-btn--secondary'"
            :disabled="carregando === plano.id"
            @click="assinar(plano.id)"
          >
            {{ carregando === plano.id ? 'Redirecionando…' : `Assinar ${plano.name}` }}
          </button>
        </article>
      </div>

      <p class="planos-nota">
        A franquia de cada plano é debitada em créditos, na medida do documento: uma matrícula de
        20 páginas consome 243 créditos e um croqui, 57. Documento menor consome menos — e rende
        mais análises do que a franquia anunciada.
      </p>

      <p class="planos-contato">
        Volume acima do Escritório, jurídico dedicado ou contrato anual?
        <a :href="enterpriseMailto">Fale com o comercial</a>.
      </p>
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

.erro {
  margin: 0 0 var(--ld-space-md);
  font-size: 0.875rem;
  color: var(--ld-carimbo-tinta);
}

.retorno {
  margin: 0 0 var(--ld-space-md);
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: var(--ld-folha);
  padding: 10px 14px;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.retorno--ok {
  border-color: var(--ld-verde);
  background: var(--ld-verde-selo);
  color: var(--ld-verde-profundo);
}

.atual {
  padding: var(--ld-space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-lg);
  flex-wrap: wrap;
}
.atual-rotulo {
  margin: 0 0 2px;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.atual-plano {
  margin: 0 0 var(--ld-space-xs);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.5rem;
  line-height: 1.2;
}
.atual-preco {
  margin: 0 0 var(--ld-space-xs);
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
}
.atual-preco span {
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.375rem;
  color: var(--ld-tinta);
}
.atual-detalhe {
  margin: 0 0 var(--ld-space-xs);
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  flex-wrap: wrap;
}
.atual-renovacao {
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.atual-creditos {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}
.atual-specs {
  margin: var(--ld-space-xs) 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  gap: var(--ld-space-sm) var(--ld-space-md);
  flex-wrap: wrap;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.atual-specs li {
  position: relative;
  padding-left: 14px;
}
.atual-specs li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 5px;
  height: 5px;
  background: var(--ld-verde);
}
.atual-acoes {
  display: flex;
  gap: var(--ld-space-sm);
  flex-wrap: wrap;
}

.migracao {
  margin-top: var(--ld-space-lg);
  padding: var(--ld-space-lg);
}
.migracao-titulo {
  margin: 0 0 var(--ld-space-xs);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}
.migracao-regras {
  margin: 0 0 var(--ld-space-lg);
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--ld-tinta-suave);
  max-width: 66ch;
}
.migracao-opcoes {
  display: flex;
  flex-direction: column;
}
.migracao-opcao {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  padding: var(--ld-space-md) 0;
}
.migracao-opcao + .migracao-opcao {
  border-top: 1px solid var(--ld-filete);
}
.migracao-opcao-nome {
  margin: 0 0 2px;
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.0625rem;
}
.migracao-opcao-detalhe {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.migracao-opcao-specs {
  margin: 2px 0 0;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
  max-width: 60ch;
}

.escolha-cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  margin-bottom: var(--ld-space-lg);
}
.escolha-texto {
  margin: 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
}
.ciclo {
  display: inline-flex;
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  overflow: hidden;
}
.ciclo-opcao {
  border: none;
  background: var(--ld-folha);
  color: var(--ld-tinta-suave);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 8px 16px;
  cursor: pointer;
  transition: background var(--ld-dur-estado) var(--ld-ease), color var(--ld-dur-estado) var(--ld-ease);
}
.ciclo-opcao + .ciclo-opcao {
  border-left: 1px solid var(--ld-filete);
}
.ciclo-opcao--ativa {
  background: var(--ld-verde);
  color: var(--ld-folha);
}

.planos-grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: var(--ld-space-lg);
  align-items: stretch;
}
.plano {
  padding: var(--ld-space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-xs);
}
/* Grade de preço só compara de verdade se as linhas homólogas ficarem na mesma
   altura em todos os cards — o subgrid herda as 6 faixas da grade externa
   (selo · nome · resumo · preço · franquia · créditos+CTA). Onde não houver
   subgrid, o flex acima segue valendo, apenas sem o alinhamento entre cards. */
@supports (grid-template-rows: subgrid) {
  .plano {
    display: grid;
    grid-row: span 7;
    grid-template-rows: subgrid;
  }
}
.plano--destaque {
  border-color: var(--ld-verde);
}
.plano-faixa-selo {
  margin-bottom: 2px;
}
.plano-nome {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.25rem;
  line-height: 1.25;
}
.plano-resumo {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--ld-tinta-suave);
  text-wrap: pretty;
}
.plano-preco-bloco {
  margin-top: var(--ld-space-xs);
}
.plano-preco {
  margin: 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
}
/* Sem cifra para comparar, o texto ocupa o lugar do número sem imitá-lo */
.plano-preco--contrato span {
  font-size: 1.25rem;
}
.plano-preco span {
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.5rem;
  color: var(--ld-tinta);
}
.plano-economia {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--ld-verde-profundo);
}
.plano-specs {
  margin: var(--ld-space-xs) 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}
.plano-specs li {
  position: relative;
  padding-left: 16px;
}
.plano-specs li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.6em;
  width: 6px;
  height: 6px;
  background: var(--ld-verde);
}
.plano-creditos,
.plano-usuarios {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}
.plano-creditos {
  margin-top: var(--ld-space-sm);
  padding-top: var(--ld-space-sm);
  border-top: 1px solid var(--ld-filete);
  font-size: 0.875rem;
}
/* margin-top: auto encosta o CTA na base — os cards têm alturas de conteúdo
   diferentes e os botões precisam alinhar na mesma linha */
.plano-cta {
  margin-top: auto;
  align-self: flex-start;
}
/* O CTA do plano sob contrato é um link (mailto), não um botão */
a.plano-cta {
  text-decoration: none;
}

.planos-nota,
.planos-contato {
  margin: var(--ld-space-lg) 0 0;
  max-width: 72ch;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ld-tinta-suave);
}
.planos-contato {
  margin-top: var(--ld-space-sm);
}
.planos-contato a {
  color: var(--ld-verde);
  font-weight: 500;
}
.planos-contato a:hover {
  color: var(--ld-verde-profundo);
}
</style>
