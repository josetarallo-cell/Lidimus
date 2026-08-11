<script setup lang="ts">
// Casca das páginas de /docs: cabeçalho, navegação entre ferramentas, sumário e
// rodapé. As páginas entram pelo slot e só escrevem conteúdo.
//
// Público por definição — quem faz a integração ou avalia a ferramenta costuma
// não ter conta. Por isso layout: false nas páginas e /docs/ liberado em
// middleware/auth.global.ts.
//
// Serve também às páginas legais (/privacidade e /termos), que são longform
// público com sumário — a mesma forma. Elas trocam a navegação lateral por
// `irmas`/`tituloNav` e o encerramento pelo slot `rodape`, porque mandar quem
// procura a política de privacidade para o índice das ferramentas não ajudaria
// ninguém.

const props = defineProps<{
  titulo: string
  selo?: string
  secoes: { id: string; rotulo: string }[]
  irmas?: { to: string; rotulo: string }[]
  tituloNav?: string
}>()

const FERRAMENTAS = [
  { to: '/docs', rotulo: 'Visão geral' },
  { to: '/docs/matriculas', rotulo: 'Matrículas' },
  { to: '/docs/croqui', rotulo: 'Croqui' },
  { to: '/docs/memorial', rotulo: 'Memorial' },
  { to: '/docs/detector', rotulo: 'Detector' },
  { to: '/docs/api', rotulo: 'API' },
]

const navegacao = computed(() => props.irmas ?? FERRAMENTAS)

const rota = useRoute()
</script>

<template>
  <div class="doc">
    <header class="doc-topo">
      <div class="doc-topo-inner">
        <a href="/" class="doc-marca">
          <img src="/logo.svg" alt="Lidimus" class="doc-logo" />
        </a>
        <div class="doc-topo-dir">
          <span v-if="selo" class="doc-selo">{{ selo }}</span>
          <a href="/dashboard" class="doc-topo-link">Entrar</a>
        </div>
      </div>
    </header>

    <div class="doc-corpo">
      <div>
        <nav class="doc-irmas" :aria-label="tituloNav ?? 'Documentação'">
          <p class="doc-indice-titulo">{{ tituloNav ?? 'Documentação' }}</p>
          <ul>
            <li v-for="f in navegacao" :key="f.to">
              <NuxtLink :to="f.to" :class="{ 'doc-irma--ativa': rota.path === f.to }">
                {{ f.rotulo }}
              </NuxtLink>
            </li>
          </ul>
        </nav>

        <nav v-if="secoes.length" class="doc-indice" aria-label="Sumário">
          <p class="doc-indice-titulo">Nesta página</p>
          <ul>
            <li v-for="s in secoes" :key="s.id">
              <a :href="`#${s.id}`">{{ s.rotulo }}</a>
            </li>
          </ul>
        </nav>
      </div>

      <main class="doc-conteudo">
        <h1>{{ titulo }}</h1>
        <slot />

        <slot name="rodape">
          <section class="doc-fim">
            <h2>Ficou alguma dúvida?</h2>
            <p>
              Escreva para
              <a href="mailto:jose.tarallo@gmail.com?subject=Lidimus%20%E2%80%94%20d%C3%BAvida">
                o suporte
              </a>. Se a dúvida for sobre uma análise específica, mande o identificador dela — com
              ele conseguimos ver exatamente o que aconteceu.
            </p>
          </section>
        </slot>
      </main>
    </div>
  </div>
</template>

<style>
/* Sem `scoped` de propósito: estilo scoped não alcança o conteúdo do slot, que é
   como as páginas montam tudo aqui. O arquivo inteiro está sob `.doc`, então não
   vaza para o app nem para a landing. */
@import '~/assets/css/docs.css';
</style>
