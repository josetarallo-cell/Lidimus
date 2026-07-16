<template>
  <!-- Skeleton em forma de prancha: carimbo + título + linhas de corpo.
       Uma barra de luz varre a folha, evocando o documento sendo lido. -->
  <div class="esqueleto" aria-hidden="true">
    <div class="esq-feixe" />
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
  background: var(--ld-folha);
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-md);
  overflow: hidden;
  margin-top: var(--ld-space-sm);
}

/* Feixe de leitura: uma faixa translúcida verde varre a folha de cima a baixo */
.esq-feixe {
  position: absolute;
  inset: 0 0 auto 0;
  height: 44%;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    transparent 0%,
    color-mix(in srgb, var(--ld-verde) 5%, transparent) 55%,
    color-mix(in srgb, var(--ld-verde) 11%, transparent) 88%,
    color-mix(in srgb, var(--ld-verde) 22%, transparent) 100%
  );
  border-bottom: 1px solid color-mix(in srgb, var(--ld-verde) 35%, transparent);
  animation: varredura 2.6s var(--ld-ease) infinite;
}

.esq-carimbo {
  display: flex;
  align-items: center;
  gap: var(--ld-space-lg);
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  background: var(--ld-papel);
}
.esq-marca {
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: var(--ld-r-xs);
  transform: rotate(45deg);
  background: var(--ld-bancada);
}
.esq-selo {
  margin-left: auto;
  width: 92px;
  height: 22px;
  flex: none;
  border-radius: var(--ld-r-xs);
  background: var(--ld-bancada);
}

.esq-corpo {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: var(--ld-space-xl) var(--ld-space-xl) var(--ld-space-2xl);
}

.esq-barra {
  display: block;
  height: 12px;
  border-radius: var(--ld-r-xs);
  background: linear-gradient(90deg, var(--ld-bancada) 25%, #e9edeb 45%, var(--ld-bancada) 65%);
  background-size: 200% 100%;
  animation: brilho 1.6s linear infinite;
}
.esq-barra--titulo {
  height: 26px;
  margin-bottom: var(--ld-space-sm);
}
.esq-barra--sub {
  height: 10px;
  margin-bottom: var(--ld-space-sm);
}

@keyframes brilho {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

/* Sobe até o topo, desce cobrindo a folha, e recomeça — leitura contínua */
@keyframes varredura {
  0% { transform: translateY(-46%); opacity: 0; }
  12% { opacity: 1; }
  88% { opacity: 1; }
  100% { transform: translateY(230%); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .esq-feixe { animation: none; opacity: 0.5; transform: none; }
  .esq-barra { animation-duration: 2.4s; }
}
</style>
