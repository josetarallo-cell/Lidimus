<script setup lang="ts">
// O componente-assinatura do produto (DESIGN.md): o bloco de identificação
// herdado da legenda de prancha técnica, idêntico em todos os laudos.
// O slot recebe o selo de status/veredito.
defineProps<{
  analise: string
  documentoLabel: string
  documento: string
  emitido: string
  // Data em que o cartório expediu a certidão analisada — só os laudos que
  // partem de um documento datado a informam. `certidaoAlerta` marca a data em
  // ocre quando ela não foi identificada ou está fora do prazo usual.
  certidao?: string
  certidaoAlerta?: boolean
}>()
</script>

<template>
  <header class="carimbo" aria-label="Identificação do documento">
    <div class="carimbo-cell carimbo-cell--marca">
      <img src="/logo.svg" alt="Lidimus" class="carimbo-logo" />
    </div>
    <div class="carimbo-cell">
      <span class="carimbo-label">Análise</span>
      <span>{{ analise }}</span>
    </div>
    <div class="carimbo-cell">
      <span class="carimbo-label">{{ documentoLabel }}</span>
      <span class="carimbo-id">{{ documento }}</span>
    </div>
    <div v-if="certidao" class="carimbo-cell">
      <span class="carimbo-label">Certidão</span>
      <span :class="{ 'carimbo-alerta': certidaoAlerta }">{{ certidao }}</span>
    </div>
    <div class="carimbo-cell">
      <span class="carimbo-label">Emitido</span>
      <span>{{ emitido }}</span>
    </div>
    <div class="carimbo-cell carimbo-cell--selo">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.carimbo {
  display: flex;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--ld-filete);
  background: var(--ld-papel);
}
.carimbo-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 10px var(--ld-space-md);
  border-right: 1px solid var(--ld-filete);
  font-size: 0.8125rem;
}
.carimbo-cell:last-child {
  border-right: none;
}
.carimbo-cell--marca {
  flex-direction: row;
  align-items: center;
}
.carimbo-logo {
  display: block;
  height: 26px;
  width: auto;
}
.carimbo-label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ld-tinta-suave);
}
.carimbo-id {
  font-family: var(--ld-font-mono);
}
.carimbo-alerta {
  color: var(--ld-ocre);
  font-weight: 600;
}
.carimbo-cell--selo {
  margin-left: auto;
  justify-content: center;
}

@media (max-width: 640px) {
  .carimbo-cell--marca {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--ld-filete);
  }
  .carimbo-cell--selo {
    margin-left: 0;
  }
}
</style>
