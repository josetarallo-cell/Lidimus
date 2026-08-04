<script setup lang="ts">
useHead({ title: 'Equipe — Lidimus' })

const { data: equipe, refresh } = await useFetch('/api/account/team')

// Rótulo padrão do nível de acesso. Quando o dono define um cargo próprio
// ("escrevente", "corretor"), é ele que aparece — o nível vira a linha de baixo.
const roleLabel: Record<string, string> = {
  owner: 'Proprietário',
  member: 'Membro',
  reader: 'Somente consulta',
}

const NIVEIS = [
  { valor: 'member', rotulo: 'Membro', ajuda: 'Cria análises e consome créditos da conta.' },
  { valor: 'reader', rotulo: 'Somente consulta', ajuda: 'Abre e baixa análises, mas não cria novas.' },
] as const

function dataFmt(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function mensagemDeErro(e: unknown, padrao: string): string {
  return (e as { data?: { message?: string } })?.data?.message ?? padrao
}

// ── Conta individual ───────────────────────────────────────
// Quem se cadastrou sem informar empresa não tem equipe para administrar: no
// lugar da lista de membros a tela oferece montar uma, quando o plano comporta
// mais de uma pessoa, ou explica que receber um convite é o outro caminho.
const personal = computed(() => equipe.value?.personal === true)

const nomeEquipe = ref('')
const criandoEquipe = ref(false)
const equipeErro = ref('')

async function criarEquipe() {
  equipeErro.value = ''
  if (!nomeEquipe.value.trim()) {
    equipeErro.value = 'Informe o nome da organização.'
    return
  }
  criandoEquipe.value = true
  try {
    await $fetch('/api/account/team/criar', {
      method: 'POST',
      body: { name: nomeEquipe.value.trim() },
    })
    nomeEquipe.value = ''
    // refreshNuxtData e não refresh(): o cabeçalho do layout vive de /api/me e
    // passa a mostrar o nome da organização no lugar do nome da pessoa.
    await refreshNuxtData()
  } catch (e: unknown) {
    equipeErro.value = mensagemDeErro(e, 'Não foi possível criar a equipe. Tente novamente.')
  } finally {
    criandoEquipe.value = false
  }
}

// ── Convite ────────────────────────────────────────────────
const emailConvite = ref('')
const nivelConvite = ref<'member' | 'reader'>('member')
const convidando = ref(false)
const conviteErro = ref('')
const conviteOk = ref('')

// Sem assento livre não adianta abrir o formulário — a tela oferece upgrade.
const lotado = computed(() => {
  const a = equipe.value?.assentos
  return !!a && a.ocupados >= a.limite
})

async function convidar() {
  conviteErro.value = ''
  conviteOk.value = ''
  if (!emailConvite.value.trim()) {
    conviteErro.value = 'Informe o e-mail de quem você quer convidar.'
    return
  }
  convidando.value = true
  try {
    await $fetch('/api/account/team/invites', {
      method: 'POST',
      body: { email: emailConvite.value.trim(), role: nivelConvite.value },
    })
    conviteOk.value = `Convite enviado para ${emailConvite.value.trim()}.`
    emailConvite.value = ''
    nivelConvite.value = 'member'
    await refresh()
  } catch (e: unknown) {
    conviteErro.value = mensagemDeErro(e, 'Não foi possível enviar o convite. Tente novamente.')
  } finally {
    convidando.value = false
  }
}

// ── Cancelar convite / remover membro ──────────────────────
const agindo = ref('')
const acaoErro = ref('')

async function cancelarConvite(id: string, email: string) {
  if (!confirm(`Cancelar o convite enviado para ${email}?`)) return
  acaoErro.value = ''
  agindo.value = id
  try {
    await $fetch(`/api/account/team/invites/${id}`, { method: 'DELETE' })
    await refresh()
  } catch (e: unknown) {
    acaoErro.value = mensagemDeErro(e, 'Não foi possível cancelar o convite.')
  } finally {
    agindo.value = ''
  }
}

async function removerMembro(userId: string, nome: string) {
  if (
    !confirm(
      `Remover ${nome} da equipe? As análises que essa pessoa fez continuam na organização, mas ela perde o acesso.`,
    )
  )
    return
  acaoErro.value = ''
  agindo.value = userId
  try {
    await $fetch(`/api/account/team/members/${userId}`, { method: 'DELETE' })
    await refresh()
  } catch (e: unknown) {
    acaoErro.value = mensagemDeErro(e, 'Não foi possível remover o membro.')
  } finally {
    agindo.value = ''
  }
}

// ── Papel e cargo de um membro ─────────────────────────────
// O cargo é texto livre porque cada escritório nomeia seu pessoal do seu jeito
// — escrevente, secretário, corretor, ajudante. Não oferecemos lista: qualquer
// opção que sugeríssemos seria errada em metade dos cartórios.
const editandoMembro = ref('')
const nivelEdicao = ref<'member' | 'reader'>('member')
const cargoEdicao = ref('')
const salvandoMembro = ref(false)
const membroErro = ref('')

type Membro = { userId: string; role: string; title: string | null }

function abrirEdicaoMembro(m: Membro) {
  editandoMembro.value = m.userId
  nivelEdicao.value = m.role === 'reader' ? 'reader' : 'member'
  cargoEdicao.value = m.title ?? ''
  membroErro.value = ''
}

async function salvarMembro(userId: string) {
  membroErro.value = ''
  salvandoMembro.value = true
  try {
    await $fetch(`/api/account/team/members/${userId}`, {
      method: 'PATCH',
      body: { role: nivelEdicao.value, title: cargoEdicao.value.trim() },
    })
    editandoMembro.value = ''
    await refresh()
  } catch (e: unknown) {
    membroErro.value = mensagemDeErro(e, 'Não foi possível salvar as alterações.')
  } finally {
    salvandoMembro.value = false
  }
}

// ── Nome da organização ────────────────────────────────────
const editandoNome = ref(false)
const nomeNovo = ref('')
const nomeErro = ref('')
const salvandoNome = ref(false)

function abrirEdicaoNome() {
  nomeNovo.value = equipe.value?.orgName ?? ''
  nomeErro.value = ''
  editandoNome.value = true
}

async function salvarNome() {
  nomeErro.value = ''
  if (!nomeNovo.value.trim()) {
    nomeErro.value = 'O nome não pode ficar em branco.'
    return
  }
  salvandoNome.value = true
  try {
    await $fetch('/api/account/team', { method: 'PATCH', body: { name: nomeNovo.value.trim() } })
    editandoNome.value = false
    await refresh()
  } catch (e: unknown) {
    nomeErro.value = mensagemDeErro(e, 'Não foi possível salvar o nome.')
  } finally {
    salvandoNome.value = false
  }
}
</script>

<template>
  <div>
    <header class="conta-cabecalho">
      <h1>Conta</h1>
    </header>

    <ContaNav />

    <!-- ── Conta individual ─────────────────────────────────── -->
    <template v-if="personal">
      <section class="ld-painel bloco">
        <h2 class="bloco-titulo">Conta individual</h2>
        <p class="org-nome">{{ equipe?.orgName }}</p>
        <p class="org-assentos">
          As análises e os créditos são só seus.
          <template v-if="equipe?.assentos.planName"> Plano {{ equipe.assentos.planName }}.</template>
          <template v-else> Você ainda não tem plano.</template>
        </p>
      </section>

      <section v-if="equipe?.souDono" class="ld-painel bloco">
        <h2 class="bloco-titulo">Trabalhar em equipe</h2>

        <template v-if="equipe?.podeCriarEquipe">
          <p class="bloco-intro">
            Dê um nome à sua organização para começar a convidar gente. As análises e os créditos
            que você já tem continuam nesta conta e passam a ser da equipe.
          </p>
          <form class="org-form" novalidate @submit.prevent="criarEquipe">
            <label class="ld-campo campo">
              <span class="ld-label">Nome da organização</span>
              <input
                v-model="nomeEquipe"
                class="ld-input"
                :class="{ 'ld-input--erro': equipeErro }"
                type="text"
                maxlength="120"
                placeholder="Seu escritório, cartório ou razão social"
              />
            </label>
            <p v-if="equipeErro" class="ld-erro" role="alert">{{ equipeErro }}</p>
            <div class="org-form-acoes">
              <button type="submit" class="ld-btn ld-btn--primary" :disabled="criandoEquipe">
                {{ criandoEquipe ? 'Criando…' : 'Criar equipe' }}
              </button>
            </div>
          </form>
        </template>

        <p v-else class="convite-upgrade">
          Seu plano atual é de um usuário só. Os planos <strong>Profissional</strong> (até 3) e
          <strong>Escritório</strong> (até 10) liberam o trabalho em equipe, compartilhando as
          análises e os créditos da mesma assinatura.
          <NuxtLink to="/conta/assinatura" class="convite-upgrade-link">Ver planos</NuxtLink>
        </p>

        <p class="bloco-rodape">
          Você também pode entrar na equipe de outra pessoa: quem administra a conta de lá envia
          um convite para o seu e-mail.
        </p>
      </section>
    </template>

    <!-- ── Organização com equipe ───────────────────────────── -->
    <section v-if="!personal" class="ld-painel bloco">
      <div class="org-topo">
        <div>
          <h2 class="bloco-titulo">Organização</h2>
          <p v-if="!editandoNome" class="org-nome">{{ equipe?.orgName }}</p>
        </div>
        <button
          v-if="equipe?.souDono && !editandoNome"
          type="button"
          class="ld-btn ld-btn--secondary"
          @click="abrirEdicaoNome"
        >
          Renomear
        </button>
      </div>

      <form v-if="editandoNome" class="org-form" @submit.prevent="salvarNome">
        <label class="ld-campo campo">
          <span class="ld-label">Nome da organização</span>
          <input v-model="nomeNovo" class="ld-input" type="text" maxlength="120" />
        </label>
        <p v-if="nomeErro" class="ld-erro" role="alert">{{ nomeErro }}</p>
        <div class="org-form-acoes">
          <button type="submit" class="ld-btn ld-btn--primary" :disabled="salvandoNome">
            {{ salvandoNome ? 'Salvando…' : 'Salvar' }}
          </button>
          <button type="button" class="ld-btn ld-btn--secondary" @click="editandoNome = false">
            Cancelar
          </button>
        </div>
      </form>

      <p class="org-assentos">
        <strong>{{ equipe?.assentos.ocupados }} de {{ equipe?.assentos.limite }}</strong>
        {{ equipe?.assentos.limite === 1 ? 'usuário' : 'usuários' }}
        <template v-if="equipe?.assentos.planName"> — plano {{ equipe.assentos.planName }}</template>
        <template v-if="equipe?.assentos.convitesPendentes">
          ({{ equipe.assentos.convitesPendentes }}
          {{ equipe.assentos.convitesPendentes === 1 ? 'convite pendente' : 'convites pendentes' }})
        </template>
      </p>
    </section>

    <section v-if="equipe?.souDono && !personal" class="ld-painel bloco">
      <h2 class="bloco-titulo">Convidar</h2>

      <p v-if="equipe?.assentos.limite === 1" class="convite-upgrade">
        Seu plano atual é de um usuário só. Os planos <strong>Profissional</strong> (até 3) e
        <strong>Escritório</strong> (até 10) liberam o trabalho em equipe, compartilhando as
        análises e os créditos da mesma assinatura.
        <NuxtLink to="/conta/assinatura" class="convite-upgrade-link">Ver planos</NuxtLink>
      </p>

      <p v-else-if="lotado" class="convite-upgrade">
        Todos os {{ equipe?.assentos.limite }} lugares do plano
        {{ equipe?.assentos.planName }} estão ocupados. Remova um membro ou
        <NuxtLink to="/conta/assinatura" class="convite-upgrade-link">faça upgrade</NuxtLink>
        para convidar mais alguém.
      </p>

      <form v-else class="convite-form" novalidate @submit.prevent="convidar">
        <label class="ld-campo campo">
          <span class="ld-label">E-mail</span>
          <input
            v-model="emailConvite"
            class="ld-input"
            :class="{ 'ld-input--erro': conviteErro }"
            type="email"
            autocomplete="off"
            placeholder="colega@escritorio.com.br"
          />
          <span class="convite-dica">
            A pessoa recebe um link para entrar. O convite vale por 7 dias.
          </span>
        </label>
        <label class="ld-campo campo">
          <span class="ld-label">Acesso</span>
          <select v-model="nivelConvite" class="ld-input">
            <option v-for="n in NIVEIS" :key="n.valor" :value="n.valor">{{ n.rotulo }}</option>
          </select>
          <span class="convite-dica">
            {{ NIVEIS.find((n) => n.valor === nivelConvite)?.ajuda }}
            O cargo ("escrevente", "corretor") você define depois, na lista de membros.
          </span>
        </label>
        <p v-if="conviteErro" class="ld-erro" role="alert">{{ conviteErro }}</p>
        <p v-if="conviteOk" class="convite-ok" role="status">{{ conviteOk }}</p>
        <button type="submit" class="ld-btn ld-btn--primary" :disabled="convidando">
          {{ convidando ? 'Enviando…' : 'Enviar convite' }}
        </button>
      </form>
    </section>

    <p v-if="acaoErro" class="ld-erro acao-erro" role="alert">{{ acaoErro }}</p>

    <section v-if="!personal" class="ld-painel bloco bloco--tabela">
      <h2 class="bloco-titulo">Membros</h2>
      <p v-if="membroErro" class="ld-erro acao-erro acao-erro--tabela" role="alert">{{ membroErro }}</p>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">E-mail</th>
              <th scope="col">Cargo</th>
              <th scope="col">Desde</th>
              <th v-if="equipe?.souDono" scope="col"><span class="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="m in equipe?.membros" :key="m.userId">
              <tr>
                <td class="celula-nome">{{ m.name }}</td>
                <td>{{ m.email }}</td>
                <td>
                  <span class="cargo">{{ m.title || roleLabel[m.role] || m.role }}</span>
                  <!-- Com cargo próprio, o nível de acesso ainda precisa ficar
                       visível: "escrevente" não diz se a pessoa cria análises. -->
                  <span v-if="m.title && m.role !== 'owner'" class="cargo-nivel">
                    {{ roleLabel[m.role] }}
                  </span>
                </td>
                <td class="celula-data">{{ dataFmt(m.joinedAt) }}</td>
                <td v-if="equipe?.souDono" class="celula-acao">
                  <template v-if="m.role !== 'owner' && editandoMembro !== m.userId">
                    <button
                      type="button"
                      class="ld-btn ld-btn--secondary btn-linha"
                      @click="abrirEdicaoMembro(m)"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      class="ld-btn ld-btn--secondary btn-linha"
                      :disabled="agindo === m.userId"
                      @click="removerMembro(m.userId, m.name)"
                    >
                      {{ agindo === m.userId ? 'Removendo…' : 'Remover' }}
                    </button>
                  </template>
                </td>
              </tr>

              <tr v-if="editandoMembro === m.userId" class="linha-edicao">
                <td :colspan="equipe?.souDono ? 5 : 4">
                  <form class="edicao-form" @submit.prevent="salvarMembro(m.userId)">
                    <label class="ld-campo edicao-campo">
                      <span class="ld-label">Cargo</span>
                      <input
                        v-model="cargoEdicao"
                        class="ld-input"
                        type="text"
                        maxlength="60"
                        placeholder="Escrevente, secretário, corretor…"
                      />
                    </label>
                    <label class="ld-campo edicao-campo">
                      <span class="ld-label">Acesso</span>
                      <select v-model="nivelEdicao" class="ld-input">
                        <option v-for="n in NIVEIS" :key="n.valor" :value="n.valor">
                          {{ n.rotulo }}
                        </option>
                      </select>
                    </label>
                    <div class="edicao-acoes">
                      <button type="submit" class="ld-btn ld-btn--primary btn-linha" :disabled="salvandoMembro">
                        {{ salvandoMembro ? 'Salvando…' : 'Salvar' }}
                      </button>
                      <button
                        type="button"
                        class="ld-btn ld-btn--secondary btn-linha"
                        @click="editandoMembro = ''"
                      >
                        Cancelar
                      </button>
                    </div>
                    <p class="edicao-ajuda">
                      {{ NIVEIS.find((n) => n.valor === nivelEdicao)?.ajuda }}
                      O cargo é só um rótulo — quem define o que a pessoa pode fazer é o acesso.
                    </p>
                  </form>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="equipe?.convites.length" class="ld-painel bloco bloco--tabela">
      <h2 class="bloco-titulo">Convites pendentes</h2>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th scope="col">E-mail</th>
              <th scope="col">Acesso</th>
              <th scope="col">Enviado</th>
              <th scope="col">Expira</th>
              <th v-if="equipe?.souDono" scope="col"><span class="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in equipe?.convites" :key="c.id">
              <td class="celula-nome">{{ c.email }}</td>
              <td>{{ roleLabel[c.role] ?? c.role }}</td>
              <td class="celula-data">{{ dataFmt(c.createdAt) }}</td>
              <td class="celula-data">{{ dataFmt(c.expiresAt) }}</td>
              <td v-if="equipe?.souDono" class="celula-acao">
                <button
                  type="button"
                  class="ld-btn ld-btn--secondary btn-linha"
                  :disabled="agindo === c.id"
                  @click="cancelarConvite(c.id, c.email)"
                >
                  {{ agindo === c.id ? 'Cancelando…' : 'Cancelar' }}
                </button>
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

/* ── Organização ─────────────────────────────────────────── */
.org-topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
}
.org-topo .bloco-titulo {
  margin-bottom: var(--ld-space-xs);
}
.org-nome {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-size: 1.25rem;
  line-height: 1.3;
}
.org-form {
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-md);
  align-items: flex-start;
  margin-top: var(--ld-space-md);
}
.org-form-acoes {
  display: flex;
  gap: var(--ld-space-sm);
}
.org-assentos {
  margin: var(--ld-space-md) 0 0;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}

/* ── Conta individual ────────────────────────────────────── */
/* Texto corrido de bloco: mesma medida das outras explicações da tela, com a
   margem que o reset global tira dos parágrafos. */
.bloco-intro,
.bloco-rodape {
  line-height: 1.5;
  color: var(--ld-tinta-suave);
  max-width: 60ch;
}
.bloco-intro {
  margin: 0 0 var(--ld-space-md);
  font-size: 0.9375rem;
}
.bloco-rodape {
  margin: var(--ld-space-lg) 0 0;
  padding-top: var(--ld-space-md);
  border-top: 1px solid var(--ld-filete);
  font-size: 0.8125rem;
}

/* ── Convite ─────────────────────────────────────────────── */
.convite-form {
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-md);
  align-items: flex-start;
}
/* Só a largura é local — o visual vem das primitivas ld-campo/ld-label/ld-input */
.campo {
  width: 100%;
  max-width: 24rem;
}
.convite-dica {
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.convite-ok {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ld-verde-profundo);
}
.convite-upgrade {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--ld-tinta-suave);
  max-width: 60ch;
}
.convite-upgrade-link {
  color: var(--ld-verde);
  font-weight: 600;
  white-space: nowrap;
}
.acao-erro {
  margin: 0 0 var(--ld-space-md);
}

/* ── Tabelas ─────────────────────────────────────────────── */
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
.celula-acao .btn-linha + .btn-linha {
  margin-left: var(--ld-space-xs);
}

/* ── Cargo e edição inline ───────────────────────────────── */
.cargo {
  display: block;
}
.cargo-nivel {
  display: block;
  font-size: 0.75rem;
  color: var(--ld-tinta-suave);
}

.linha-edicao td {
  background: var(--ld-bancada);
}
.edicao-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--ld-space-md);
}
.edicao-campo {
  width: 100%;
  max-width: 16rem;
}
.edicao-acoes {
  display: flex;
  gap: var(--ld-space-xs);
}
.edicao-ajuda {
  flex-basis: 100%;
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--ld-tinta-suave);
  max-width: 70ch;
}
.acao-erro--tabela {
  padding: 0 var(--ld-space-lg) var(--ld-space-md);
}
</style>
