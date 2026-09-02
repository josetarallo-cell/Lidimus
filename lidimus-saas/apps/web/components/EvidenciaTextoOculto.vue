<script setup lang="ts">
// Demonstração de texto oculto por estilo: mostra o trecho como ele aparece na
// página (invisível) e o mesmo trecho revelado, com a técnica usada na fraude
const props = defineProps<{ analysis: Record<string, any> }>()

interface ItemOculto {
  text: string
  hiddenByColor: boolean
  invisibleRender: boolean
  renderMode?: number
  tinyFont: boolean
  zeroSize?: boolean
  transparent?: boolean
  alpha?: number
  offPage?: boolean
  offPageReason?: 'fora_mediabox' | 'fora_cropbox'
  position?: { x: number; y: number }
  color: { css: string; luminance: number } | null
  fontSize: number
  pageHint?: number
}

const itens = computed(() => (props.analysis?.hiddenItems ?? []) as ItemOculto[])

// O trecho escondido pela codificação do caractere não tem glifo: exibi-lo cru
// pinta uma caixa vazia. `revelarTextoOculto` traz os pontos de código de volta
// ao alfabeto — ver utils/textoOculto.ts.
const algumItemComInvisiveis = computed(() =>
  itens.value.some((it) => temCaracteresInvisiveis(it.text)),
)

const NOME_DA_FAMILIA: Record<string, string> = {
  'tags': 'caracteres Unicode sem glifo (tags U+E0000–U+E007F)',
  'largura-zero': 'caracteres de largura zero (U+200B e afins)',
  'bidi': 'controles de direção de texto (U+202E e afins)',
  'seletor': 'seletores de variação',
  'sem-glifo': 'caracteres preenchedores sem desenho',
}

function tecnica(it: ItemOculto): string {
  const partes: string[] = []
  if (it.hiddenByColor) {
    partes.push(
      it.color && it.color.luminance >= 0.999
        ? 'fonte branca sobre a folha branca'
        : `fonte quase branca (${it.color?.css ?? 'tom claro'}) sobre a folha branca`,
    )
  }
  if (it.invisibleRender) {
    partes.push(
      it.renderMode === 7
        ? 'modo de renderização 7 — o texto só recorta, não é pintado'
        : 'modo de renderização invisível do PDF',
    )
  }
  if (it.tinyFont) partes.push(`fonte de ${String(it.fontSize).replace('.', ',')} pt — ilegível a olho nu`)
  if (it.zeroSize) partes.push('dimensão nula — corpo, escala ou matriz de texto zerados')
  if (it.transparent) partes.push(`transparência total (alfa ${it.alpha ?? 0})`)
  if (it.offPage) {
    partes.push(
      it.offPageReason === 'fora_cropbox'
        ? 'posicionado na faixa da folha que o recorte de exibição esconde'
        : `posicionado fora da página${it.position ? ` (${it.position.x}, ${it.position.y})` : ''}`,
    )
  }
  for (const f of familiasPresentes(it.text)) partes.push(NOME_DA_FAMILIA[f] ?? f)
  return partes.join(' + ')
}

// Reproduz a aparência real: cor original da fonte e, para os casos em que o
// texto não chega a ser pintado, o equivalente visual mais próximo.
function estiloInvisivel(it: ItemOculto) {
  const invisivel = it.invisibleRender || it.transparent || it.zeroSize
  return {
    color: invisivel ? 'transparent' : (it.color?.css ?? '#ffffff'),
    fontSize: it.tinyFont ? '5px' : undefined,
    // Texto fora da folha não está nesta moldura — a caixa fica vazia de
    // propósito, que é o que o leitor encontraria no papel.
    opacity: it.offPage ? 0 : undefined,
  }
}
</script>

<template>
  <div class="evidencia">
    <p class="evidencia-explica">
      Este documento contém texto pintado para não ser visto: a fonte usa a mesma cor do papel
      (ou um tamanho ilegível), então o trecho não aparece para quem lê — mas continua gravado no
      arquivo e é lido normalmente por sistemas automatizados, como as ferramentas de inteligência
      artificial usadas para resumir e analisar documentos. É assim que se planta uma instrução
      escondida: quem assina ou aceita o documento não a vê; a máquina que o processa, sim.
    </p>

    <p v-if="algumItemComInvisiveis" class="evidencia-explica">
      Parte do conteúdo oculto deste arquivo usa uma técnica mais fina: os caracteres não têm
      desenho nenhum. Podem estar numa faixa do Unicode reservada a marcações (U+E0000–U+E007F),
      ter largura zero, ou ser controles que invertem a ordem de leitura. Aqui a invisibilidade
      não vem da cor nem do tamanho — vem do próprio código do caractere, e resiste a copiar,
      colar e imprimir. O trecho chega íntegro, letra por letra, a qualquer sistema que leia o
      texto do arquivo. O quadro revelado traz esses códigos de volta ao alfabeto.
    </p>

    <div v-for="(it, i) in itens" :key="i" class="par">
      <p class="par-tecnica">
        Trecho {{ i + 1 }}<template v-if="it.pageHint"> · página {{ it.pageHint }}</template> —
        {{ tecnica(it) }}
      </p>
      <div class="par-quadros">
        <figure class="quadro">
          <div class="quadro-folha" aria-hidden="true">
            <span :style="estiloInvisivel(it)">{{ it.text }}</span>
          </div>
          <figcaption>O que o olho vê na página</figcaption>
        </figure>
        <figure class="quadro">
          <div class="quadro-folha quadro-folha--revelado">
            <span>{{ revelarTextoOculto(it.text) }}</span>
          </div>
          <figcaption>
            O mesmo trecho, revelado<template v-if="temCaracteresInvisiveis(it.text)"> — decodificado de volta ao alfabeto</template>
          </figcaption>
        </figure>
      </div>
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

.par + .par {
  margin-top: var(--ld-space-lg);
}
.par-tecnica {
  margin: 0 0 var(--ld-space-sm);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ld-carimbo-tinta);
}

.par-quadros {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ld-space-md);
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
.quadro-folha {
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: #ffffff;
  padding: var(--ld-space-md);
  min-height: 72px;
  font-size: 0.875rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
  /* O trecho analisado é hostil e vai cru para o DOM aqui, de propósito: este
     quadro mostra o que o olho veria na página. Sem isolamento, um controle de
     direção de texto (U+202E) plantado no documento inverteria o texto do laudo
     em volta — a página que denuncia o ataque passaria a executá-lo. */
  unicode-bidi: isolate;
}
.quadro-folha--revelado {
  border-color: var(--ld-carimbo);
  background: var(--ld-carimbo-selo);
  color: var(--ld-tinta);
  font-family: var(--ld-font-mono);
  font-size: 0.8125rem;
}
.quadro figcaption {
  margin-top: var(--ld-space-xs);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
</style>
