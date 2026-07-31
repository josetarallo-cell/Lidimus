<script setup lang="ts">
// Esqueleto em forma de prancha: carimbo + título + linhas de corpo.
//
// `semMoldura` existe porque a cena de leitura (CenaLeitura.vue) já desenha a
// folha e a régua em volta — sem isso, o esqueleto entraria como caixa dentro de
// caixa, que o sistema Modernista proíbe.
withDefaults(defineProps<{ semMoldura?: boolean }>(), { semMoldura: false })
</script>

<template>
  <div class="esqueleto" :class="{ 'esqueleto--nu': semMoldura }" aria-hidden="true">
    <div class="esq-carimbo">
      <span class="esq-marca" />
      <span class="esq-barra" style="width: 96px" />
      <span class="esq-barra" style="width: 140px" />
      <span class="esq-selo" />
    </div>
    <div class="esq-corpo">
      <span class="esq-barra esq-barra--titulo" style="width: 44%" />
      <span class="esq-barra esq-barra--sub" style="width: 30%" />
      <span class="esq-barra" style="width: 86%" />
      <span class="esq-barra" style="width: 72%" />
      <span class="esq-barra" style="width: 81%" />
      <span class="esq-barra" style="width: 64%" />
    </div>
  </div>
</template>

<style scoped>
.esqueleto {
  position: relative;
  background: var(--color-folha);
  border: var(--rule) solid var(--color-text);
  overflow: hidden;
  margin-top: var(--space-sm);
}
/* Dentro da cena, a moldura é de quem hospeda; o corpo estica para preencher a
   folha inteira, em vez de deixar um vão em branco abaixo das últimas barras */
.esqueleto--nu {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  margin-top: 0;
  border: 0;
  background: transparent;
}
.esqueleto--nu .esq-corpo {
  flex: 1;
  justify-content: center;
}

.esq-carimbo {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  border-bottom: var(--rule-fina) solid var(--color-divider);
}
.esq-marca {
  width: 22px;
  height: 22px;
  flex: none;
  background: var(--color-surface);
}
.esq-selo {
  margin-left: auto;
  width: 92px;
  height: 22px;
  flex: none;
  background: var(--color-surface);
}

.esq-corpo {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: var(--space-xl) var(--space-xl) var(--space-2xl);
}

.esq-barra {
  display: block;
  height: 12px;
  background: linear-gradient(
    90deg,
    var(--color-surface) 25%,
    color-mix(in srgb, var(--color-surface) 55%, var(--color-folha)) 45%,
    var(--color-surface) 65%
  );
  background-size: 200% 100%;
  animation: brilho 1.6s linear infinite;
}
.esq-barra--titulo {
  height: 26px;
  margin-bottom: var(--space-sm);
}
.esq-barra--sub {
  height: 10px;
  margin-bottom: var(--space-sm);
}

@keyframes brilho {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

/* O reset global de motion mexe só em `animation-duration`, e com `!important`:
   encurtar não desliga, e a barra ficaria piscando no fim do keyframe. Quem
   pede menos movimento recebe barra parada. */
@media (prefers-reduced-motion: reduce) {
  .esq-barra {
    animation: none;
    background: var(--color-surface);
  }
}
</style>
