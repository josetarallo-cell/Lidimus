<script setup lang="ts">
// Medidor em semicírculo: fatias iguais em gradiente verde→vermelho, uma agulha
// apontando a fatia atual e um rótulo de uma palavra por fatia. Nada de números
// — a posição da agulha e a palavra já dizem tudo, e quem quiser a frase inteira
// passa o mouse ou chega no rótulo com Tab.
//
// Nasceu no laudo de autenticidade da matrícula e vive aqui porque o laudo do
// detector usa o mesmo instrumento com outra escala: duplicar a geometria e os
// 150 px de CSS faria os dois medidores divergirem no primeiro ajuste fino.
//
// O fundo do furo central acompanha a folha em que o medidor está posado — cada
// laudo tem a sua cor de papel. Quem usa passa `--medidor-fundo`; sem isso, o
// papel padrão da interface.

export type FatiaMedidor = {
  cor: string
  rotuloCurto: string
  tituloCarimbo: string
  textoCarimbo: string
}

const props = withDefaults(
  defineProps<{
    fatias: FatiaMedidor[]
    indiceAtual: number
    /** Completa a frase lida por leitor de tela na fatia atual */
    notaAtual?: string
  }>(),
  { notaAtual: 'resultado deste documento' },
)

// Ângulo da fatia i, em graus a partir da vertical (0° = para cima, negativo =
// para a esquerda, positivo = para a direita) — usado tanto pela agulha (fatia
// atual) quanto pela posição de cada rótulo (todas as fatias), por isso é uma
// função só, não duas contas repetidas.
function anguloDaFatia(i: number): number {
  const passo = 180 / props.fatias.length
  return (i + 0.5) * passo - 90
}

const anguloAgulha = computed(() => anguloDaFatia(props.indiceAtual))

// `conic-gradient(from 270deg…)` começa a contagem apontando para a esquerda
// (9h) e soma no sentido horário — exatamente o percurso esquerda → topo →
// direita que o medidor precisa; a metade de baixo (180°–360°) fica transparente
// porque o palco só mostra a metade de cima (ver .medidor-arco no <style>).
const gradiente = computed(() => {
  const passo = 180 / props.fatias.length
  const paradas = props.fatias.map(
    (f, i) => `${f.cor} ${(i * passo).toFixed(2)}deg ${((i + 1) * passo).toFixed(2)}deg`,
  )
  return `conic-gradient(from 270deg, ${paradas.join(', ')}, transparent 180deg 360deg)`
})

// Centro do palco (300×150) e raio onde os rótulos ficam — um pouco além do anel
// (raio externo 150px), para não sobrepor as cores.
const CENTRO = 150
const RAIO_ROTULO = 172
const posicoes = computed(() =>
  props.fatias.map((_, i) => {
    const rad = (anguloDaFatia(i) * Math.PI) / 180
    return {
      left: `${(CENTRO + RAIO_ROTULO * Math.sin(rad)).toFixed(1)}px`,
      top: `${(CENTRO - RAIO_ROTULO * Math.cos(rad)).toFixed(1)}px`,
    }
  }),
)

// De que lado a caixa de ajuda abre. Uma caixa sempre centralizada no rótulo da
// ponta direita estoura a borda da página — por isso os rótulos da metade
// esquerda abrem a caixa para a direita, os da metade direita abrem para a
// esquerda, e só o do meio fica centralizado.
function ladoTooltip(i: number): 'esquerda' | 'centro' | 'direita' {
  const meio = (props.fatias.length - 1) / 2
  if (i < meio) return 'esquerda'
  if (i > meio) return 'direita'
  return 'centro'
}
</script>

<template>
  <div class="medidor-palco">
    <div class="medidor-arco">
      <div class="medidor-anel" :style="{ background: gradiente }"></div>
      <div class="medidor-furo"></div>
      <div class="medidor-agulha" :style="{ transform: `rotate(${anguloAgulha}deg)` }"></div>
    </div>
    <div class="medidor-rotulos">
      <button
        v-for="(fatia, i) in fatias"
        :key="fatia.rotuloCurto"
        type="button"
        class="medidor-rotulo"
        :class="{ 'medidor-rotulo--atual': i === indiceAtual }"
        :style="posicoes[i]"
      >
        <span class="medidor-rotulo-ponto" :style="{ background: fatia.cor }" aria-hidden="true"></span>
        {{ fatia.rotuloCurto }}
        <span v-if="i === indiceAtual" class="sr-only"> — {{ notaAtual }}</span>
        <span class="medidor-tooltip" :class="`medidor-tooltip--${ladoTooltip(i)}`" role="tooltip">
          <strong>{{ fatia.tituloCarimbo }}</strong>
          {{ fatia.textoCarimbo }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.medidor-palco {
  position: relative;
  width: 300px;
  height: 150px;
  margin: 0 auto;
}
.medidor-arco {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.medidor-anel {
  position: absolute;
  top: 0;
  left: 0;
  width: 300px;
  height: 300px;
  border-radius: 50%;
}
.medidor-furo {
  position: absolute;
  left: 50%;
  top: 40px;
  width: 195px;
  height: 195px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: var(--medidor-fundo, var(--ld-papel));
}
.medidor-agulha {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 4px;
  height: 108px;
  margin-left: -2px;
  background: var(--ld-tinta);
  transform-origin: bottom center;
  border-radius: 3px 3px 0 0;
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.medidor-agulha::after {
  content: "";
  position: absolute;
  bottom: -8px;
  left: 50%;
  width: 18px;
  height: 18px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: var(--ld-tinta);
}
@media (prefers-reduced-motion: reduce) {
  .medidor-agulha {
    transition: none;
  }
}

.medidor-rotulos {
  position: absolute;
  inset: 0;
}
.medidor-rotulo {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 62px;
  background: none;
  border: none;
  padding: 3px 2px;
  border-radius: 4px;
  font-family: var(--ld-font-sans);
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.15;
  color: var(--ld-tinta-suave);
  text-align: center;
  cursor: help;
}
.medidor-rotulo-ponto {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.medidor-rotulo:hover,
.medidor-rotulo:focus-visible {
  color: var(--ld-tinta);
  background: var(--ld-bancada);
}
.medidor-rotulo--atual {
  color: var(--ld-tinta);
  font-weight: 700;
}

.medidor-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  width: 208px;
  padding: 10px 12px;
  border-radius: var(--ld-r-xs);
  background: var(--ld-tinta);
  color: var(--ld-papel);
  font-family: var(--ld-font-sans);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.5;
  text-align: left;
  white-space: normal;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
  z-index: 5;
}
.medidor-tooltip strong {
  display: block;
  margin-bottom: 3px;
  font-weight: 700;
}
/* Três ancoragens — ver ladoTooltip() no script: centralizada só faz sentido
   para o rótulo do meio, senão a caixa estoura a borda da página nas pontas. */
.medidor-tooltip--centro {
  left: 50%;
  transform: translate(-50%, 4px);
}
.medidor-tooltip--esquerda {
  left: -10px;
  transform: translate(0, 4px);
}
.medidor-tooltip--direita {
  right: -10px;
  transform: translate(0, 4px);
}
.medidor-rotulo:hover .medidor-tooltip--centro,
.medidor-rotulo:focus-visible .medidor-tooltip--centro {
  opacity: 1;
  transform: translate(-50%, 0);
}
.medidor-rotulo:hover .medidor-tooltip--esquerda,
.medidor-rotulo:focus-visible .medidor-tooltip--esquerda,
.medidor-rotulo:hover .medidor-tooltip--direita,
.medidor-rotulo:focus-visible .medidor-tooltip--direita {
  opacity: 1;
  transform: translate(0, 0);
}
@media (prefers-reduced-motion: reduce) {
  .medidor-tooltip {
    transition: none;
  }
}

/* Os rótulos das pontas passam ~48px além do palco de cada lado — abaixo de
   ~440px de viewport isso escapa da folha do laudo, que corta o que transborda
   (overflow: hidden). Encolher o conjunto é o que cabe: reduzir o raio dos
   rótulos os jogaria por cima do anel. */
@media (max-width: 440px) {
  .medidor-palco {
    transform: scale(0.82);
    transform-origin: top center;
  }
}
</style>
