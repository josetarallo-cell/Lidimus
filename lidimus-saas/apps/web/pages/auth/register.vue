<script setup lang="ts">
definePageMeta({ layout: false })

useHead({ title: 'Criar conta — Lidimus' })

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function register() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/sign-up/email', {
      method: 'POST',
      body: { name: name.value, email: email.value, password: password.value },
    })
    await navigateTo('/dashboard')
  } catch (e: unknown) {
    error.value =
      (e as { data?: { message?: string } })?.data?.message ??
      'Não foi possível criar a conta. Confira os dados e tente novamente.'
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
        <h1>Criar conta</h1>
        <p class="auth-nota">Comece com 100 créditos gratuitos — sem cartão de crédito.</p>
        <form class="auth-form" novalidate @submit.prevent="register">
          <label class="ld-campo">
            <span class="ld-label">Nome</span>
            <input
              v-model="name"
              class="ld-input"
              type="text"
              autocomplete="name"
              placeholder="Seu nome completo"
              required
            />
          </label>
          <label class="ld-campo">
            <span class="ld-label">E-mail</span>
            <input
              v-model="email"
              class="ld-input"
              :class="{ 'ld-input--erro': error }"
              type="email"
              autocomplete="email"
              placeholder="voce@escritorio.com.br"
              required
            />
          </label>
          <label class="ld-campo">
            <span class="ld-label">Senha</span>
            <input
              v-model="password"
              class="ld-input"
              :class="{ 'ld-input--erro': error }"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
            />
            <span class="auth-dica">Mínimo de 8 caracteres.</span>
          </label>

          <p v-if="error" class="ld-erro" role="alert">{{ error }}</p>

          <button type="submit" class="ld-btn ld-btn--primary auth-cta" :disabled="loading">
            <span v-if="loading" class="ld-spinner" aria-hidden="true" />
            {{ loading ? 'Criando conta…' : 'Criar conta' }}
          </button>
        </form>
      </section>

      <p class="auth-troca">
        Já tem conta?
        <NuxtLink to="/auth/login">Entrar</NuxtLink>
      </p>
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
  margin: 0 0 var(--ld-space-xs);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.5rem;
  line-height: 1.2;
}
.auth-nota {
  margin: 0 0 var(--ld-space-lg);
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-md);
}
.auth-dica {
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.auth-cta {
  width: 100%;
  margin-top: var(--ld-space-sm);
}
.auth-troca {
  margin: var(--ld-space-lg) 0 0;
  text-align: center;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}
.auth-troca a {
  color: var(--ld-verde);
  font-weight: 600;
  text-decoration: none;
}
.auth-troca a:hover {
  color: var(--ld-verde-profundo);
  text-decoration: underline;
}
</style>
