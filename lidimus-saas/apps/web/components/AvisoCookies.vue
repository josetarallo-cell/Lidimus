<script setup lang="ts">
// Aviso de cookies — informativo, um botão.
//
// Deliberadamente NÃO é o banner de "aceitar todos / rejeitar todos /
// configurar". O Lidimus não define nenhum cookie não-necessário: só sessão,
// CSRF do login Google, aceite dos Termos e os cookies de borda da Cloudflare.
// Para cookie necessário a base legal é legítimo interesse ou execução de
// contrato (Guia Orientativo da ANPD, 18/10/2022) — consentimento seria
// inadequado, porque não há escolha real a oferecer. Oferecer "rejeitar todos"
// sem nada para rejeitar é afirmar ao titular algo falso.
//
// O que a lei exige aqui é transparência (art. 9º): que o titular saiba, em
// linguagem clara, o que é guardado e onde ler o detalhe. É isso que este
// componente faz.
//
// Quando o primeiro rastreador entrar, este aviso vira o banner de duas
// camadas — a decisão e o estado já moram em useConsentimento().

const { decidiu, registrarCiencia } = useConsentimento()

// SSR renderizaria o aviso antes de o cookie ser lido no cliente, e ele
// piscaria para quem já o dispensou. Montado no cliente, aparece só uma vez.
const montado = ref(false)
onMounted(() => {
  montado.value = true
})

const visivel = computed(() => montado.value && !decidiu.value)
</script>

<template>
  <Transition name="ac">
    <aside v-if="visivel" class="ac" role="note" aria-label="Aviso sobre cookies">
      <p class="ac-texto">
        Usamos apenas cookies necessários para manter seu login e proteger a plataforma —
        nenhum de publicidade ou de rastreamento.
        <NuxtLink to="/privacidade#cookies" class="ac-link">Saiba o que guardamos</NuxtLink>.
      </p>
      <button type="button" class="ac-cta" @click="registrarCiencia">Entendi</button>
    </aside>
  </Transition>
</template>

<style scoped>
.ac {
  position: fixed;
  z-index: var(--ld-z-modal);
  left: var(--ld-space-md);
  right: var(--ld-space-md);
  bottom: var(--ld-space-md);
  margin-inline: auto;
  max-width: 46rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  padding: var(--ld-space-sm) var(--ld-space-md);
  background: var(--color-folha, #fff);
  border: 1px solid var(--color-text);
  box-shadow: var(--ld-shadow-flutuante);
  font-family: var(--font-body);
}
.ac-texto {
  margin: 0;
  flex: 1 1 28ch;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: color-mix(in srgb, var(--color-text) 80%, transparent);
  text-wrap: pretty;
}
.ac-link {
  color: var(--color-accent);
  text-underline-offset: 2px;
}
.ac-cta {
  flex-shrink: 0;
  border: none;
  border-radius: 0;
  background: var(--color-accent);
  color: #fff;
  font-family: var(--font-cond);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 9px 22px;
  cursor: pointer;
  transition: background var(--ld-dur-estado) var(--ld-ease);
}
.ac-cta:hover {
  background: var(--color-accent-600);
}

.ac-enter-active,
.ac-leave-active {
  transition:
    opacity var(--ld-dur-superficie) var(--ld-ease),
    transform var(--ld-dur-superficie) var(--ld-ease);
}
.ac-enter-from,
.ac-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
@media (prefers-reduced-motion: reduce) {
  .ac-enter-active,
  .ac-leave-active {
    transition: opacity 1ms linear;
  }
  .ac-enter-from,
  .ac-leave-to {
    transform: none;
  }
}
</style>
