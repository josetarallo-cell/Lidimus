<script setup lang="ts">
// Estado de falha padrão dos laudos: título, mensagem e caminho de saída
// (reenviar + suporte). O e-mail de suporte vive num único lugar.
defineProps<{
  titulo: string
  mensagem: string
  retryTo: string
  retryLabel: string
}>()

const SUPORTE_MAILTO = 'mailto:jose.tarallo@gmail.com?subject=Lidimus%20%E2%80%94%20suporte'
</script>

<template>
  <div class="falha print-hidden" role="alert">
    <p class="falha-titulo">{{ titulo }}</p>
    <p class="falha-msg">{{ mensagem }}</p>
    <p class="falha-acao">
      Tente <NuxtLink :to="retryTo" class="falha-link">{{ retryLabel }}</NuxtLink> — se o
      problema persistir,
      <a :href="SUPORTE_MAILTO" class="falha-link">fale com o suporte</a>.
    </p>
  </div>
</template>

<style scoped>
.falha {
  border: 1px solid var(--ld-carimbo);
  background: var(--ld-carimbo-selo);
  border-radius: var(--ld-r-md);
  padding: var(--ld-space-lg);
  max-width: 72ch;
}
.falha-titulo {
  margin: 0 0 var(--ld-space-sm);
  font-weight: 600;
  color: var(--ld-carimbo-tinta);
}
.falha-msg {
  margin: 0 0 var(--ld-space-md);
  color: var(--ld-tinta);
  font-size: 0.9375rem;
}
.falha-acao {
  margin: 0;
  color: var(--ld-tinta);
  font-size: 0.9375rem;
}
.falha-link {
  color: var(--ld-carimbo-tinta);
  font-weight: 600;
}
</style>
