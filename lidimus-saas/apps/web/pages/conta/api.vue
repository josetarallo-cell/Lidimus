<script setup lang="ts">
useHead({ title: 'API — Lidimus' })

// A rota recusa quem não é proprietário (403). A tela trata o erro em vez de
// quebrar: quem chegou aqui por link direto merece uma explicação, não um stack.
const { data: dados, error, refresh } = await useFetch('/api/account/api-keys')

const souDono = computed(() => !error.value)
const planoLibera = computed(() => dados.value?.planoLiberaApi === true)

function dataFmt(iso: string | Date | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function dataHoraFmt(iso: string | Date | null): string {
  if (!iso) return 'Nunca usada'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function mensagemDeErro(e: unknown, padrao: string): string {
  return (e as { data?: { message?: string } })?.data?.message ?? padrao
}

const SITUACOES = {
  ativa: 'Ativa',
  revogada: 'Revogada',
  expirada: 'Expirada',
} as const

// ── Emissão ────────────────────────────────────────────────
const nome = ref('')
const ciente = ref(false)
const emitindo = ref(false)
const emissaoErro = ref('')

// O token em claro só existe nesta resposta — nem o servidor sabe qual é depois
// (guarda o SHA-256). Fica em memória da página até o dono sair ou fechar o aviso.
const tokenNovo = ref('')
const copiado = ref(false)

async function emitir() {
  emissaoErro.value = ''
  if (!nome.value.trim()) {
    emissaoErro.value = 'Dê um nome à chave para saber depois qual integração ela atende.'
    return
  }
  emitindo.value = true
  try {
    const criada = await $fetch('/api/account/api-keys', {
      method: 'POST',
      body: { nome: nome.value.trim(), cienteDoConsumo: ciente.value },
    })
    tokenNovo.value = criada.token
    copiado.value = false
    nome.value = ''
    ciente.value = false
    await refresh()
  } catch (e: unknown) {
    emissaoErro.value = mensagemDeErro(e, 'Não foi possível emitir a chave. Tente novamente.')
  } finally {
    emitindo.value = false
  }
}

async function copiar() {
  try {
    await navigator.clipboard.writeText(tokenNovo.value)
    copiado.value = true
  } catch {
    // Navegador sem permissão de área de transferência: o token está na tela e
    // pode ser selecionado à mão. Não vale bloquear o fluxo por isso.
    copiado.value = false
  }
}

// ── Revogação ──────────────────────────────────────────────
const revogando = ref('')
const revogacaoErro = ref('')

async function revogar(id: string, nomeChave: string) {
  if (
    !confirm(
      `Revogar a chave "${nomeChave}"? Qualquer integração que a esteja usando para de funcionar na próxima chamada.`,
    )
  )
    return
  revogacaoErro.value = ''
  revogando.value = id
  try {
    await $fetch(`/api/account/api-keys/${id}`, { method: 'DELETE' })
    await refresh()
  } catch (e: unknown) {
    revogacaoErro.value = mensagemDeErro(e, 'Não foi possível revogar a chave.')
  } finally {
    revogando.value = ''
  }
}
</script>

<template>
  <div>
    <header class="conta-cabecalho">
      <h1>Conta</h1>
    </header>

    <ContaNav />

    <p v-if="!souDono" class="ld-painel bloco aviso-simples">
      As chaves de integração são administradas por quem é proprietário da conta. Fale com essa
      pessoa se a sua equipe precisa integrar o Lidimus a outro sistema.
    </p>

    <template v-else>
      <section class="ld-painel bloco">
        <h2 class="bloco-titulo">Chaves de integração</h2>
        <p class="bloco-texto">
          Uma chave permite que outro sistema — o ERP do escritório, um portal, um script — envie
          matrículas para análise sem passar por esta tela. Como enviar, como acompanhar e o
          formato exato do parecer que volta estão na
          <NuxtLink to="/docs/api" class="link-forte">documentação da API</NuxtLink>; ela é pública,
          então dá para mandar o link direto para quem vai fazer a integração.
        </p>

        <p class="aviso-consumo">
          <strong>Cada análise enviada por uma chave debita créditos do seu plano</strong>, igual às
          feitas aqui no painel. Quem tiver a chave em mãos pode gastar esse saldo em nome da sua
          empresa — compartilhe apenas com quem você autoriza a isso, e acompanhe o consumo em
          <NuxtLink to="/conta/creditos" class="link-forte">Créditos</NuxtLink>.
        </p>
      </section>

      <section v-if="!planoLibera" class="ld-painel bloco">
        <h2 class="bloco-titulo">Disponível no Escritório e no Enterprise</h2>
        <p class="bloco-texto">
          A API faz parte dos planos <strong>Escritório</strong> e <strong>Enterprise</strong>. As
          chaves já emitidas continuam listadas abaixo e podem ser revogadas, mas não autenticam
          mais nenhuma chamada enquanto o plano não incluir a API.
          <NuxtLink to="/conta/assinatura" class="link-forte">Ver planos</NuxtLink>
        </p>
      </section>

      <section v-if="tokenNovo" class="ld-painel bloco bloco--token">
        <h2 class="bloco-titulo">Guarde esta chave agora</h2>
        <p class="token-aviso">
          Ela aparece uma única vez. Não guardamos o valor completo — se perder, será preciso emitir
          outra e revogar esta.
        </p>
        <div class="token-caixa">
          <code class="token-valor">{{ tokenNovo }}</code>
          <button type="button" class="ld-btn ld-btn--secondary btn-linha" @click="copiar">
            {{ copiado ? 'Copiado' : 'Copiar' }}
          </button>
        </div>
        <p class="token-nota">
          Guarde no cofre de senhas da empresa, nunca no código-fonte. As análises feitas com ela
          debitam créditos do seu plano.
        </p>
        <button type="button" class="ld-btn ld-btn--secondary" @click="tokenNovo = ''">
          Já guardei
        </button>
      </section>

      <section v-if="planoLibera" class="ld-painel bloco">
        <h2 class="bloco-titulo">Emitir chave</h2>
        <form class="emitir-form" novalidate @submit.prevent="emitir">
          <label class="ld-campo campo">
            <span class="ld-label">Nome da chave</span>
            <input
              v-model="nome"
              class="ld-input"
              :class="{ 'ld-input--erro': emissaoErro }"
              type="text"
              maxlength="80"
              placeholder="ERP do escritório"
            />
            <span class="campo-dica">
              Serve para você saber qual integração revogar depois. A chave vale por um ano.
            </span>
          </label>

          <label class="ciente">
            <input v-model="ciente" type="checkbox" class="ciente-caixa" />
            <span>
              Entendi que as análises enviadas por esta chave debitam créditos do meu plano, e que
              quem tiver a chave pode consumir esse saldo.
            </span>
          </label>

          <p v-if="emissaoErro" class="ld-erro" role="alert">{{ emissaoErro }}</p>

          <button type="submit" class="ld-btn ld-btn--primary" :disabled="emitindo || !ciente">
            {{ emitindo ? 'Emitindo…' : 'Emitir chave' }}
          </button>
        </form>
      </section>

      <p v-if="revogacaoErro" class="ld-erro acao-erro" role="alert">{{ revogacaoErro }}</p>

      <section class="ld-painel bloco bloco--tabela">
        <h2 class="bloco-titulo">Chaves emitidas</h2>

        <p v-if="!dados?.chaves?.length" class="tabela-vazia">
          Nenhuma chave emitida ainda.
        </p>

        <div v-else class="tabela-rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Chave</th>
                <th scope="col">Último uso</th>
                <th scope="col">Válida até</th>
                <th scope="col">Situação</th>
                <th scope="col"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="chave in dados.chaves" :key="chave.id">
                <td class="celula-nome">{{ chave.name }}</td>
                <td><code class="prefixo">{{ chave.prefix }}…</code></td>
                <td class="celula-data">{{ dataHoraFmt(chave.lastUsedAt) }}</td>
                <td class="celula-data">{{ dataFmt(chave.expiresAt) }}</td>
                <td>
                  <span class="situacao" :class="`situacao--${chave.situacao}`">
                    {{ SITUACOES[chave.situacao] }}
                  </span>
                </td>
                <td class="celula-acao">
                  <button
                    v-if="chave.situacao === 'ativa'"
                    type="button"
                    class="ld-btn ld-btn--secondary btn-linha"
                    :disabled="revogando === chave.id"
                    @click="revogar(chave.id, chave.name)"
                  >
                    {{ revogando === chave.id ? 'Revogando…' : 'Revogar' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
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

.bloco {
  padding: var(--ld-space-lg);
  margin-bottom: var(--ld-space-lg);
}
.bloco-titulo {
  margin: 0 0 var(--ld-space-md);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}
.bloco--tabela {
  padding: 0;
}
.bloco--tabela .bloco-titulo {
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  margin: 0;
}
.bloco-texto {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.55;
  color: var(--ld-tinta-suave);
  max-width: 68ch;
}
.aviso-simples {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.55;
  color: var(--ld-tinta-suave);
  max-width: 68ch;
}
.link-forte {
  color: var(--ld-verde);
  font-weight: 600;
}

/* O consumo compartilhado é a consequência que viaja junto com a chave — fica em
   aviso intermediário (ocre), não em texto de apoio que se lê por cima. */
.aviso-consumo {
  margin: var(--ld-space-md) 0 0;
  padding: var(--ld-space-md);
  border-radius: var(--ld-r-sm);
  background: var(--ld-ocre-selo);
  color: var(--ld-ocre);
  font-size: 0.9375rem;
  line-height: 1.55;
  max-width: 68ch;
}
.aviso-consumo .link-forte {
  color: inherit;
  text-decoration: underline;
}

/* ── Token recém-emitido ─────────────────────────────────── */
.bloco--token {
  border-color: var(--ld-ocre);
}
.token-aviso {
  margin: 0 0 var(--ld-space-md);
  font-size: 0.9375rem;
  line-height: 1.55;
  color: var(--ld-tinta);
  max-width: 68ch;
}
.token-caixa {
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  flex-wrap: wrap;
  padding: var(--ld-space-md);
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: var(--ld-bancada);
}
.token-valor {
  font-family: var(--ld-font-mono);
  font-size: 0.875rem;
  word-break: break-all;
  flex: 1 1 20rem;
}
.token-nota {
  margin: var(--ld-space-md) 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--ld-tinta-suave);
  max-width: 68ch;
}

/* ── Formulário ──────────────────────────────────────────── */
.emitir-form {
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-md);
  align-items: flex-start;
}
.campo {
  width: 100%;
  max-width: 24rem;
}
.campo-dica {
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.ciente {
  display: flex;
  gap: var(--ld-space-sm);
  align-items: flex-start;
  font-size: 0.9375rem;
  line-height: 1.5;
  max-width: 60ch;
  cursor: pointer;
}
.ciente-caixa {
  margin-top: 3px;
  flex-shrink: 0;
}

/* ── Tabela ──────────────────────────────────────────────── */
.tabela-vazia {
  margin: 0;
  padding: var(--ld-space-lg);
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
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
.celula-data {
  color: var(--ld-tinta-suave);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.celula-acao {
  text-align: right;
  white-space: nowrap;
}
.btn-linha {
  padding: 5px 12px;
  font-size: 0.8125rem;
}
.prefixo {
  font-family: var(--ld-font-mono);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.situacao {
  font-size: 0.8125rem;
  white-space: nowrap;
}
.situacao--ativa {
  color: var(--ld-verde-profundo);
  font-weight: 500;
}
.situacao--revogada,
.situacao--expirada {
  color: var(--ld-tinta-suave);
}
.acao-erro {
  margin: 0 0 var(--ld-space-md);
}
</style>
