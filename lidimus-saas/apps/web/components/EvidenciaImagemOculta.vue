<script setup lang="ts">
// Demonstração de imagem com texto oculto: exibe a imagem extraída do PDF como
// ela aparece e uma versão com o contraste realçado que expõe o texto escondido
const props = defineProps<{ analysis: Record<string, any> }>()

const previews = computed(
  () => (props.analysis?.imagePreviews ?? []) as { mimeType: string; dataUrl: string }[],
)
const textos = computed(() => (props.analysis?.imageTexts ?? []) as string[])
const motivo = computed(() => String(props.analysis?.reason ?? ''))

const canvases = ref<(HTMLCanvasElement | null)[]>([])

// Realce: mapeia a faixa quase branca (onde a fraude se esconde) para a faixa
// visível inteira — o fundo segue branco e o texto pálido vira cinza-escuro
function revelar(dataUrl: string, canvas: HTMLCanvasElement) {
  const img = new Image()
  img.onload = () => {
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const px = data.data
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      const out = Math.max(0, Math.min(255, 255 - (255 - lum) * 10))
      px[i] = px[i + 1] = px[i + 2] = out
    }
    ctx.putImageData(data, 0, 0)
  }
  img.src = dataUrl
}

onMounted(() => {
  previews.value.forEach((p, i) => {
    const c = canvases.value[i]
    if (c) revelar(p.dataUrl, c)
  })
})
</script>

<template>
  <div class="evidencia">
    <p class="evidencia-explica">
      O documento traz embutida a imagem abaixo, com texto escrito em tom quase idêntico ao do
      fundo — imperceptível a olho nu na leitura normal. Sistemas de inteligência artificial que
      "enxergam" imagens leem esse texto sem dificuldade, e é para eles que a mensagem foi
      plantada. No quadro da direita, a mesma imagem passou por um realce de contraste que expõe
      o que estava escondido.
    </p>

    <div v-for="(p, i) in previews" :key="i" class="par-quadros">
      <figure class="quadro">
        <div class="quadro-moldura">
          <img :src="p.dataUrl" alt="Imagem embutida no documento, na aparência original" />
        </div>
        <figcaption>Imagem como aparece no documento</figcaption>
      </figure>
      <figure class="quadro">
        <div class="quadro-moldura quadro-moldura--revelado">
          <canvas
            :ref="(el) => { canvases[i] = el as HTMLCanvasElement | null }"
            role="img"
            aria-label="Mesma imagem com contraste realçado, expondo o texto oculto"
          />
        </div>
        <figcaption>Contraste realçado — o texto oculto exposto</figcaption>
      </figure>
    </div>

    <div v-if="textos.length" class="lido">
      <p class="lido-titulo">Texto identificado dentro da imagem:</p>
      <ul>
        <li v-for="(t, i) in textos" :key="i">“{{ t }}”</li>
      </ul>
      <p v-if="motivo" class="lido-motivo">{{ motivo }}</p>
    </div>
  </div>
</template>

<style scoped>
.evidencia-explica {
  margin: 0 0 var(--ld-space-md);
  max-width: 72ch;
  font-size: 0.9375rem;
  line-height: 1.6;
  text-wrap: pretty;
}

.par-quadros {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ld-space-md);
}
.par-quadros + .par-quadros {
  margin-top: var(--ld-space-lg);
}
@media (max-width: 640px) {
  .par-quadros {
    grid-template-columns: 1fr;
  }
}

.quadro {
  margin: 0;
  break-inside: avoid;
}
.quadro-moldura {
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: #ffffff;
  padding: var(--ld-space-sm);
}
.quadro-moldura--revelado {
  border-color: var(--ld-carimbo);
  background: var(--ld-carimbo-selo);
}
.quadro-moldura img,
.quadro-moldura canvas {
  display: block;
  width: 100%;
  height: auto;
}
.quadro figcaption {
  margin-top: var(--ld-space-xs);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}

.lido {
  margin-top: var(--ld-space-md);
}
.lido-titulo {
  margin: 0 0 var(--ld-space-xs);
  font-size: 0.875rem;
  font-weight: 600;
}
.lido ul {
  margin: 0;
  padding-left: 1.25rem;
}
.lido li {
  font-family: var(--ld-font-mono);
  font-size: 0.8125rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.lido-motivo {
  margin: var(--ld-space-sm) 0 0;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
  max-width: 72ch;
}
</style>
