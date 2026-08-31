<script setup lang="ts">
// Demonstração da quinta camada: texto que mora na estrutura interna do PDF e
// nunca passa pela renderização. Ao contrário do texto oculto por estilo, aqui
// não há "o que o olho vê" — o conteúdo simplesmente não é desenhado. O que
// vale mostrar é a atribuição: de que campo do arquivo o trecho veio.
const props = defineProps<{ analysis: Record<string, any> }>()

interface ItemEstrutural {
  type: string
  origin: string
  text: string
  severity: 'alta' | 'media' | 'baixa'
  detail?: Record<string, any>
}

const itens = computed(() => (props.analysis?.structuralItems ?? []) as ItemEstrutural[])

// Só entram no quadro os campos que de fato escondem conteúdo. /Alt, sumário e
// dados de assinatura são legítimos na maioria dos PDFs bem formados e ficariam
// como ruído ao lado de um /ActualText divergente.
const relevantes = computed(() => itens.value.filter((it) => it.severity !== 'baixa'))

const temActualText = computed(() => relevantes.value.some((it) => it.type === 'actualtext'))
const temCamada = computed(() => relevantes.value.some((it) => it.type === 'ocg_desligada'))

const ROTULO: Record<string, string> = {
  actualtext: 'Texto substituto (/ActualText)',
  alt: 'Texto alternativo (/Alt)',
  ocg_desligada: 'Camada desligada',
  ocg: 'Camada',
  xfa: 'Formulário XFA',
  anot_oculta: 'Anotação oculta',
  anotacao: 'Anotação',
  campo_oculto: 'Campo de formulário oculto',
  campo: 'Campo de formulário',
  tooltip: 'Dica de campo (tooltip)',
  js: 'Ação automática',
  anexo: 'Arquivo embutido',
  outline: 'Item do sumário',
  assinatura: 'Dado da assinatura',
}

const rotulo = (it: ItemEstrutural) => ROTULO[it.type] ?? it.type
</script>

<template>
  <div class="evidencia">
    <p class="evidencia-explica">
      Um PDF guarda texto em muitos lugares além da página impressa: anotações, camadas,
      campos de formulário e rótulos de acessibilidade. Esses campos não são desenhados na
      tela, mas continuam no arquivo e são lidos normalmente por sistemas automatizados —
      inclusive pelas ferramentas de inteligência artificial usadas para resumir documentos.
      O quadro abaixo mostra o que foi encontrado e de qual campo do arquivo cada trecho veio.
    </p>

    <p v-if="temActualText" class="evidencia-explica">
      Um dos trechos está em <code>/ActualText</code>. Esse campo existe para substituir o texto
      da página na hora de copiar ou extrair o conteúdo — é um recurso de acessibilidade. Quando
      o valor declarado ali diz algo diferente do que está impresso, quem lê a folha vê uma coisa
      e quem lê o arquivo recebe outra, sem que nenhum dos dois esteja com defeito.
    </p>

    <p v-if="temCamada" class="evidencia-explica">
      O documento traz uma camada desligada por padrão. O conteúdo dela não aparece na tela nem
      na impressão, mas permanece gravado no arquivo e é devolvido por praticamente qualquer
      programa que extraia o texto.
    </p>

    <ul class="itens">
      <li v-for="(it, i) in relevantes" :key="i" class="item">
        <p class="item-cabeca">
          <span class="ld-selo" :class="it.severity === 'alta' ? 'ld-selo--critico' : 'ld-selo--ocre'">
            {{ rotulo(it) }}
          </span>
          <span class="item-origem">{{ it.origin }}</span>
        </p>
        <div class="item-texto">{{ revelarTextoOculto(it.text) }}</div>
        <p v-if="it.detail?.autor" class="item-nota">Anotação atribuída a “{{ it.detail.autor }}”.</p>
      </li>
    </ul>
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
.evidencia-explica code {
  font-family: var(--ld-font-mono);
  font-size: 0.875em;
}

.itens {
  margin: 0;
  padding: 0;
  list-style: none;
}
.item + .item {
  margin-top: var(--ld-space-lg);
}
.item {
  break-inside: avoid;
}

.item-cabeca {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ld-space-sm);
  margin: 0 0 var(--ld-space-xs);
}
.item-origem {
  font-family: var(--ld-font-mono);
  font-size: 0.75rem;
  color: var(--ld-tinta-suave);
  overflow-wrap: anywhere;
}

.item-texto {
  border: 1px solid var(--ld-carimbo);
  border-radius: var(--ld-r-sm);
  background: var(--ld-carimbo-selo);
  color: var(--ld-tinta);
  padding: var(--ld-space-md);
  font-family: var(--ld-font-mono);
  font-size: 0.8125rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.item-nota {
  margin: var(--ld-space-xs) 0 0;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
</style>
