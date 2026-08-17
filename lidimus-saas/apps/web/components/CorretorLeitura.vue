<script setup lang="ts">
// O corretor de leitura: a única tela do produto em que o sistema admite dúvida
// e pede ajuda.
//
// A forma vem do WhatTheFont — mostrar o recorte da imagem e pedir o texto certo
// — porque ela resolve o problema real: pedir "confira a leitura do documento"
// obriga a pessoa a procurar a agulha; mostrar o pedaço da página com a dúvida
// dentro transforma a conferência em cinco segundos de olho.
//
// Duas decisões de desenho que sustentam isso:
//
//   • Lista, não assistente. São no máximo oito trechos. Numa lista a pessoa vê
//     de quanto trabalho se trata antes de começar, e envia uma vez só; num
//     passo-a-passo ela nunca sabe quantos faltam e desiste no terceiro.
//
//   • Campo já preenchido com o que foi lido. O trabalho vira conferir e emendar
//     um caractere, não redigitar. Campo vazio faria a pessoa transcrever de
//     novo o que o sistema já acertou em 90% dos casos.
import type { Candidato } from '@lidimus/revisao'

const props = defineProps<{
  candidatos: Candidato[]
  enviando?: boolean
  erro?: string | null
  /** Minutos até a análise seguir sozinha; 0 esconde a linha */
  prazoMinutos?: number
}>()

const emit = defineEmits<{
  enviar: [correcoes: { id: string; texto: string }[]]
  pular: []
}>()

// Preenchido com o que foi lido: conferir e emendar, não redigitar.
const valores = reactive<Record<string, string>>(
  Object.fromEntries(props.candidatos.map((c) => [c.id, c.textoLido])),
)

const alterados = computed(
  () => props.candidatos.filter((c) => valores[c.id]?.trim() !== c.textoLido).length,
)

function enviar() {
  emit(
    'enviar',
    props.candidatos.map((c) => ({ id: c.id, texto: valores[c.id] ?? '' })),
  )
}

function restaurar(c: Candidato) {
  valores[c.id] = c.textoLido
}
</script>

<template>
  <section class="corretor" aria-labelledby="corretor-titulo">
    <header class="corretor-topo">
      <p class="corretor-kicker cond">Conferência da leitura</p>
      <h2 id="corretor-titulo" class="corretor-titulo">
        {{
          candidatos.length === 1
            ? 'Um trecho precisa da sua conferência'
            : `${candidatos.length} trechos precisam da sua conferência`
        }}
      </h2>
      <p class="corretor-explica">
        O sistema não conseguiu ler estes pontos com segurança. Compare cada imagem com o campo ao
        lado e corrija o que estiver diferente — a análise usa o texto corrigido.
      </p>
    </header>

    <ol class="corretor-lista">
      <li v-for="(c, i) in candidatos" :key="c.id" class="item">
        <div class="item-cabecalho">
          <span class="item-ordem cond" aria-hidden="true">{{ i + 1 }}</span>
          <div class="item-rotulos">
            <p class="item-motivo">{{ c.rotulo }}</p>
            <p class="item-onde cond">
              Página {{ c.pagina }}
              <template v-if="c.repeticoes?.length">
                · aparece mais {{ c.repeticoes.length }}
                {{ c.repeticoes.length === 1 ? 'vez' : 'vezes' }} no documento
              </template>
            </p>
          </div>
        </div>

        <figure v-if="c.recorte" class="item-recorte">
          <img :src="c.recorte" :alt="`Trecho da página ${c.pagina} do documento enviado`" />
        </figure>

        <div class="item-campo">
          <label class="ld-campo" :for="`corretor-${c.id}`">O que está escrito</label>
          <div class="item-entrada">
            <input
              :id="`corretor-${c.id}`"
              v-model="valores[c.id]"
              class="ld-input mono"
              type="text"
              maxlength="120"
              autocomplete="off"
              spellcheck="false"
              :disabled="enviando"
            />
            <button
              v-if="valores[c.id] !== c.textoLido"
              type="button"
              class="ld-btn ld-btn--ghost ld-btn--sm"
              :disabled="enviando"
              @click="restaurar(c)"
            >
              Desfazer
            </button>
          </div>
        </div>
      </li>
    </ol>

    <p v-if="erro" class="ld-erro" role="alert">{{ erro }}</p>

    <footer class="corretor-acoes">
      <button
        type="button"
        class="ld-btn ld-btn--primary"
        :disabled="enviando"
        @click="enviar"
      >
        <span v-if="enviando" class="ld-spinner" aria-hidden="true" />
        {{
          enviando
            ? 'Enviando…'
            : alterados === 0
              ? 'Está tudo certo, continuar'
              : `Corrigir ${alterados} e continuar`
        }}
      </button>
      <button
        type="button"
        class="ld-btn ld-btn--ghost"
        :disabled="enviando"
        @click="emit('pular')"
      >
        Analisar sem conferir
      </button>
    </footer>

    <p v-if="prazoMinutos" class="corretor-prazo">
      Se você não responder, a análise segue sozinha em até {{ prazoMinutos }} minutos com a leitura
      atual. Nada se perde.
    </p>
  </section>
</template>

<style scoped>
/* A folha do corretor repousa sobre o ground como o painel da espera: mesma
   régua de 2px, mesma sombra sólida. É o mesmo momento do fluxo, não uma tela
   nova — quem estava esperando continua esperando, só que agora com trabalho. */
.corretor {
  width: min(44rem, 100%);
  margin: 0 auto;
  padding: var(--space-lg);
  background: var(--color-folha);
  border: var(--rule) solid var(--color-text);
  box-shadow: var(--shadow-cartaz-curto);
  font-family: var(--font-body);
}

.corretor-kicker {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent-600);
}

.corretor-titulo {
  margin: var(--space-xs) 0 var(--space-sm);
  font-family: var(--font-heading);
  font-size: 1.375rem;
  line-height: 1.15;
}

.corretor-explica {
  margin: 0;
  max-width: 52ch;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--color-text-muted, inherit);
}

.corretor-lista {
  margin: var(--space-lg) 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: var(--space-md);
}

.item {
  padding: var(--space-md);
  border: var(--rule-fina) solid var(--color-text);
}

.item-cabecalho {
  display: flex;
  gap: var(--space-sm);
  align-items: baseline;
}

/* O número é o índice do trabalho: quantos foram, quantos faltam. */
.item-ordem {
  flex: none;
  min-width: 1.5rem;
  font-size: 1.125rem;
  font-weight: 700;
}

.item-rotulos {
  min-width: 0;
}

.item-motivo {
  margin: 0;
  font-weight: 600;
  font-size: 0.9375rem;
}

.item-onde {
  margin: 2px 0 0;
  font-size: 0.8125rem;
  opacity: 0.7;
}

/* O recorte é a prova: fundo neutro e régua ao redor para separá-lo da folha,
   e altura livre para não deformar o que veio da página. */
.item-recorte {
  margin: var(--space-sm) 0 0;
  padding: var(--space-sm);
  border: var(--rule-fina) solid var(--color-text);
  background: var(--color-surface);
  overflow-x: auto;
}

.item-recorte img {
  display: block;
  max-width: 100%;
  height: auto;
  image-rendering: crisp-edges;
}

.item-campo {
  margin-top: var(--space-sm);
}

.item-entrada {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.item-entrada .ld-input {
  flex: 1 1 auto;
  min-width: 0;
}

.corretor-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin-top: var(--space-lg);
}

.corretor-prazo {
  margin: var(--space-md) 0 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  opacity: 0.7;
}

@media (max-width: 480px) {
  .corretor {
    padding: var(--space-md);
  }

  .corretor-acoes .ld-btn {
    width: 100%;
  }
}
</style>
