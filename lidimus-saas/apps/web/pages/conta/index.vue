<script setup lang="ts">
useHead({ title: 'Conta — Lidimus' })

const { data: conta } = await useFetch('/api/account')

const roleLabel: Record<string, string> = {
  owner: 'Proprietário',
  member: 'Membro',
}

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

// Troca de senha via endpoint nativo do better-auth
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
        <h2 class="bloco-titulo">Perfil</h2>
        <dl class="perfil-lista">
          <div class="perfil-item">
            <dt>Nome</dt>
            <dd>{{ conta?.user.name }}</dd>
          </div>
          <div class="perfil-item">
            <dt>E-mail</dt>
            <dd>{{ conta?.user.email }}</dd>
          </div>
          <div v-if="conta?.user.isPlatformAdmin" class="perfil-item">
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

    <section class="ld-painel bloco bloco--orgs">
      <h2 class="bloco-titulo">Organizações</h2>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">Papel</th>
              <th scope="col">Desde</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="org in conta?.orgs" :key="org.id">
              <td class="celula-nome">{{ org.name }}</td>
              <td>{{ roleLabel[org.role] ?? org.role }}</td>
              <td class="celula-data">{{ dataFmt(org.joinedAt) }}</td>
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

.conta-grade {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ld-space-lg);
  margin-bottom: var(--ld-space-lg);
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
.bloco--orgs {
  padding: 0;
}
.bloco--orgs .bloco-titulo {
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  margin: 0;
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

.senha-form {
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-md);
  align-items: flex-start;
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
</style>
