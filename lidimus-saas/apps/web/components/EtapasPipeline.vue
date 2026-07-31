<script setup lang="ts">
// Régua de etapas do pipeline — componente único para as telas de espera.
//
// Antes existia uma cópia em cada laudo (matrícula e croqui), e elas divergiram:
// tamanhos de marco, espessura de filete e até a animação da etapa ativa eram
// diferentes. A sequência de etapas é informação do produto, não decoração de
// página; mora num lugar só.
const props = withDefaults(
  defineProps<{
    etapas: readonly { key: string; label: string }[]
    /** Índice da etapa em andamento */
    indice: number
    /** Job concluído: todas as etapas viram vistos */
    tudoConcluido?: boolean
    /** Índice que acabou de ser concluído — recebe o carimbo por um instante */
    carimbando?: number | null
    rotulo?: string
  }>(),
  { tudoConcluido: false, carimbando: null, rotulo: 'Etapas' },
)

type Estado = 'done' | 'active' | 'pending'

function estado(i: number): Estado {
  if (props.tudoConcluido) return 'done'
  if (i < props.indice) return 'done'
  if (i === props.indice) return 'active'
  return 'pending'
}
</script>

<template>
  <div class="etapas" role="list" :aria-label="rotulo">
    <template v-for="(s, i) in etapas" :key="s.key">
      <div
        class="etapa"
        role="listitem"
        :class="[`etapa--${estado(i)}`, { 'etapa--carimbo': carimbando === i }]"
      >
        <span class="etapa-marco" aria-hidden="true">
          <svg v-if="estado(i) === 'done'" width="13" height="13" viewBox="0 0 12 12">
            <path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
          <span v-else>{{ i + 1 }}</span>
        </span>
        <span class="etapa-label">
          {{ s.label }}
          <span v-if="estado(i) === 'active'" class="sr-only">(em andamento)</span>
        </span>
      </div>
      <span
        v-if="i < etapas.length - 1"
        class="etapa-regua"
        :class="{
          'etapa-regua--vencida': estado(i) === 'done',
          'etapa-regua--corrente': estado(i) === 'active',
        }"
        aria-hidden="true"
      />
    </template>
  </div>
</template>

<style scoped>
/* Moldura de régua: a estrutura aparece, como manda o sistema Modernista */
.etapas {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
  padding: var(--space-md) var(--space-lg);
  background: var(--color-folha);
  border: var(--rule) solid var(--color-text);
  font-family: var(--font-body);
}

.etapa {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Marco quadrado — raio 0 em todo lugar (A Regra do Raio Zero) */
.etapa-marco {
  width: 26px;
  height: 26px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-cond);
  font-size: 0.8125rem;
  font-weight: 700;
  border: var(--rule-fina) solid var(--color-divider);
  background: var(--color-surface);
  color: color-mix(in srgb, var(--color-text) 60%, transparent);
  transition:
    background var(--motion-dur) var(--motion-ease),
    color var(--motion-dur) var(--motion-ease),
    border-color var(--motion-dur) var(--motion-ease);
}
.etapa--done .etapa-marco {
  background: var(--color-text);
  border-color: var(--color-text);
  color: var(--color-bg);
}
/* O acento marca só o que está acontecendo agora — em repouso ele é ruído */
.etapa--active .etapa-marco {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-folha);
  animation: etapa-pulso 1.8s var(--motion-ease) infinite;
}

/* Carimbo: a etapa que acabou de fechar bate na folha. É a recompensa visível
   de quem esperou um minuto olhando para a tela. */
.etapa--carimbo .etapa-marco {
  animation: etapa-carimbo 260ms var(--motion-ease) 1;
}

.etapa-label {
  font-family: var(--font-cond);
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-text) 60%, transparent);
}
.etapa--active .etapa-label,
.etapa--done .etapa-label {
  color: var(--color-text);
  font-weight: 700;
}

.etapa-regua {
  flex: 1;
  min-width: 24px;
  height: var(--rule);
  background: var(--color-divider);
}
.etapa-regua--vencida {
  background: var(--color-text);
}
/* Trecho em curso: um quadrado de acento caminha para a próxima etapa. É
   indeterminado de propósito — o pipeline não reporta percentual, e uma barra
   que se enche sozinha seria progresso inventado. */
.etapa-regua--corrente {
  position: relative;
  overflow: hidden;
}
.etapa-regua--corrente::after {
  content: '';
  position: absolute;
  top: -2px;
  bottom: -2px;
  left: -18px;
  width: 18px;
  background: var(--color-accent);
  animation: etapa-cometa 1.9s var(--motion-ease) infinite;
}

@keyframes etapa-pulso {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent) 45%, transparent);
  }
  55% {
    box-shadow: 0 0 0 7px color-mix(in srgb, var(--color-accent) 0%, transparent);
  }
}

@keyframes etapa-carimbo {
  0% {
    transform: scale(0.86) rotate(-3deg);
  }
  60% {
    transform: scale(1.14) rotate(2deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}

/* `left: 100%` resolve na largura da régua — o quadrado atravessa exatamente o
   vão entre uma etapa e a seguinte, seja qual for a largura da tela */
@keyframes etapa-cometa {
  from {
    left: -18px;
  }
  to {
    left: 100%;
  }
}

/* O reset global de motion só encurta durações (`animation-duration !important`),
   o que não desliga animação nenhuma: quem precisa parar, para aqui. */
@media (prefers-reduced-motion: reduce) {
  .etapa--active .etapa-marco,
  .etapa--carimbo .etapa-marco {
    animation: none;
  }
  .etapa-regua--corrente::after {
    animation: none;
    left: 0;
    width: 100%;
    opacity: 0.35;
  }
}

@media (max-width: 640px) {
  .etapas {
    gap: var(--space-sm);
    padding: var(--space-md);
  }
  /* Em coluna a régua horizontal não liga nada — vira só um traço solto */
  .etapa-regua {
    display: none;
  }
  .etapa {
    width: 100%;
  }
}
</style>
