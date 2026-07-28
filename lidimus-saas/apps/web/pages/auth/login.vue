<script setup lang="ts">
definePageMeta({ layout: false })

useHead({ title: 'Entrar — Lidimus' })

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const { data: providers } = await useFetch('/api/auth-providers')

// Volta do callback do Google quando o Better Auth recusa o login
if (useRoute().query.erro === 'google') {
  error.value = 'Não foi possível entrar com o Google. Tente novamente ou use e-mail e senha.'
}

async function entrarComGoogle() {
  error.value = ''
  try {
    const { url } = await $fetch<{ url: string }>('/api/auth/sign-in/social', {
      method: 'POST',
      // Sem errorCallbackURL, uma falha no callback do Google devolve o usuário
      // para a landing sem sessão e sem explicação nenhuma.
      body: {
        provider: 'google',
        callbackURL: '/dashboard',
        errorCallbackURL: '/auth/login?erro=google',
      },
    })
    window.location.href = url
  } catch {
    error.value = 'Não foi possível iniciar o login com Google. Tente novamente.'
  }
}

async function login() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: email.value, password: password.value, callbackURL: '/dashboard' },
    })
    await navigateTo('/dashboard')
  } catch (e: unknown) {
    const dados = (e as { data?: { message?: string; code?: string } })?.data
    // O Better Auth recusa a sessão enquanto o e-mail não for confirmado e
    // reenvia o link nesta mesma tentativa (emailVerification.sendOnSignIn).
    error.value =
      dados?.code === 'EMAIL_NOT_VERIFIED'
        ? 'Confirme seu e-mail antes de entrar. Acabamos de reenviar o link — confira sua caixa de entrada e o spam.'
        : (dados?.message ?? 'E-mail ou senha incorretos. Confira os dados e tente novamente.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth">
    <main class="auth-caixa">
      <NuxtLink to="/" class="auth-marca">
        <img src="/logo.svg" alt="Lidimus" class="auth-marca-logo" />
      </NuxtLink>

      <section class="ld-painel auth-painel">
        <h1>Entrar</h1>
        <form class="auth-form" novalidate @submit.prevent="login">
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
              autocomplete="current-password"
              required
            />
          </label>

          <p v-if="error" class="ld-erro" role="alert">{{ error }}</p>

          <button type="submit" class="ld-btn ld-btn--primary auth-cta" :disabled="loading">
            <span v-if="loading" class="ld-spinner" aria-hidden="true" />
            {{ loading ? 'Entrando…' : 'Entrar' }}
          </button>

          <NuxtLink to="/auth/esqueci-senha" class="auth-esqueci">Esqueci minha senha</NuxtLink>
        </form>

        <template v-if="providers?.google">
          <div class="auth-separador" role="separator">ou</div>
          <button type="button" class="ld-btn ld-btn--secondary auth-cta" @click="entrarComGoogle">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.72-4.96H1.29v3.1A12 12 0 0 0 12 24Z"/>
              <path fill="#FBBC05" d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l3.99-3.1Z"/>
              <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.6 4.59 1.79l3.44-3.44A11.98 11.98 0 0 0 1.29 6.62l3.99 3.1C6.22 6.87 8.87 4.76 12 4.76Z"/>
            </svg>
            Entrar com Google
          </button>
        </template>
      </section>

      <p class="auth-troca">
        Não tem conta?
        <NuxtLink to="/auth/register">Criar conta</NuxtLink>
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
  justify-content: center;
  margin-bottom: var(--ld-space-lg);
}
.auth-marca-logo {
  display: block;
  height: 52px;
  width: auto;
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
.auth-esqueci {
  align-self: center;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
  text-decoration: none;
}
.auth-esqueci:hover {
  color: var(--ld-verde-profundo);
  text-decoration: underline;
}
.auth-separador {
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  margin: var(--ld-space-md) 0;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.auth-separador::before,
.auth-separador::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--ld-filete);
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
