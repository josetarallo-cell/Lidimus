<script setup lang="ts">
const { data: me } = await useFetch('/api/me')

const saindo = ref(false)
async function sair() {
  if (saindo.value) return
  saindo.value = true
  try {
    // body vazio para o $fetch enviar Content-Type: application/json — sem ele o
    // better-auth responde 415.
    await $fetch('/api/auth/sign-out', { method: 'POST', body: {} })
    await navigateTo('/auth/login')
  } finally {
    saindo.value = false
  }
}
</script>

<template>
  <div class="app-shell">
    <a href="#conteudo" class="skip-link">Ir para o conteúdo</a>

    <header class="app-header">
      <div class="app-header-inner">
        <NuxtLink to="/dashboard" class="app-brand">
          <img src="/logo.svg" alt="Lidimus" class="app-brand-logo" />
        </NuxtLink>
        <nav class="app-nav" aria-label="Principal">
          <NuxtLink to="/dashboard" class="app-nav-link">Painel</NuxtLink>
          <NuxtLink to="/matriculas" class="app-nav-link">Matrículas</NuxtLink>
          <NuxtLink to="/croqui" class="app-nav-link">Croqui</NuxtLink>
          <NuxtLink to="/kml" class="app-nav-link">Memoriais</NuxtLink>
          <NuxtLink to="/injection" class="app-nav-link">Detector</NuxtLink>
          <NuxtLink to="/conta" class="app-nav-link">Conta</NuxtLink>
          <NuxtLink v-if="me?.isPlatformAdmin" to="/admin/clientes" class="app-nav-link">Admin</NuxtLink>
          <button type="button" class="app-nav-sair" :disabled="saindo" @click="sair">
            {{ saindo ? 'Saindo…' : 'Sair' }}
          </button>
        </nav>
      </div>
    </header>

    <main id="conteudo" class="app-main">
      <slot />
    </main>

    <footer class="app-footer">
      <p>
        Precisa de ajuda?
        <a href="mailto:jose.tarallo@gmail.com?subject=Lidimus%20%E2%80%94%20suporte" class="app-footer-link">
          Fale com o suporte
        </a>
      </p>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ld-papel);
  color: var(--ld-tinta);
  font-family: var(--ld-font-sans);
}

.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: var(--ld-z-toast);
  background: var(--ld-verde);
  color: var(--ld-papel);
  padding: 10px 16px;
  border-radius: 0 0 var(--ld-r-sm) 0;
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
}
.skip-link:focus-visible {
  left: 0;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: var(--ld-z-sticky);
  background: var(--ld-papel);
  border-bottom: 1px solid var(--ld-filete);
}

.app-header-inner {
  max-width: 72rem;
  margin: 0 auto;
  padding: 0 var(--ld-space-lg);
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-lg);
}

.app-brand {
  display: inline-flex;
  align-items: center;
}
/* O logo tem respiro interno no viewBox; a altura acima do texto compensa. */
.app-brand-logo {
  display: block;
  height: 38px;
  width: auto;
}

.app-nav {
  display: flex;
  align-items: center;
  gap: var(--ld-space-lg);
}

.app-nav-link {
  color: var(--ld-tinta-suave);
  text-decoration: none;
  font-size: 0.9375rem;
  font-weight: 500;
  padding: 18px 0 16px;
  border-bottom: 2px solid transparent;
  transition: color var(--ld-dur-estado) var(--ld-ease);
}
.app-nav-link:hover {
  color: var(--ld-tinta);
}
.app-nav-link.router-link-active {
  color: var(--ld-tinta);
  border-bottom-color: var(--ld-verde);
}

/* "Sair" é ação, não navegação: botão com filete, apartado dos links. */
.app-nav-sair {
  border: 1px solid var(--ld-filete);
  background: none;
  border-radius: var(--ld-r-sm);
  padding: 6px 14px;
  font-family: var(--ld-font-sans);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ld-tinta-suave);
  cursor: pointer;
  transition:
    color var(--ld-dur-estado) var(--ld-ease),
    border-color var(--ld-dur-estado) var(--ld-ease);
}
.app-nav-sair:hover {
  color: var(--ld-tinta);
  border-color: var(--ld-tinta-suave);
}
.app-nav-sair:disabled {
  opacity: 0.6;
  cursor: default;
}

.app-main {
  flex: 1;
  max-width: 72rem;
  margin: 0 auto;
  width: 100%;
  padding: var(--ld-space-xl) var(--ld-space-lg) var(--ld-space-2xl);
}

@media (max-width: 640px) {
  .app-header-inner {
    padding: var(--ld-space-sm) var(--ld-space-md);
    height: auto;
    min-height: 56px;
    flex-wrap: wrap;
    row-gap: 0;
  }
  .app-nav {
    gap: var(--ld-space-md);
  }
  .app-nav-link {
    padding: 10px 0 12px;
    font-size: 0.875rem;
  }
  .app-main {
    padding: var(--ld-space-lg) var(--ld-space-md) var(--ld-space-xl);
  }
}

.app-footer {
  border-top: 1px solid var(--ld-filete);
  background: var(--ld-bancada);
}
.app-footer p {
  max-width: 72rem;
  margin: 0 auto;
  padding: var(--ld-space-md) var(--ld-space-lg);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.app-footer-link {
  color: var(--ld-verde);
  font-weight: 500;
}
.app-footer-link:hover {
  color: var(--ld-verde-profundo);
}

@media print {
  .app-header,
  .app-footer,
  .skip-link {
    display: none;
  }
  .app-shell {
    background: var(--ld-folha);
  }
  .app-main {
    max-width: 100%;
    padding: 0;
  }
}
</style>
