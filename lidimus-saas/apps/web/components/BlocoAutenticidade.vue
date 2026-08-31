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
        <MedidorArco :fatias="LEGENDA" :indice-atual="indiceAtual" />
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

/* O medidor em si vive em MedidorArco.vue — aqui fica só o lugar dele na
   coluna da direita. */
.autenticidade-medidor {
  display: flex;
  justify-content: center;
  padding-top: var(--ld-space-sm);
}
</style>
