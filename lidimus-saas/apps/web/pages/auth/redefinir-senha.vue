<script setup lang="ts">
definePageMeta({ layout: false })

useHead({ title: 'Redefinir senha — Lidimus' })

const route = useRoute()
const token = computed(() => (route.query.token as string) || '')
// better-auth redireciona com ?error=INVALID_TOKEN quando o link expirou/foi usado
const tokenInvalido = computed(() => Boolean(route.query.error) || !token.value)

const senha = ref('')
const confirmacao = ref('')
const concluido = ref(false)
const loading = ref(false)
const error = ref('')

async function redefinir() {
  error.value = ''
  if (senha.value.length < 8) {
    error.value = 'A senha precisa de pelo menos 8 caracteres.'
    return
  }
  if (senha.value !== confirmacao.value) {
    error.value = 'As senhas não conferem.'
    return
  }
  loading.value = true
  try {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { newPassword: senha.value, token: token.value },
    })
    concluido.value = true
  } catch {
    error.value = 'Não foi possível redefinir. O link pode ter expirado — peça um novo.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth">
    <main class="auth-caixa">
      <NuxtLink to="/" class="auth-marca">
        <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
          <polygon points="14,2 26,14 14,26 2,14" fill="none" stroke="currentColor" stroke-width="2" />
          <polygon points="14,9 19,14 14,19 9,14" fill="currentColor" />
        </svg>
        Lidimus
      </NuxtLink>

      <section class="ld-painel auth-painel">
        <h1>Definir nova senha</h1>

        <p v-if="tokenInvalido" class="ld-erro" role="alert">
          Este link de redefinição é inválido ou expirou.
          <NuxtLink to="/auth/esqueci-senha">Peça um novo link</NuxtLink>.
        </p>

        <template v-else-if="!concluido">
          <form class="auth-form" novalidate @submit.prevent="redefinir">
            <label class="ld-campo">
              <span class="ld-label">Nova senha</span>
              <input
                v-model="senha"
                class="ld-input"
                :class="{ 'ld-input--erro': error }"
                type="password"
                autocomplete="new-password"
                required
              />
            </label>
            <label class="ld-campo">
              <span class="ld-label">Confirmar nova senha</span>
              <input
                v-model="confirmacao"
                class="ld-input"
                :class="{ 'ld-input--erro': error }"
                type="password"
                autocomplete="new-password"
                required
              />
            </label>

            <p v-if="error" class="ld-erro" role="alert">{{ error }}</p>

            <button type="submit" class="ld-btn ld-btn--primary auth-cta" :disabled="loading">
              <span v-if="loading" class="ld-spinner" aria-hidden="true" />
              {{ loading ? 'Salvando…' : 'Salvar nova senha' }}
            </button>
          </form>
        </template>

        <template v-else>
          <p class="auth-confirmacao" role="status">Senha redefinida com sucesso.</p>
          <NuxtLink to="/auth/login" class="ld-btn ld-btn--primary auth-cta">Entrar</NuxtLink>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ld-papel);
  color: var(--ld-tinta);
  font-family: var(--ld-font-sans);
  padding: var(--ld-space-lg) var(--ld-space-md);
}
.auth-caixa {
  width: 100%;
  max-width: 24rem;
}
.auth-marca {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: var(--ld-space-lg);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.375rem;
  color: var(--ld-tinta);
  text-decoration: none;
}
.auth-marca svg {
  color: var(--ld-verde);
}
.auth-painel {
  padding: var(--ld-space-xl) var(--ld-space-lg);
}
.auth-painel h1 {
  margin: 0 0 var(--ld-space-lg);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.5rem;
  line-height: 1.2;
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-md);
}
.auth-cta {
  width: 100%;
  margin-top: var(--ld-space-sm);
}
.auth-confirmacao {
  margin: 0 0 var(--ld-space-md);
  font-size: 0.9375rem;
}
.ld-erro a {
  color: inherit;
  font-weight: 600;
}
</style>
