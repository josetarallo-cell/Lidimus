<script setup lang="ts">
// A folha em leitura: o fundo da tela de espera.
//
// Enquanto o OCR não terminou não há o que mostrar, e a cena cai no esqueleto de
// barras. Assim que o texto da certidão existe (`stageData.ocr.texto_ocr`, que o
// SSE entrega na virada para a etapa jurídica), o fundo passa a ser o documento
// de verdade rolando devagar, com os termos registrais acendendo conforme
// passam. Quem espera três minutos vê o próprio documento sendo lido — não uma
// barra genérica fingindo trabalho.
const props = withDefaults(
  defineProps<{
    /** Texto lido do documento; ausente enquanto o OCR não fecha */
    texto?: string | null
  }>(),
  { texto: null },
)

// Recorte: o suficiente para a fita nunca dar a volta rápido demais, e pouco
// bastante para não pesar na renderização de uma tela que fica minutos aberta.
const LIMITE_CARACTERES = 6000
const LIMITE_LINHAS = 70

// Os termos que um registrador procura primeiro numa matrícula. Grifá-los é o
// único lugar da tela onde o acento aparece sobre conteúdo — e ali ele mantém o
// significado que tem no resto do produto: risco jurídico.
const TERMOS =
  /(hipotec\w*|penhora\w*|arrolament\w*|usufrut\w*|aliena[çc][ãa]o fiduci[áa]ria|indisponibilidade|arrest\w*|servid[ãa]o|cl[áa]usula\w*|inalienabilidade|impenhorabilidade|incomunicabilidade|compra e venda|doa[çc][ãa]o|invent[áa]rio|partilha|averba[çc][ãa]o|usucapi[ãa]o|arremata[çc][ãa]o|adjudica[çc][ãa]o|penhor\b)/gi

type Fragmento = { t: string; g: boolean }

const linhas = computed<Fragmento[][]>(() => {
  const bruto = props.texto
  if (!bruto) return []

  const recorte = bruto.slice(0, LIMITE_CARACTERES)
  const cruas = recorte
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, LIMITE_LINHAS)

  // `split` com grupo de captura devolve os trechos e os termos intercalados —
  // os índices ímpares são as ocorrências. Nada de HTML montado à mão: o texto é
  // conteúdo do cliente e sai daqui como nó de texto, não como marcação.
  return cruas.map((linha) =>
    linha
      .split(TERMOS)
      .filter((p) => p !== undefined && p !== '')
      .map((parte, i) => ({ t: parte, g: i % 2 === 1 })),
  )
})

const temTexto = computed(() => linhas.value.length > 0)

// A fita corre proporcional ao que tem para ler: pouco texto não pode passar
// voando, muito texto não pode demorar uma era para dar a volta.
const duracao = computed(() => `${Math.min(180, Math.max(40, linhas.value.length * 1.6))}s`)
</script>

<template>
  <div class="cena" :class="{ 'cena--texto': temTexto }">
    <!-- Fundo: o documento em leitura, ou o esqueleto enquanto ele não existe -->
    <div v-if="temTexto" class="cena-janela" aria-hidden="true">
      <div class="cena-fita" :style="{ '--cena-dur': duracao }">
        <!-- Duas cópias: a segunda entra no lugar da primeira e o rolo não tem emenda -->
        <div v-for="copia in 2" :key="copia" class="cena-bloco">
          <p v-for="(linha, i) in linhas" :key="i" class="cena-linha">
            <template v-for="(f, j) in linha" :key="j">
              <mark v-if="f.g" class="cena-grifo" :style="{ '--i': i }">{{ f.t }}</mark>
              <template v-else>{{ f.t }}</template>
            </template>
          </p>
        </div>
      </div>
    </div>
    <PranchaEsqueleto v-else sem-moldura />

    <!-- Feixe de leitura: uma régua varrendo a folha de cima a baixo -->
    <div class="cena-feixe" aria-hidden="true" />

    <!-- O painel de estado repousa no centro da folha -->
    <div class="cena-palco">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.cena {
  position: relative;
  overflow: hidden;
  min-height: 26rem;
  background: var(--color-folha);
  border: var(--rule) solid var(--color-text);
}

/* ── O documento rolando ─────────────────────────────────── */
.cena-janela {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* Esmaece topo e base: o texto entra e sai da folha em vez de ser decepado.
     A máscara lê só o canal alfa — a cor das paradas opacas é indiferente, e
     usar o token evita cravar um literal fora da paleta. */
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent,
    var(--color-text) 12%,
    var(--color-text) 88%,
    transparent
  );
  mask-image: linear-gradient(
    to bottom,
    transparent,
    var(--color-text) 12%,
    var(--color-text) 88%,
    transparent
  );
}
.cena-fita {
  animation: cena-rolar var(--cena-dur, 90s) linear infinite;
  will-change: transform;
}
.cena-bloco {
  padding: var(--space-lg) var(--space-xl);
}
.cena-linha {
  margin: 0 0 0.35em;
  font-family: var(--font-body);
  font-size: 0.9375rem;
  line-height: 1.7;
  /* Decorativo e atrás do painel: fica em tinta rebaixada, nunca disputando
     leitura com o que importa na tela */
  color: color-mix(in srgb, var(--color-text) 38%, transparent);
}

/* O grifo acende da esquerda para a direita, como marca-texto passando. A cor
   fica na tarja, não na letra: termo escrito em vermelho no meio do documento
   leria como "risco encontrado", e quem decide isso é o parecer, não a espera. */
.cena-grifo {
  background-image: linear-gradient(
    color-mix(in srgb, var(--color-accent-300) 75%, transparent),
    color-mix(in srgb, var(--color-accent-300) 75%, transparent)
  );
  background-repeat: no-repeat;
  background-size: 0 100%;
  color: color-mix(in srgb, var(--color-text) 62%, transparent);
  animation: cena-grifar 700ms var(--motion-ease) forwards;
  animation-delay: calc(var(--i, 0) * 90ms);
}

/* ── Feixe ───────────────────────────────────────────────── */
.cena-feixe {
  position: absolute;
  inset: 0 0 auto 0;
  height: 38%;
  pointer-events: none;
  border-bottom: var(--rule) solid var(--color-text);
  background: linear-gradient(
    180deg,
    transparent 0%,
    color-mix(in srgb, var(--color-text) 5%, transparent) 65%,
    color-mix(in srgb, var(--color-text) 13%, transparent) 100%
  );
  animation: cena-varredura 3.4s var(--motion-ease) infinite;
}

/* ── Palco do painel ─────────────────────────────────────── */
.cena-palco {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-lg);
  pointer-events: none;
}
.cena-palco :deep(> *) {
  pointer-events: auto;
}

@keyframes cena-rolar {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-50%);
  }
}
@keyframes cena-grifar {
  to {
    background-size: 100% 100%;
  }
}
@keyframes cena-varredura {
  0% {
    transform: translateY(-40%);
    opacity: 0;
  }
  14% {
    opacity: 1;
  }
  86% {
    opacity: 1;
  }
  100% {
    transform: translateY(265%);
    opacity: 0;
  }
}

/* O reset global só encurta durações; parar de verdade é aqui. Sem movimento a
   cena vira uma folha estática legível: texto parado, grifos já marcados. */
@media (prefers-reduced-motion: reduce) {
  .cena-fita {
    animation: none;
  }
  .cena-grifo {
    animation: none;
    background-size: 100% 100%;
  }
  .cena-feixe {
    animation: none;
    opacity: 0.45;
    transform: none;
  }
}

@media (max-width: 640px) {
  .cena {
    min-height: 30rem;
  }
  .cena-bloco {
    padding: var(--space-md);
  }
}

@media print {
  .cena {
    display: none;
  }
}
</style>
