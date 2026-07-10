<template>
  <div class="app-shell">
    <a href="#conteudo" class="skip-link">Ir para o conteúdo</a>

    <header class="app-header">
      <div class="app-header-inner">
        <NuxtLink to="/dashboard" class="app-brand">
          <svg width="22" height="22" viewBox="0 0 28 28" aria-hidden="true">
            <polygon points="14,2 26,14 14,26 2,14" fill="none" stroke="currentColor" stroke-width="2" />
            <polygon points="14,9 19,14 14,19 9,14" fill="currentColor" />
          </svg>
          Lidimus
        </NuxtLink>
        <nav class="app-nav" aria-label="Principal">
          <NuxtLink to="/matriculas" class="app-nav-link">Matrículas</NuxtLink>
          <NuxtLink to="/kml" class="app-nav-link">Memoriais</NuxtLink>
          <NuxtLink to="/injection" class="app-nav-link">Detector</NuxtLink>
          <NuxtLink to="/conta" class="app-nav-link">Conta</NuxtLink>
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
  gap: 9px;
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.1875rem;
  color: var(--ld-tinta);
  text-decoration: none;
}
.app-brand svg {
  color: var(--ld-verde);
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
