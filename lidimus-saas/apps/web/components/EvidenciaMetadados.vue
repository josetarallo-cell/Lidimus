<script setup lang="ts">
// Demonstração de texto oculto em metadados: reproduz a ficha interna do PDF
// como consta no arquivo, destacando os campos usados para esconder instruções
const props = defineProps<{ analysis: Record<string, any> }>()

const ROTULOS: Record<string, string> = {
  Title: 'Título',
  Author: 'Autor',
  Subject: 'Assunto',
  Keywords: 'Palavras-chave',
  Creator: 'Criado com',
  Producer: 'Gerado por',
  CreationDate: 'Data de criação',
  ModDate: 'Última modificação',
  PDFVersion: 'Versão do PDF',
}
const ORDEM = Object.keys(ROTULOS)

function formatarData(v: string): string {
  const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/.exec(String(v))
  if (!m) return v
  const [, ano, mes, dia, hora, min] = m
  return `${dia}/${mes}/${ano}${hora ? ` ${hora}:${min ?? '00'}` : ''}`
}

// Laudos antigos podem trazer valores com BOM UTF-16 (þÿ) ou bytes ilegíveis
function limparValor(v: string): string {
  return String(v).replace(/^þÿ/, '').replace(/�/g, '').trim()
}

const suspeitos = computed(() => new Set((props.analysis?.suspiciousFields ?? []) as string[]))

interface Linha {
  campo: string
  rotulo: string
  valor: string
  oculto: boolean
  suspeito: boolean
}

const linhas = computed<Linha[]>(() => {
  const raw = (props.analysis?.metadataRaw ?? {}) as Record<string, string>
  const custom = (props.analysis?.customFields ?? {}) as Record<string, string>
  const padrao = ORDEM.filter((k) => raw[k] != null && raw[k] !== '').map((k) => ({
    campo: k,
    rotulo: ROTULOS[k],
    valor: k.includes('Date') ? formatarData(raw[k]) : limparValor(raw[k]),
    oculto: false,
    suspeito: suspeitos.value.has(k),
  }))
  const ocultos = Object.entries(custom).map(([k, v]) => ({
    campo: k,
    rotulo: k,
    valor: limparValor(String(v)),
    oculto: true,
    suspeito: true,
  }))
  return [...padrao, ...ocultos]
})

const ai = computed(() => props.analysis?.aiAnalysis as Record<string, any> | null)

const SEVERIDADE: Record<string, string> = {
  critical: 'crítica',
  high: 'alta',
  medium: 'média',
  low: 'baixa',
  none: 'nenhuma',
}
</script>

<template>
  <div class="evidencia">
    <p class="evidencia-explica">
      Todo PDF carrega uma ficha interna de metadados — autor, datas, programa que gerou o
      arquivo. Ela não aparece na leitura do documento; só é vista em telas de "propriedades" ou
      por sistemas que processam o arquivo inteiro, como ferramentas de inteligência artificial.
      Por isso é um esconderijo conveniente: uma instrução plantada ali passa despercebida por
      qualquer conferência visual. A reprodução abaixo mostra a ficha deste arquivo como ela
      consta no PDF, com os campos estranhos destacados.
    </p>

    <div class="ficha" role="table" aria-label="Metadados internos do documento">
      <p class="ficha-cabecalho">Propriedades do documento — metadados internos do arquivo</p>
      <div
        v-for="l in linhas"
        :key="l.campo"
        class="ficha-linha"
        :class="{ 'ficha-linha--oculta': l.oculto, 'ficha-linha--suspeita': !l.oculto && l.suspeito }"
        role="row"
      >
        <span class="ficha-campo" role="cell">
          {{ l.rotulo }}
          <span v-if="l.oculto" class="ld-selo ld-selo--carimbo ficha-selo">campo oculto</span>
          <span v-else-if="l.suspeito" class="ld-selo ld-selo--ocre ficha-selo">suspeito</span>
        </span>
        <span class="ficha-valor" role="cell">{{ l.valor }}</span>
      </div>
    </div>

    <div v-if="ai?.isInjection" class="parecer">
      <p class="parecer-titulo">
        Avaliação automática do conteúdo
        <span v-if="ai.severity" class="ld-selo ld-selo--carimbo">
          gravidade {{ SEVERIDADE[String(ai.severity)] ?? ai.severity }}
        </span>
      </p>
      <p v-if="ai.intent" class="parecer-item"><strong>Intenção:</strong> {{ ai.intent }}</p>
      <p v-if="ai.potentialHarm" class="parecer-item">
        <strong>Dano possível:</strong> {{ ai.potentialHarm }}
      </p>
      <p v-if="ai.explanation" class="parecer-item">{{ ai.explanation }}</p>
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

/* A "ficha": reprodução dos metadados com aparência de painel de propriedades */
.ficha {
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  overflow: hidden;
  break-inside: avoid;
}
.ficha-cabecalho {
  margin: 0;
  padding: 10px var(--ld-space-md);
  background: var(--ld-bancada);
  border-bottom: 1px solid var(--ld-filete);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ld-tinta-suave);
}
.ficha-linha {
  display: grid;
  grid-template-columns: minmax(120px, 200px) 1fr;
  gap: var(--ld-space-md);
  padding: 8px var(--ld-space-md);
  font-family: var(--ld-font-mono);
  font-size: 0.8125rem;
  line-height: 1.5;
}
.ficha-linha + .ficha-linha {
  border-top: 1px solid var(--ld-filete);
}
.ficha-linha--suspeita {
  background: var(--ld-ocre-selo);
}
.ficha-linha--oculta {
  background: var(--ld-carimbo-selo);
}
.ficha-campo {
  color: var(--ld-tinta-suave);
}
.ficha-linha--oculta .ficha-campo {
  color: var(--ld-carimbo-tinta);
  font-weight: 700;
}
.ficha-valor {
  overflow-wrap: anywhere;
}
.ficha-selo {
  margin-left: var(--ld-space-xs);
  font-family: var(--ld-font-sans);
}

@media (max-width: 640px) {
  .ficha-linha {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}

.parecer {
  margin-top: var(--ld-space-md);
}
.parecer-titulo {
  margin: 0 0 var(--ld-space-xs);
  font-size: 0.875rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  flex-wrap: wrap;
}
.parecer-item {
  margin: var(--ld-space-xs) 0 0;
  font-size: 0.875rem;
  line-height: 1.6;
  max-width: 72ch;
}
</style>
