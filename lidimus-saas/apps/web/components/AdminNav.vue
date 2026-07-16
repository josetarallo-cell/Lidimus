<template>
  <nav class="admin-nav" aria-label="Seções administrativas">
    <NuxtLink to="/admin/clientes" class="admin-nav-link" active-class="admin-nav-link--ativa">Clientes</NuxtLink>
    <NuxtLink to="/admin/faturamento" class="admin-nav-link" active-class="admin-nav-link--ativa">Faturamento</NuxtLink>
    <NuxtLink to="/admin/custos" class="admin-nav-link" active-class="admin-nav-link--ativa">Custos</NuxtLink>
    <NuxtLink to="/admin/queues" class="admin-nav-link" active-class="admin-nav-link--ativa">Filas</NuxtLink>
  </nav>
</template>

<style scoped>
.admin-nav {
  display: flex;
  gap: var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  margin-bottom: var(--ld-space-lg);
}
.admin-nav-link {
  color: var(--ld-tinta-suave);
  text-decoration: none;
  font-size: 0.9375rem;
  font-weight: 500;
  padding: 10px 0 12px;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color var(--ld-dur-estado) var(--ld-ease);
}
.admin-nav-link:hover {
  color: var(--ld-tinta);
}
.admin-nav-link--ativa {
  color: var(--ld-tinta);
  border-bottom-color: var(--ld-verde);
}
</style>
