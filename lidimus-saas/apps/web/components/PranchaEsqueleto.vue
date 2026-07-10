<template>
  <!-- Skeleton em forma de prancha: carimbo + título + linhas de corpo -->
  <div class="esqueleto" aria-hidden="true">
    <div class="esq-carimbo">
      <span class="esq-barra" style="width: 96px" />
      <span class="esq-barra" style="width: 140px" />
      <span class="esq-barra" style="width: 110px" />
    </div>
    <div class="esq-corpo">
      <span class="esq-barra esq-barra--titulo" style="width: 44%" />
      <span class="esq-barra" style="width: 30%" />
      <span class="esq-barra" style="width: 86%" />
      <span class="esq-barra" style="width: 72%" />
      <span class="esq-barra" style="width: 81%" />
    </div>
  </div>
</template>

<style scoped>
.esqueleto {
  background: var(--ld-folha);
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-md);
  overflow: hidden;
  margin-top: var(--ld-space-sm);
}
.esq-carimbo {
  display: flex;
  gap: var(--ld-space-lg);
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
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
  animation: brilho 1.4s linear infinite;
}
.esq-barra--titulo {
  height: 26px;
  margin-bottom: var(--ld-space-sm);
}
@keyframes brilho {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>
