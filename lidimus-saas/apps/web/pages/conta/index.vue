<script setup lang="ts">
useHead({ title: 'Conta — Lidimus' })

const { data: me, refresh: recarregarMe } = await useFetch('/api/me')

// Rótulo do papel dentro da organização. O cargo livre ("escrevente") mora na
// tela de Equipe, que é onde o dono o define; aqui basta o nível de acesso.
const papelLabel: Record<string, string> = {
  owner: 'Proprietário da conta',
  member: 'Membro da equipe',
  reader: 'Somente consulta',
}

// ── Nome ───────────────────────────────────────────────────
const editandoNome = ref(false)
const nomeNovo = ref('')
const nomeErro = ref('')
const salvandoNome = ref(false)

function abrirEdicaoNome() {
  nomeNovo.value = me.value?.name ?? ''
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
    await $fetch('/api/account/profile', { method: 'PATCH', body: { name: nomeNovo.value.trim() } })
    editandoNome.value = false
    await recarregarMe()
  } catch (e: unknown) {
    nomeErro.value =
      (e as { data?: { message?: string } })?.data?.message ?? 'Não foi possível salvar o nome.'
  } finally {
    salvandoNome.value = false
  }
}

// ── Senha ──────────────────────────────────────────────────
const senhaAtual = ref('')
const senhaNova = ref('')
const trocando = ref(false)
const trocaErro = ref('')
const trocaOk = ref(false)

async function trocarSenha() {
  trocaErro.value = ''
  trocaOk.value = false
  if (senhaNova.value.length < 8) {
    trocaErro.value = 'A nova senha precisa de pelo menos 8 caracteres.'
    return
  }
  trocando.value = true
  try {
    await $fetch('/api/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: senhaAtual.value,
        newPassword: senhaNova.value,
        revokeOtherSessions: true,
      },
    })
    trocaOk.value = true
    senhaAtual.value = ''
    senhaNova.value = ''
  } catch {
    trocaErro.value = 'Não foi possível trocar a senha. Confira a senha atual.'
  } finally {
    trocando.value = false
  }
}
</script>

<template>
  <div>
    <header class="conta-cabecalho">
      <h1>Conta</h1>
    </header>

    <ContaNav />

    <div class="conta-grade">
      <section class="ld-painel bloco">
        <div class="perfil-topo">
          <h2 class="bloco-titulo">Perfil</h2>
          <button
            v-if="!editandoNome"
            type="button"
            class="ld-btn ld-btn--secondary btn-linha"
            @click="abrirEdicaoNome"
          >
            Editar nome
          </button>
        </div>

        <form v-if="editandoNome" class="nome-form" @submit.prevent="salvarNome">
          <label class="ld-campo campo">
            <span class="ld-label">Seu nome</span>
            <input v-model="nomeNovo" class="ld-input" type="text" maxlength="120" autocomplete="name" />
          </label>
          <p v-if="nomeErro" class="ld-erro" role="alert">{{ nomeErro }}</p>
          <div class="nome-acoes">
            <button type="submit" class="ld-btn ld-btn--primary" :disabled="salvandoNome">
              {{ salvandoNome ? 'Salvando…' : 'Salvar' }}
            </button>
            <button type="button" class="ld-btn ld-btn--secondary" @click="editandoNome = false">
              Cancelar
            </button>
          </div>
        </form>

        <dl v-else class="perfil-lista">
          <div class="perfil-item">
            <dt>Nome</dt>
            <dd>{{ me?.name }}</dd>
          </div>
          <div class="perfil-item">
            <dt>E-mail</dt>
            <dd>{{ me?.email }}</dd>
          </div>
          <div class="perfil-item">
            <dt>Empresa</dt>
            <!-- Na conta individual orgName é o nome da própria pessoa, que já
                 está duas linhas acima — repeti-lo aqui daria a entender que a
                 pessoa é a razão social. -->
            <dd>{{ me?.orgPersonal ? 'Conta individual' : me?.orgName }}</dd>
          </div>
          <div class="perfil-item">
            <dt>Seu acesso</dt>
            <dd>{{ papelLabel[me?.role ?? ''] ?? me?.role }}</dd>
          </div>
          <div v-if="me?.isPlatformAdmin" class="perfil-item">
            <dt>Papel</dt>
            <dd><span class="ld-selo ld-selo--verde">Administrador da plataforma</span></dd>
          </div>
        </dl>
      </section>

      <section class="ld-painel bloco">
        <h2 class="bloco-titulo">Trocar senha</h2>
        <form class="senha-form" @submit.prevent="trocarSenha">
          <label class="ld-campo campo">
            <span class="ld-label">Senha atual</span>
            <input v-model="senhaAtual" type="password" autocomplete="current-password" required class="ld-input" />
          </label>
          <label class="ld-campo campo">
            <span class="ld-label">Nova senha</span>
            <input v-model="senhaNova" type="password" autocomplete="new-password" required class="ld-input" />
          </label>
          <p v-if="trocaErro" class="senha-erro" role="alert">{{ trocaErro }}</p>
          <p v-if="trocaOk" class="senha-ok" role="status">Senha alterada. As outras sessões foram encerradas.</p>
          <button type="submit" class="ld-btn ld-btn--secondary" :disabled="trocando">
            {{ trocando ? 'Alterando…' : 'Alterar senha' }}
          </button>
        </form>
      </section>
    </div>
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

.conta-grade {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ld-space-lg);
  align-items: start;
}
@media (max-width: 720px) {
  .conta-grade {
    grid-template-columns: 1fr;
  }
}

.bloco {
  padding: var(--ld-space-lg);
}
.bloco-titulo {
  margin: 0 0 var(--ld-space-md);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}

.perfil-topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ld-space-md);
}
.btn-linha {
  padding: 5px 12px;
  font-size: 0.8125rem;
  flex-shrink: 0;
}

.perfil-lista {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-md);
}
.perfil-item dt {
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
  margin-bottom: 2px;
}
.perfil-item dd {
  margin: 0;
  font-size: 0.9375rem;
}

.nome-form,
.senha-form {
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-md);
  align-items: flex-start;
}
.nome-acoes {
  display: flex;
  gap: var(--ld-space-sm);
}
/* Só a largura é local — visual vem das primitivas ld-campo/ld-label/ld-input */
.campo {
  width: 100%;
  max-width: 22rem;
}
.senha-erro {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ld-carimbo-tinta);
}
.senha-ok {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ld-verde-profundo);
}
</style>
