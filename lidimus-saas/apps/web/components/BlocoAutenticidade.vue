<script setup lang="ts">
// Seção do relatório para o verificador de autenticidade de documento
// (@lidimus/autenticidade). Puramente informativa: não existe estado de erro
// nem de bloqueio aqui — o componente só aparece quando há o que mostrar
// (`v-if="autenticidade"` em quem o usa) e nunca impede a leitura do resto do
// relatório, porque o verificador em si nunca impediu a análise.
//
// Duas colunas: a leitura (resumo + indícios + links) à esquerda, o medidor
// à direita — o medidor é o resumo visual do que o texto já diz por extenso.
import type { Autenticidade, Classificacao, Indicio } from '@lidimus/autenticidade'

const props = defineProps<{ autenticidade: Autenticidade }>()

type Apresentacao = { titulo: string; selo: string; resumo: string }

// Título e resumo de cada classificação, para o carimbo do cabeçalho e o
// parágrafo de abertura — versão longa. A versão curta do medidor (rótulo de
// uma palavra + carimbo de mouseover) vive em LEGENDA, abaixo.
const APRESENTACAO: Record<Classificacao, Apresentacao> = {
  original_assinado: {
    titulo: 'Assinatura íntegra',
    selo: 'ld-selo--verde',
    resumo:
      'O arquivo enviado ainda carrega a assinatura eletrônica original, íntegra, sem sinal de ter sido reimpresso ou editado depois de assinado.',
  },
  copia_verificavel: {
    titulo: 'Cópia confirmada',
    selo: 'ld-selo--verde',
    resumo:
      'O arquivo em mãos não é o PDF assinado original, mas encontramos um código oficial — selo, CNM ou o registro da assinatura na ONR — que confirma a procedência do documento por uma fonte independente do próprio arquivo.',
  },
  reimpresso: {
    titulo: 'Reimpressão sem alarme',
    selo: 'ld-selo--ocre',
    resumo:
      'O arquivo foi reimpresso, digitalizado ou achatado — o que já era esperado, e por si só não é problema — mas não trouxe nenhum código que permita confirmar a procedência por fora. Também não encontramos sinal de que o conteúdo tenha sido alterado.',
  },
  copia_sem_ancora: {
    titulo: 'Sem código para conferir',
    selo: 'ld-selo--ocre',
    resumo:
      'É uma digitalização comum, sem selo, CNM ou link de assinatura legível. Isso não indica problema — só que não há, neste arquivo, um código independente para confirmar a procedência por fora.',
  },
  editado: {
    titulo: 'Indício de edição',
    selo: 'ld-selo--carimbo',
    resumo:
      'O arquivo mostra sinais de ter passado por um editor de PDF, ou de ter sido remontado depois de pronto (páginas reprocessadas em momentos diferentes, por exemplo). Vale conferir contra o original antes de usar o documento para qualquer finalidade.',
  },
  indicios_de_adulteracao: {
    titulo: 'Indícios de adulteração',
    selo: 'ld-selo--critico',
    resumo:
      'Encontramos inconsistências que um documento genuíno normalmente não tem — datas que não fecham, um código de verificação que não confere, ou informações que divergem entre o cabeçalho e a fonte oficial. Recomendamos fortemente confirmar a autenticidade direto no cartório antes de usar este documento.',
  },
  arquivo_danificado: {
    titulo: 'Arquivo danificado',
    selo: 'ld-selo--carimbo',
    resumo:
      'O arquivo enviado está incompleto ou corrompido — falta a estrutura que todo PDF válido tem no fim do arquivo. Não foi possível conferir a procedência; peça o documento novamente na fonte original.',
  },
}

// As sete classificações possíveis, na mesma ordem do medidor — da mais
// confiável (verde, esquerda) à mais grave (vermelho, direita):
//   • cor          — a cor da fatia no medidor (gradiente contínuo verde→
//                     vermelho; os tokens ld-selo só têm três tons, poucos
//                     para sete posições lerem-se com precisão);
//   • rotuloCurto   — a palavra que aparece junto do medidor;
//   • tituloCarimbo / textoCarimbo — o mesmo par título+texto da seção
//     "No seu relatório" da documentação (verificacao-autenticidade.html),
//     mostrado na caixa de ajuda ao passar o mouse ou focar o rótulo.
type ItemMedidor = {
  classificacao: Classificacao
  cor: string
  rotuloCurto: string
  tituloCarimbo: string
  textoCarimbo: string
}
const LEGENDA: ItemMedidor[] = [
  {
    classificacao: 'original_assinado',
    cor: '#2f7d4f',
    rotuloCurto: 'Íntegro',
    tituloCarimbo: 'assinatura íntegra',
    textoCarimbo: 'O arquivo ainda carrega a assinatura eletrônica original, sem sinal de ter sido mexido depois.',
  },
  {
    classificacao: 'copia_verificavel',
    cor: '#6fae6b',
    rotuloCurto: 'Cópia',
    tituloCarimbo: 'cópia confirmada',
    textoCarimbo: 'Não é o arquivo assinado original, mas um código oficial confirma que corresponde a um documento genuíno.',
  },
  {
    classificacao: 'reimpresso',
    cor: '#b9c94f',
    rotuloCurto: 'Reimpresso',
    tituloCarimbo: 'reimpressão sem alarme',
    textoCarimbo: 'O arquivo foi reimpresso ou digitalizado de novo — comum e esperado — sem nenhum sinal de alteração de conteúdo.',
  },
  {
    classificacao: 'copia_sem_ancora',
    cor: '#e8c34a',
    rotuloCurto: 'Sem código',
    tituloCarimbo: 'sem código para conferir',
    textoCarimbo: 'É uma digitalização comum, sem nenhum dos códigos que permitiriam checar a procedência por fora.',
  },
  {
    classificacao: 'editado',
    cor: '#e2954a',
    rotuloCurto: 'Editado',
    tituloCarimbo: 'indício de edição',
    textoCarimbo: 'O arquivo mostra sinais de ter passado por um editor de PDF depois de pronto.',
  },
  {
    classificacao: 'indicios_de_adulteracao',
    cor: '#d16a4a',
    rotuloCurto: 'Adulterado',
    tituloCarimbo: 'indício de adulteração',
    textoCarimbo: 'Encontramos inconsistências que um documento genuíno normalmente não tem.',
  },
  {
    classificacao: 'arquivo_danificado',
    cor: '#a51e24',
    rotuloCurto: 'Danificado',
    tituloCarimbo: 'arquivo danificado',
    textoCarimbo: 'O arquivo chegou incompleto ou corrompido — não foi possível conferir a procedência.',
  },
]

const DOC_AUTENTICIDADE_URL = '/verificacao-autenticidade.html'

const indiceAtual = computed(() => LEGENDA.findIndex((i) => i.classificacao === props.autenticidade.classificacao))

// Ângulo da fatia i, em graus a partir da vertical (0° = para cima, negativo
// = para a esquerda, positivo = para a direita) — usado tanto pelo ponteiro
// (fatia atual) quanto pela posição de cada rótulo (todas as fatias), por
// isso é uma função só, não duas contas repetidas.
function anguloDaFatia(i: number): number {
  const passo = 180 / LEGENDA.length
  return (i + 0.5) * passo - 90
}

const anguloAgulha = computed(() => anguloDaFatia(indiceAtual.value))

// Medidor em semicírculo, sete fatias iguais. `conic-gradient(from 270deg…)`
// começa a contagem apontando para a esquerda (9h) e soma no sentido horário
// — exatamente o percurso esquerda → topo → direita que o medidor precisa; a
// metade de baixo (180°–360°) fica transparente porque o palco só mostra a
// metade de cima (ver .medidor-arco no <style>).
const gradienteGauge = computed(() => {
  const passo = 180 / LEGENDA.length
  const paradas = LEGENDA.map((item, i) => `${item.cor} ${(i * passo).toFixed(2)}deg ${((i + 1) * passo).toFixed(2)}deg`)
  return `conic-gradient(from 270deg, ${paradas.join(', ')}, transparent 180deg 360deg)`
})

// Centro do palco (300×150) e raio onde os rótulos ficam — um pouco além do
// anel (raio externo 150px), para não sobrepor as cores. Calculado uma vez só
// — não depende do resultado do documento, só da geometria fixa do medidor.
const CENTRO = 150
const RAIO_ROTULO = 172
const POSICOES_ROTULOS = LEGENDA.map((_, i) => {
  const rad = (anguloDaFatia(i) * Math.PI) / 180
  return {
    left: `${(CENTRO + RAIO_ROTULO * Math.sin(rad)).toFixed(1)}px`,
    top: `${(CENTRO - RAIO_ROTULO * Math.cos(rad)).toFixed(1)}px`,
  }
})

// De que lado a caixa de ajuda abre. Uma caixa sempre centralizada no rótulo
// da ponta direita ("Danificado") estoura a borda da página — por isso os
// rótulos da metade esquerda abrem a caixa para a direita, os da metade
// direita abrem para a esquerda, e só o do meio fica centralizado.
function ladoTooltip(i: number): 'esquerda' | 'centro' | 'direita' {
  const meio = (LEGENDA.length - 1) / 2
  if (i < meio) return 'esquerda'
  if (i > meio) return 'direita'
  return 'centro'
}

const PESO_SELO: Record<Indicio['peso'], string> = {
  alto: 'ld-selo--carimbo',
  medio: 'ld-selo--ocre',
  informativo: 'ld-selo--neutro',
}

const PESO_LABEL: Record<Indicio['peso'], string> = {
  alto: 'Relevante',
  medio: 'Atenção',
  informativo: 'Informativo',
}

const info = computed(() => APRESENTACAO[props.autenticidade.classificacao])

// Indícios de maior peso primeiro — o que mais importa fica no topo da lista.
const ORDEM_PESO: Record<Indicio['peso'], number> = { alto: 0, medio: 1, informativo: 2 }
const indiciosOrdenados = computed(() =>
  [...props.autenticidade.indicios].sort((a, b) => ORDEM_PESO[a.peso] - ORDEM_PESO[b.peso]),
)
</script>

<template>
  <section class="secao secao-autenticidade" aria-labelledby="sec-autenticidade">
    <div class="secao-cabecalho">
      <h2 id="sec-autenticidade">Autenticidade do documento</h2>
      <span class="ld-selo" :class="info.selo">{{ info.titulo }}</span>
    </div>

    <div class="autenticidade-corpo">
      <div class="autenticidade-coluna-texto">
        <p class="autenticidade-resumo">{{ info.resumo }}</p>

        <ul v-if="indiciosOrdenados.length" class="autenticidade-indicios">
          <li v-for="(indicio, i) in indiciosOrdenados" :key="i" class="autenticidade-indicio">
            <span class="ld-selo autenticidade-indicio-selo" :class="PESO_SELO[indicio.peso]">
              {{ PESO_LABEL[indicio.peso] }}
            </span>
            <span class="autenticidade-indicio-texto">{{ indicio.evidencia }}</span>
          </li>
        </ul>

        <ul v-if="autenticidade.linksDeConferencia.length" class="autenticidade-links">
          <li v-for="link in autenticidade.linksDeConferencia" :key="link.url">
            <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.rotulo }} ↗</a>
          </li>
        </ul>

        <p class="autenticidade-saiba-mais print-hidden">
          <a :href="DOC_AUTENTICIDADE_URL" target="_blank" rel="noopener noreferrer">
            Como chegamos a esse resultado ↗
          </a>
        </p>
      </div>

      <div class="autenticidade-medidor print-hidden">
        <div class="medidor-palco">
          <div class="medidor-arco">
            <div class="medidor-anel" :style="{ background: gradienteGauge }"></div>
            <div class="medidor-furo"></div>
            <div class="medidor-agulha" :style="{ transform: `rotate(${anguloAgulha}deg)` }"></div>
          </div>
          <div class="medidor-rotulos">
            <button
              v-for="(item, i) in LEGENDA"
              :key="item.classificacao"
              type="button"
              class="medidor-rotulo"
              :class="{ 'medidor-rotulo--atual': i === indiceAtual }"
              :style="POSICOES_ROTULOS[i]"
            >
              <span class="medidor-rotulo-ponto" :style="{ background: item.cor }" aria-hidden="true"></span>
              {{ item.rotuloCurto }}
              <span v-if="i === indiceAtual" class="sr-only"> — resultado deste documento</span>
              <span class="medidor-tooltip" :class="`medidor-tooltip--${ladoTooltip(i)}`" role="tooltip">
                <strong>{{ item.tituloCarimbo }}</strong>
                {{ item.textoCarimbo }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.secao-autenticidade {
  background: var(--ld-papel);
}

.autenticidade-corpo {
  display: grid;
  grid-template-columns: 1fr minmax(260px, 320px);
  gap: var(--ld-space-xl);
  align-items: start;
}
@media (max-width: 720px) {
  .autenticidade-corpo {
    grid-template-columns: 1fr;
  }
}

.autenticidade-resumo {
  max-width: 72ch;
  line-height: 1.6;
  text-wrap: pretty;
  margin: 0 0 var(--ld-space-md);
}
.autenticidade-indicios {
  list-style: none;
  margin: 0 0 var(--ld-space-md);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-sm);
}
.autenticidade-indicio {
  display: flex;
  align-items: baseline;
  gap: var(--ld-space-sm);
}
.autenticidade-indicio-selo {
  flex: none;
}
.autenticidade-indicio-texto {
  max-width: 68ch;
  line-height: 1.55;
  font-size: 0.9375rem;
}
.autenticidade-links {
  list-style: none;
  margin: 0 0 var(--ld-space-md);
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ld-space-md);
  font-size: 0.875rem;
}
.autenticidade-links a {
  color: var(--ld-tinta);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.autenticidade-saiba-mais {
  margin: var(--ld-space-md) 0 0;
  font-size: 0.875rem;
}
.autenticidade-saiba-mais a {
  color: var(--ld-tinta-suave);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ── Medidor ──────────────────────────────────────────────────────────────
   Semicírculo em conic-gradient (cor), uma agulha (transform: rotate) e sete
   rótulos de uma palavra posicionados por trigonometria simples ao redor do
   arco. Nada de números — a posição da agulha e a palavra já dizem tudo, e
   quem quiser a frase completa passa o mouse ou usa Tab + Enter no rótulo. */
.autenticidade-medidor {
  display: flex;
  justify-content: center;
  padding-top: var(--ld-space-sm);
}
.medidor-palco {
  position: relative;
  width: 300px;
  height: 150px;
  margin: 0 auto;
}
.medidor-arco {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.medidor-anel {
  position: absolute;
  top: 0;
  left: 0;
  width: 300px;
  height: 300px;
  border-radius: 50%;
}
.medidor-furo {
  position: absolute;
  left: 50%;
  top: 40px;
  width: 195px;
  height: 195px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: var(--ld-papel);
}
.medidor-agulha {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 4px;
  height: 108px;
  margin-left: -2px;
  background: var(--ld-tinta);
  transform-origin: bottom center;
  border-radius: 3px 3px 0 0;
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.medidor-agulha::after {
  content: "";
  position: absolute;
  bottom: -8px;
  left: 50%;
  width: 18px;
  height: 18px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: var(--ld-tinta);
}
@media (prefers-reduced-motion: reduce) {
  .medidor-agulha {
    transition: none;
  }
}

.medidor-rotulos {
  position: absolute;
  inset: 0;
}
.medidor-rotulo {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 62px;
  background: none;
  border: none;
  padding: 3px 2px;
  border-radius: 4px;
  font-family: var(--ld-font-sans);
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.15;
  color: var(--ld-tinta-suave);
  text-align: center;
  cursor: help;
}
.medidor-rotulo-ponto {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.medidor-rotulo:hover,
.medidor-rotulo:focus-visible {
  color: var(--ld-tinta);
  background: var(--ld-bancada);
}
.medidor-rotulo--atual {
  color: var(--ld-tinta);
  font-weight: 700;
}

.medidor-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  width: 208px;
  padding: 10px 12px;
  border-radius: var(--ld-r-xs);
  background: var(--ld-tinta);
  color: var(--ld-papel);
  font-family: var(--ld-font-sans);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.5;
  text-align: left;
  white-space: normal;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
  z-index: 5;
}
.medidor-tooltip strong {
  display: block;
  margin-bottom: 3px;
  font-weight: 700;
}
/* Três ancoragens — ver ladoTooltip() no script: centralizada só faz sentido
   para o rótulo do meio, senão a caixa estoura a borda da página nas pontas. */
.medidor-tooltip--centro {
  left: 50%;
  transform: translate(-50%, 4px);
}
.medidor-tooltip--esquerda {
  left: -10px;
  transform: translate(0, 4px);
}
.medidor-tooltip--direita {
  right: -10px;
  transform: translate(0, 4px);
}
.medidor-rotulo:hover .medidor-tooltip--centro,
.medidor-rotulo:focus-visible .medidor-tooltip--centro {
  opacity: 1;
  transform: translate(-50%, 0);
}
.medidor-rotulo:hover .medidor-tooltip--esquerda,
.medidor-rotulo:focus-visible .medidor-tooltip--esquerda,
.medidor-rotulo:hover .medidor-tooltip--direita,
.medidor-rotulo:focus-visible .medidor-tooltip--direita {
  opacity: 1;
  transform: translate(0, 0);
}
@media (prefers-reduced-motion: reduce) {
  .medidor-tooltip {
    transition: none;
  }
}

@media (max-width: 400px) {
  .medidor-palco {
    transform: scale(0.82);
    transform-origin: top center;
  }
}
</style>
