<script setup lang="ts">
// Tela de boas-vindas do primeiro acesso. Aparece uma única vez por usuário —
// o "visto" mora no banco (users.welcomed), não no navegador, para não voltar
// quando a pessoa troca de máquina.
//
// Construída no sistema Modernista (tokens --color-*), conforme a nota
// normativa em assets/css/lidimus.css: tela nova não usa mais os --ld-* de cor
// e tipografia. Espaçamento, z-index e curvas seguem os tokens estruturais,
// que ainda não têm equivalente no sistema novo.
const props = defineProps<{ nome?: string | null; pedirEmpresa?: boolean }>()
const emit = defineEmits<{ (e: 'fechar', empresa: string): void }>()

const dialogo = ref<HTMLDialogElement | null>(null)
// Só quem chegou pelo Google (ou de uma conta anterior ao campo) vê esta
// pergunta — no cadastro por e-mail a empresa já veio no formulário.
const empresa = ref('')

// Só o primeiro nome — "Boas-vindas, José Francisco Silveira Tarallo" soa
// protocolar, e é justamente o oposto do que esta tela quer transmitir.
const primeiroNome = computed(() => (props.nome ?? '').trim().split(/\s+/)[0] || '')

const ferramentas = [
  {
    nome: 'Leitor de Matrículas',
    texto:
      'Envie a certidão e receba um parecer estruturado: cadeia dominial, ônus, gravames e alertas de risco — cada apontamento com o registro ou averbação de origem.',
  },
  {
    nome: 'Croqui do terreno',
    texto:
      'Desenha o lote a partir da descrição do perímetro na matrícula, com medidas, confrontantes e área prontos para conferência visual.',
  },
  {
    nome: 'Memorial descritivo',
    texto:
      'Do KML do Google Earth ao memorial técnico-jurídico pronto para o registro de imóveis: vértices, azimutes, distâncias e confrontações.',
  },
  {
    nome: 'Detector de conteúdo oculto',
    texto:
      'Varre qualquer PDF em busca de instruções escondidas — texto invisível, fontes minúsculas, metadados — e sinaliza o nível de risco.',
  },
]

// showModal() dá foco preso, Esc e camada superior de graça — e não existe no
// servidor, por isso só no onMounted.
onMounted(() => dialogo.value?.showModal())

// Qualquer forma de sair (botão, X ou Esc) conta como visto: a tela é um aviso
// de cortesia, não uma etapa obrigatória. A empresa segue junto quando foi
// preenchida — sair sem responder é permitido, e o nome pode ser ajustado
// depois em Conta → Equipe.
function fechar() {
  dialogo.value?.close()
}
</script>

<template>
  <dialog ref="dialogo" class="bv" aria-labelledby="bv-titulo" @close="emit('fechar', empresa.trim())">
    <div class="bv-folha">
      <header class="bv-topo">
        <div class="bv-titulos">
          <p class="cond bv-marca">Lidimus</p>
          <h2 id="bv-titulo" class="bv-titulo">
            Boas-vindas<template v-if="primeiroNome">, {{ primeiroNome }}</template>
          </h2>
        </div>
        <button type="button" class="bv-fechar" aria-label="Fechar boas-vindas" @click="fechar">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="square"
            />
          </svg>
        </button>
      </header>

      <p class="bv-abertura">
        Sua conta está ativa e já tem <strong>150 créditos</strong> para as primeiras análises.
        Cada ferramenta pega um documento bruto e devolve um resultado pronto para uso
        profissional:
      </p>

      <dl class="bv-lista">
        <div v-for="f in ferramentas" :key="f.nome" class="bv-item">
          <dt class="cond bv-item-nome">{{ f.nome }}</dt>
          <dd class="bv-item-texto">{{ f.texto }}</dd>
        </div>
      </dl>

      <section v-if="pedirEmpresa" class="bv-empresa">
        <label class="bv-empresa-campo">
          <span class="cond bv-item-nome">Sua empresa (opcional)</span>
          <input
            v-model="empresa"
            type="text"
            class="bv-empresa-input"
            autocomplete="organization"
            maxlength="120"
            placeholder="Escritório, cartório ou razão social"
          />
        </label>
        <p class="bv-item-texto">
          É o nome que identifica sua conta e aparece para quem você convidar para a equipe.
          Deixe em branco se usa o Lidimus sozinho.
        </p>
      </section>

      <footer class="bv-rodape">
        <p class="bv-nota">
          O custo em créditos aparece antes de cada envio, e o saldo fica sempre à vista no topo
          do painel.
        </p>
        <!-- autofocus para o foco inicial cair na ação construtiva, não no X:
             assim Enter começa, em vez de descartar. -->
        <button type="button" class="bv-cta" autofocus @click="fechar">Começar</button>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.bv {
  /* O dialog nativo sobe para a top layer, então o z-index só ordena contra
     outras camadas próprias — mas manter a escala evita número mágico. */
  z-index: var(--ld-z-modal);
  width: min(46rem, calc(100vw - 2 * var(--ld-space-md)));
  max-height: calc(100dvh - 2 * var(--ld-space-lg));
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-body);
  overflow: visible;
}
.bv::backdrop {
  background: color-mix(in srgb, var(--color-text) 62%, transparent);
}

/* O anel de foco global é verde (identidade antiga). Dentro desta tela, que já
   é Modernista, ele destoaria da folha inteira. */
.bv :focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.bv-folha {
  /* A "folha" branca do documento sobre o ground — ainda sem token próprio
     no sistema Modernista, que só nomeia bg/surface. */
  background: #fff;
  border-top: 2px solid var(--color-text);
  max-height: inherit;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* ── Cabeçalho ──────────────────────────────────────────── */
.bv-topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ld-space-md);
  padding: var(--ld-space-lg) var(--ld-space-lg) var(--ld-space-md);
}
.bv-marca {
  margin: 0 0 var(--ld-space-xs);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-text) 66%, transparent);
}
.bv-titulo {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: clamp(1.5rem, 4vw, 2rem);
  line-height: 1.08;
  letter-spacing: -0.015em;
  text-transform: uppercase;
  text-wrap: balance;
}

.bv-fechar {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--color-divider);
  border-radius: 0;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition:
    background var(--ld-dur-estado) var(--ld-ease),
    border-color var(--ld-dur-estado) var(--ld-ease);
}
.bv-fechar:hover {
  background: var(--color-surface);
  border-color: var(--color-text);
}

/* ── Corpo ──────────────────────────────────────────────── */
.bv-abertura {
  margin: 0;
  padding: 0 var(--ld-space-lg) var(--ld-space-lg);
  font-size: 1rem;
  line-height: 1.55;
  max-width: 62ch;
  text-wrap: pretty;
}
.bv-abertura strong {
  font-weight: 700;
}

.bv-lista {
  margin: 0;
}
.bv-item {
  display: grid;
  gap: 4px var(--ld-space-lg);
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-top: 1px solid var(--color-divider);
}
.bv-item-nome {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.3;
}
.bv-item-texto {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.5;
  /* 78% de ink sobre branco ≈ 9:1 — folga confortável sobre o piso AA */
  color: color-mix(in srgb, var(--color-text) 78%, transparent);
  max-width: 68ch;
  text-wrap: pretty;
}

/* A grade modular só aparece quando há largura para duas colunas — abaixo
   disso o nome empilha sobre a descrição em vez de espremer as duas. */
@media (min-width: 40rem) {
  .bv-item {
    grid-template-columns: 13rem 1fr;
    align-items: baseline;
  }
}

/* ── Empresa ────────────────────────────────────────────── */
.bv-empresa {
  display: grid;
  gap: var(--ld-space-xs);
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-top: 1px solid var(--color-divider);
  background: var(--color-surface);
}
.bv-empresa-campo {
  display: grid;
  gap: 6px;
  max-width: 26rem;
}
.bv-empresa-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--color-divider);
  border-radius: 0;
  background: #fff;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.9375rem;
  line-height: 1.4;
}
.bv-empresa-input:focus {
  border-color: var(--color-text);
}

/* ── Rodapé ─────────────────────────────────────────────── */
.bv-rodape {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  padding: var(--ld-space-md) var(--ld-space-lg) var(--ld-space-lg);
  border-top: 2px solid var(--color-text);
  /* Em telas baixas a lista rola dentro da folha; sem isto o "Começar" fica
     abaixo da dobra e a saída da tela vira uma caça ao botão. */
  position: sticky;
  bottom: 0;
  background: #fff;
}
.bv-nota {
  margin: 0;
  flex: 1 1 22ch;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: color-mix(in srgb, var(--color-text) 74%, transparent);
  max-width: 52ch;
  text-wrap: pretty;
}
.bv-cta {
  flex-shrink: 0;
  border: none;
  border-radius: 0;
  background: var(--color-accent);
  /* 700 em 14px conta como texto grande no AA — o par branco↔acento entrega
     4.2:1, acima do piso de 3:1 dessa faixa. */
  color: #fff;
  font-family: var(--font-cond);
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 11px 28px;
  cursor: pointer;
  transition: background var(--ld-dur-estado) var(--ld-ease);
}
.bv-cta:hover {
  background: var(--color-accent-600);
}

/* ── Entrada ────────────────────────────────────────────── */
@keyframes bv-sobe {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes bv-vela {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.bv[open] .bv-folha {
  animation: bv-sobe var(--ld-dur-superficie) var(--ld-ease) both;
}
.bv[open]::backdrop {
  animation: bv-vela var(--ld-dur-superficie) var(--ld-ease) both;
}

/* O reset global já achata a duração; aqui garantimos que o painel não entre
   deslocado quando a animação é reduzida a zero. */
@media (prefers-reduced-motion: reduce) {
  .bv[open] .bv-folha {
    animation: bv-vela 1ms linear both;
  }
}
</style>
