<script setup lang="ts">
// Selo "Versão BETA" ao lado da marca, na landing e no painel.
//
// É um botão, não um enfeite: quem vê "BETA" num produto que analisa documento
// jurídico precisa saber o que isso significa antes de confiar no resultado.
// O modal responde as três perguntas que o selo levanta — o que pode dar
// errado, o que fazer quando der, e com quem falar.
//
// Em telas estreitas sobra só "BETA". O rótulo longo compete com a marca e com
// a navegação justamente onde há menos espaço, e "BETA" sozinho já carrega o
// aviso; o modal continua a um toque de distância nos dois tamanhos.
//
// Sistema Modernista (tokens --color-*), como manda a nota normativa em
// assets/css/lidimus.css: espaçamento e z-index seguem os tokens estruturais,
// que ainda não têm equivalente no sistema novo.

const CONTATO = 'jose.tarallo@gmail.com'

const dialogo = ref<HTMLDialogElement | null>(null)

function abrir() {
  dialogo.value?.showModal()
}

function fechar() {
  dialogo.value?.close()
}
</script>

<template>
  <button type="button" class="cond sb-selo" aria-haspopup="dialog" @click="abrir">
    <!-- O rótulo curto e o longo convivem no DOM e alternam por CSS. Trocar o
         texto por JS exigiria observar a largura da janela e ainda pisaria na
         hidratação do SSR, que não sabe o tamanho da tela. -->
    <span class="sb-selo-curto" aria-hidden="true">BETA</span>
    <span class="sb-selo-longo">Versão BETA</span>
  </button>

  <dialog ref="dialogo" class="sb" aria-labelledby="sb-titulo">
    <div class="sb-folha">
      <header class="sb-topo">
        <div>
          <p class="cond sb-marca">Lidimus</p>
          <h2 id="sb-titulo" class="sb-titulo">Versão BETA</h2>
        </div>
        <button type="button" class="sb-fechar" aria-label="Fechar aviso" @click="fechar">
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

      <div class="sb-corpo">
        <p>
          O Lidimus está em <strong>fase de testes</strong>. A plataforma já é usada em
          trabalho real, mas ainda está sendo ajustada: pode haver
          <strong>inconsistências nos resultados</strong> e
          <strong>interrupções momentâneas de funcionamento</strong>.
        </p>
        <p>
          Trate cada análise como apoio ao seu trabalho, não como palavra final — confira
          o resultado contra o documento original antes de usá-lo em decisão.
        </p>
        <p>
          Encontrou um problema, um resultado estranho ou algo fora do ar? Escreva para
          <a :href="`mailto:${CONTATO}?subject=Lidimus%20BETA%20%E2%80%94%20problema`" class="sb-email">{{ CONTATO }}</a>.
          Relato de erro é o que faz a versão seguinte ser melhor.
        </p>
      </div>

      <footer class="sb-rodape">
        <button type="button" class="sb-cta" autofocus @click="fechar">Entendi</button>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
/* ── Selo ───────────────────────────────────────────────── */
.sb-selo {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 3px 8px;
  border: 1px solid var(--color-accent);
  border-radius: 0;
  background: transparent;
  color: var(--color-accent);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  line-height: 1;
  cursor: pointer;
  transition:
    background var(--ld-dur-estado) var(--ld-ease),
    color var(--ld-dur-estado) var(--ld-ease);
}
.sb-selo:hover {
  background: var(--color-accent);
  color: #fff;
}

/* Só um dos dois rótulos ocupa espaço; o curto some acima do breakpoint. */
.sb-selo-curto {
  display: none;
}
@media (max-width: 640px) {
  .sb-selo-curto {
    display: inline;
  }
  /* Fora do fluxo e do alcance do leitor de tela: o rótulo curto já está
     visível e anunciá-lo duas vezes seria ruído. */
  .sb-selo-longo {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

/* ── Modal ──────────────────────────────────────────────── */
.sb {
  /* dialog nativo sobe para a top layer; o z-index só ordena contra camadas
     próprias, mas manter a escala evita número mágico. */
  z-index: var(--ld-z-modal);
  width: min(34rem, calc(100vw - 2 * var(--ld-space-md)));
  max-height: calc(100dvh - 2 * var(--ld-space-lg));
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-body);
  overflow: visible;
}
.sb::backdrop {
  background: color-mix(in srgb, var(--color-text) 62%, transparent);
}
/* O anel de foco global é verde (identidade antiga) e destoaria da folha. */
.sb :focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.sb-folha {
  background: #fff;
  border-top: 2px solid var(--color-accent);
  max-height: inherit;
  display: flex;
  flex-direction: column;
}

.sb-topo {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ld-space-md);
  padding: var(--ld-space-lg) var(--ld-space-lg) var(--ld-space-sm);
}
.sb-marca {
  margin: 0 0 var(--ld-space-xs);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-text) 66%, transparent);
}
.sb-titulo {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: clamp(1.25rem, 3.2vw, 1.625rem);
  line-height: 1.08;
  letter-spacing: -0.015em;
  text-transform: uppercase;
}
.sb-fechar {
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
.sb-fechar:hover {
  background: var(--color-surface);
  border-color: var(--color-text);
}

.sb-corpo {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 var(--ld-space-lg) var(--ld-space-md);
}
.sb-corpo p {
  margin: 0 0 var(--ld-space-sm);
  font-size: 0.9375rem;
  line-height: 1.55;
  text-wrap: pretty;
}
.sb-corpo p:last-child {
  margin-bottom: 0;
}
.sb-email {
  color: var(--color-accent);
  font-weight: 600;
  word-break: break-word;
}

.sb-rodape {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-top: 1px solid var(--color-divider);
  background: #fff;
}
.sb-cta {
  border: none;
  border-radius: 0;
  background: var(--color-accent);
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
.sb-cta:hover {
  background: var(--color-accent-600);
}

@keyframes sb-sobe {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes sb-vela {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.sb[open] .sb-folha {
  animation: sb-sobe var(--ld-dur-superficie) var(--ld-ease) both;
}
.sb[open]::backdrop {
  animation: sb-vela var(--ld-dur-superficie) var(--ld-ease) both;
}
@media (prefers-reduced-motion: reduce) {
  .sb[open] .sb-folha {
    animation: sb-vela 1ms linear both;
  }
}
</style>
