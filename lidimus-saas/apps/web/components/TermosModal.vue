<script setup lang="ts">
// Termos e Condições de Uso. Vive num modal porque o momento de ler é o do
// cadastro — mandar a pessoa para outra página ali significaria perder o
// formulário já preenchido. Quem quiser a versão navegável, com URL própria
// para citar ou arquivar, tem /termos — que renderiza o mesmo TermosTexto.
//
// Este arquivo é só a moldura: cabeçalho, rolagem e saída. O texto das 12
// cláusulas mora em TermosTexto.vue, para que modal e página não possam
// divergir — ver a justificativa lá.
//
// Sistema Modernista (tokens --color-*), como manda a nota normativa em
// assets/css/lidimus.css: espaçamento e z-index seguem os tokens estruturais,
// que ainda não têm equivalente no sistema novo.

import { VIGENCIA_TERMOS } from '~/shared/termos'

const dialogo = ref<HTMLDialogElement | null>(null)

function abrir() {
  dialogo.value?.showModal()
}

function fechar() {
  dialogo.value?.close()
}

defineExpose({ abrir, fechar })
</script>

<template>
  <dialog ref="dialogo" class="tm" aria-labelledby="tm-titulo">
    <div class="tm-folha">
      <header class="tm-topo">
        <div>
          <p class="cond tm-marca">Lidimus</p>
          <h2 id="tm-titulo" class="tm-titulo">Termos e Condições de Uso</h2>
          <p class="tm-vigencia">Vigentes desde {{ VIGENCIA_TERMOS }}</p>
        </div>
        <button type="button" class="tm-fechar" aria-label="Fechar termos" @click="fechar">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="square"
            />
          </svg>
        </button>
      </header>

      <div class="tm-corpo">
        <TermosTexto />
      </div>

      <footer class="tm-rodape">
        <p class="tm-nota">
          Leia com atenção: o aceite no cadastro se refere a esta versão dos Termos.
        </p>
        <button type="button" class="tm-cta" autofocus @click="fechar">Fechar</button>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.tm {
  /* dialog nativo sobe para a top layer; o z-index só ordena contra camadas
     próprias, mas manter a escala evita número mágico. */
  z-index: var(--ld-z-modal);
  width: min(46rem, calc(100vw - 2 * var(--ld-space-md)));
  max-height: calc(100dvh - 2 * var(--ld-space-lg));
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-body);
  overflow: visible;
}
.tm::backdrop {
  background: color-mix(in srgb, var(--color-text) 62%, transparent);
}
/* O anel de foco global é verde (identidade antiga) e destoaria da folha. */
.tm :focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.tm-folha {
  background: #fff;
  border-top: 2px solid var(--color-text);
  max-height: inherit;
  display: flex;
  flex-direction: column;
}

/* ── Cabeçalho ──────────────────────────────────────────── */
.tm-topo {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ld-space-md);
  padding: var(--ld-space-lg) var(--ld-space-lg) var(--ld-space-md);
}
.tm-marca {
  margin: 0 0 var(--ld-space-xs);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-text) 66%, transparent);
}
.tm-titulo {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: clamp(1.375rem, 3.6vw, 1.875rem);
  line-height: 1.08;
  letter-spacing: -0.015em;
  text-transform: uppercase;
  text-wrap: balance;
}
.tm-vigencia {
  margin: 6px 0 0;
  font-size: 0.8125rem;
  color: color-mix(in srgb, var(--color-text) 66%, transparent);
}
.tm-fechar {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--color-divider);
  border-radius: 0;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition:
    background var(--ld-dur-estado) var(--ld-ease),
    border-color var(--ld-dur-estado) var(--ld-ease);
}
.tm-fechar:hover {
  background: var(--color-surface);
  border-color: var(--color-text);
}

/* ── Corpo ──────────────────────────────────────────────── */
/* O texto é longo por natureza: rola só o corpo, para que título e botão de
   saída continuem à vista durante a leitura. A formatação das cláusulas vem
   de TermosTexto.vue — `scoped` não atravessa para o filho. */
.tm-corpo {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 var(--ld-space-lg) var(--ld-space-md);
}

/* ── Rodapé ─────────────────────────────────────────────── */
.tm-rodape {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-top: 2px solid var(--color-text);
  background: #fff;
}
.tm-nota {
  margin: 0;
  flex: 1 1 22ch;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: color-mix(in srgb, var(--color-text) 74%, transparent);
  max-width: 52ch;
  text-wrap: pretty;
}
.tm-cta {
  flex-shrink: 0;
  border: none;
  border-radius: 0;
  background: var(--color-accent);
  color: #fff;
  font-family: var(--font-cond);
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 11px 28px;
  cursor: pointer;
  transition: background var(--ld-dur-estado) var(--ld-ease);
}
.tm-cta:hover {
  background: var(--color-accent-600);
}

/* ── Entrada ────────────────────────────────────────────── */
@keyframes tm-sobe {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes tm-vela {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.tm[open] .tm-folha {
  animation: tm-sobe var(--ld-dur-superficie) var(--ld-ease) both;
}
.tm[open]::backdrop {
  animation: tm-vela var(--ld-dur-superficie) var(--ld-ease) both;
}
@media (prefers-reduced-motion: reduce) {
  .tm[open] .tm-folha {
    animation: tm-vela 1ms linear both;
  }
}
</style>
