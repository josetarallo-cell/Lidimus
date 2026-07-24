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
/* Piloto de migração para o sistema Modernista ("O Cartaz Oficial").
   Cor, tipografia, raio e peso de régua vêm de --color-* / --font-*
   (assets/css/lidimus.css, normativo em DESIGN.md). Espaçamento, z-index
   e motion continuam em --ld-space-* / --ld-z-* / --ld-dur-estado — são
   infraestrutura neutra, não identidade de marca, e seguem compartilhados
   entre "A Prancha Viva" (telas ainda não migradas) e o Modernista. */
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
}

.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: var(--ld-z-toast);
  background: var(--color-accent);
  color: var(--color-bg);
  padding: 10px 16px;
  border-radius: 0;
  font-size: 0.875rem;
  font-weight: 700;
  text-decoration: none;
}
.skip-link:focus-visible {
  left: 0;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: var(--ld-z-sticky);
  background: var(--color-bg);
  border-bottom: 2px solid var(--color-text);
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
  font-family: var(--font-cond);
  color: color-mix(in srgb, var(--color-text) 65%, transparent);
  text-decoration: none;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 18px 0 16px;
  border-bottom: 2px solid transparent;
  transition: color var(--ld-dur-estado) var(--ld-ease);
}
.app-nav-link:hover {
  color: var(--color-text);
}
.app-nav-link.router-link-active {
  color: var(--color-text);
  border-bottom-color: var(--color-accent);
}

/* "Sair" é ação, não navegação: botão com filete, apartado dos links. */
.app-nav-sair {
  border: 1px solid var(--color-divider);
  background: none;
  border-radius: 0;
  padding: 6px 14px;
  font-family: var(--font-cond);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-text) 65%, transparent);
  cursor: pointer;
  transition:
    color var(--ld-dur-estado) var(--ld-ease),
    border-color var(--ld-dur-estado) var(--ld-ease);
}
.app-nav-sair:hover {
  color: var(--color-text);
  border-color: var(--color-text);
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
    font-size: 0.75rem;
  }
  .app-main {
    padding: var(--ld-space-lg) var(--ld-space-md) var(--ld-space-xl);
  }
}

.app-footer {
  border-top: 2px solid var(--color-text);
  background: var(--color-surface);
}
.app-footer p {
  max-width: 72rem;
  margin: 0 auto;
  padding: var(--ld-space-md) var(--ld-space-lg);
  font-size: 0.8125rem;
  color: color-mix(in srgb, var(--color-text) 65%, transparent);
}
.app-footer-link {
  color: var(--color-accent);
  font-weight: 700;
}
.app-footer-link:hover {
  color: var(--color-accent-600);
}

@media print {
  .app-header,
  .app-footer,
  .skip-link {
    display: none;
  }
  .app-shell {
    background: #fff;
  }
  .app-main {
    max-width: 100%;
    padding: 0;
  }
}
</style>
