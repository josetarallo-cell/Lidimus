<script setup lang="ts">
definePageMeta({ layout: false })

useHead({ title: 'Esqueci minha senha — Lidimus' })

const email = ref('')
const enviado = ref(false)
const loading = ref(false)
const error = ref('')

async function solicitar() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/request-password-reset', {
      method: 'POST',
      body: { email: email.value, redirectTo: '/auth/redefinir-senha' },
    })
    // Sempre mostra sucesso — não revelar se o e-mail existe ou não na base
    enviado.value = true
  } catch {
    error.value = 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.'
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
        <h1>Recuperar acesso</h1>

        <template v-if="!enviado">
          <p class="auth-instrucao">
            Informe o e-mail da sua conta. Enviaremos um link para você definir uma nova senha.
          </p>
          <form class="auth-form" novalidate @submit.prevent="solicitar">
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

            <p v-if="error" class="ld-erro" role="alert">{{ error }}</p>

            <button type="submit" class="ld-btn ld-btn--primary auth-cta" :disabled="loading">
              <span v-if="loading" class="ld-spinner" aria-hidden="true" />
              {{ loading ? 'Enviando…' : 'Enviar link de recuperação' }}
            </button>
          </form>
        </template>

        <p v-else class="auth-confirmacao" role="status">
          Se existir uma conta com esse e-mail, o link de redefinição chega em instantes.
          Confira também a caixa de spam.
        </p>
      </section>

      <p class="auth-troca">
        Lembrou a senha?
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
  margin: 0 0 var(--ld-space-md);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.5rem;
  line-height: 1.2;
}
.auth-instrucao {
  margin: 0 0 var(--ld-space-lg);
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
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
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ld-tinta);
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
