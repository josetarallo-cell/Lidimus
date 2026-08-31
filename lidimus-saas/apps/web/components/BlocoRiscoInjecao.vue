<script setup lang="ts">
// Bloco de abertura do laudo do detector: o veredito por extenso à esquerda, o
// medidor à direita. É o mesmo instrumento do laudo de matrícula (MedidorArco),
// com outra escala — a de risco de injeção, em NIVEIS_INJECAO.
//
// Sob o resumo vai a lista das camadas de detecção, que é o segundo eixo da
// escala: mostra por onde a varredura passou, o que cada camada encontrou e —
// o que decide o nível — se o que ela encontrou dá ordens a uma IA. Sem essa
// lista o medidor seria um número sem prestação de contas.
import type { AnaliseRisco, Camada } from '~/utils/riscoInjecao'
import { FAIXA_SELO, NIVEIS_INJECAO } from '~/utils/riscoInjecao'

const props = defineProps<{ analise: AnaliseRisco }>()

const DOC_DETECTOR_URL = '/docs/detector#niveis'

const nivel = computed(() => props.analise.nivel)

type EstadoCamada = { classe: string; texto: string; nota: string }

const linhas = computed(() => props.analise.camadas.map((c) => ({ camada: c, estado: estado(c) })))

function estado(c: Camada): EstadoCamada {
  if (c.payload) {
    return {
      classe: 'ld-selo--carimbo',
      texto: 'Instrução para IA',
      nota: 'o que foi encontrado aqui dá ordens a uma inteligência artificial',
    }
  }
  if (c.encontrou && c.ocultacao) {
    return {
      classe: 'ld-selo--ocre',
      texto: 'Conteúdo oculto',
      nota: 'encontrou texto escondido do leitor, sem ordem dirigida a uma IA',
    }
  }
  if (c.encontrou) {
    return {
      classe: 'ld-selo--ocre',
      texto: 'Sinal atípico',
      nota: 'campo fora do padrão, sem texto escondido',
    }
  }
  // Ausência de análise não é ausência de risco: é ausência de dado, e a lista
  // diz qual dos dois é o caso desta camada neste documento.
  if (!c.disponivel) {
    return { classe: 'ld-selo--neutro', texto: 'Não se aplica', nota: 'nada a examinar neste arquivo' }
  }
  return { classe: 'ld-selo--neutro', texto: 'Nada', nota: `examinou ${c.exame}` }
}
</script>

<template>
  <section class="secao secao-risco" aria-labelledby="sec-risco">
    <div class="secao-cabecalho">
      <h2 id="sec-risco">Nível de risco</h2>
      <span class="ld-selo" :class="FAIXA_SELO[nivel.faixa]">{{ nivel.titulo }}</span>
    </div>

    <div class="risco-corpo">
      <p class="risco-resumo">{{ nivel.resumo }}</p>

      <div class="risco-medidor print-hidden">
        <MedidorArco
          :fatias="NIVEIS_INJECAO"
          :indice-atual="analise.indice"
          nota-atual="nível deste documento"
        />
      </div>
    </div>

    <h3 class="risco-camadas-titulo">Camadas de detecção</h3>
    <ul class="risco-camadas">
      <li v-for="linha in linhas" :key="linha.camada.id" class="risco-camada">
        <span class="ld-selo risco-camada-selo" :class="linha.estado.classe">
          {{ linha.estado.texto }}
        </span>
        <span class="risco-camada-nome">{{ linha.camada.rotulo }}</span>
        <span class="risco-camada-nota">{{ linha.estado.nota }}</span>
      </li>
    </ul>

    <p class="risco-saiba-mais print-hidden">
      <a :href="DOC_DETECTOR_URL" target="_blank" rel="noopener noreferrer">
        Como classificamos o risco ↗
      </a>
    </p>
  </section>
</template>

<style scoped>
/* O medidor é desenhado sobre a folha do laudo, que aqui é o azul anil da
   certidão — não o papel padrão da interface. */
.secao-risco {
  --medidor-fundo: var(--ld-certidao-conteudo);
}
/* O h2 precisa da regra aqui: `.secao h2` do laudo é estilo com escopo da
   página e não alcança o interior de um componente — só a raiz dele. */
.secao-cabecalho {
  display: flex;
  align-items: baseline;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  margin-bottom: var(--ld-space-md);
}
.secao-cabecalho h2 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}

.risco-corpo {
  display: grid;
  grid-template-columns: 1fr minmax(260px, 320px);
  gap: var(--ld-space-xl);
  align-items: start;
}
@media (max-width: 720px) {
  .risco-corpo {
    grid-template-columns: 1fr;
  }
}

.risco-resumo {
  margin: 0;
  max-width: 72ch;
  font-size: 0.9375rem;
  line-height: 1.6;
  text-wrap: pretty;
}

.risco-camadas-titulo {
  margin: var(--ld-space-lg) 0 var(--ld-space-sm);
  font-family: var(--ld-font-sans);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ld-tinta-suave);
}
.risco-camadas {
  list-style: none;
  margin: 0;
  padding: 0;
  max-width: 88ch;
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-xs);
}
/* Duas linhas por camada em qualquer largura: o selo e o nome em cima, a nota
   embaixo. Em três colunas a nota vira uma fita de uma palavra por linha assim
   que o medidor come a largura da coluna de texto (por volta de 900px). */
.risco-camada {
  display: grid;
  grid-template-columns: 9.5rem 1fr;
  align-items: baseline;
  gap: 2px var(--ld-space-sm);
  padding: 6px 0;
  border-top: 1px solid var(--ld-filete);
  font-size: 0.875rem;
  line-height: 1.45;
}
.risco-camada:first-child {
  border-top: none;
}
.risco-camada-selo {
  grid-row: 1 / span 2;
  justify-self: start;
}
.risco-camada-nome {
  grid-column: 2;
  font-weight: 600;
}
.risco-camada-nota {
  grid-column: 2;
  color: var(--ld-tinta-suave);
  text-wrap: pretty;
}

.risco-saiba-mais {
  margin: var(--ld-space-md) 0 0;
  font-size: 0.875rem;
}
.risco-saiba-mais a {
  color: var(--ld-tinta-suave);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.risco-medidor {
  display: flex;
  justify-content: center;
  padding-top: var(--ld-space-sm);
}
</style>
