<template>
  <nav class="conta-nav" aria-label="Seções da conta">
    <NuxtLink to="/conta" class="conta-nav-link" exact-active-class="conta-nav-link--ativa">Perfil</NuxtLink>
    <NuxtLink to="/conta/creditos" class="conta-nav-link" active-class="conta-nav-link--ativa">Créditos</NuxtLink>
    <NuxtLink to="/conta/assinatura" class="conta-nav-link" active-class="conta-nav-link--ativa">Assinatura</NuxtLink>
  </nav>
</template>

<style scoped>
.conta-nav {
  display: flex;
  gap: var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  margin-bottom: var(--ld-space-lg);
}
.conta-nav-link {
  color: var(--ld-tinta-suave);
  text-decoration: none;
  font-size: 0.9375rem;
  font-weight: 500;
  padding: 10px 0 12px;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color var(--ld-dur-estado) var(--ld-ease);
}
.conta-nav-link:hover {
  color: var(--ld-tinta);
}
.conta-nav-link--ativa {
  color: var(--ld-tinta);
  border-bottom-color: var(--ld-verde);
}
</style>
