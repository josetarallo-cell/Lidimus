<script setup lang="ts">
definePageMeta({ layout: false })

useHead({ title: 'Convite — Lidimus' })

const route = useRoute()
const token = String(route.params.token)
const voltarPara = `/convite/${token}`

// O convite é público: quem ainda não tem conta precisa saber para onde está
// sendo chamado antes de decidir se cria uma.
const { data: convite, error: conviteErro } = await useFetch(`/api/invites/${token}`)

// A sessão pode não existir — 401 aqui é resposta esperada, não falha.
const { data: me } = await useFetch('/api/me', { key: `convite-me-${token}` })

const emailDivergente = computed(
  () =>
    !!me.value &&
    !!convite.value &&
    me.value.email.toLowerCase() !== convite.value.email.toLowerCase(),
)

const motivo = computed(() => {
  const e = conviteErro.value as { statusMessage?: string; data?: { message?: string } } | null
  return e?.data?.message ?? e?.statusMessage ?? 'Este convite não é mais válido.'
})

const aceitando = ref(false)
const erro = ref('')

async function aceitar() {
  erro.value = ''
  aceitando.value = true
  try {
    await $fetch(`/api/invites/${token}/accept`, { method: 'POST' })
    await navigateTo('/dashboard')
  } catch (e: unknown) {
    erro.value =
      (e as { data?: { message?: string } })?.data?.message ??
      'Não foi possível aceitar o convite. Tente novamente.'
  } finally {
    aceitando.value = false
  }
}
</script>

<template>
  <div class="auth">
    <main class="auth-caixa">
      <NuxtLink to="/" class="auth-marca">
        <img src="/logo.svg" alt="Lidimus" class="auth-marca-logo" />
      </NuxtLink>

      <section v-if="conviteErro" class="ld-painel auth-painel">
        <h1>Convite indisponível</h1>
        <p class="auth-nota">{{ motivo }}</p>
        <NuxtLink to="/auth/login" class="ld-btn ld-btn--secondary auth-cta">Ir para o login</NuxtLink>
      </section>

      <section v-else class="ld-painel auth-painel">
        <h1>Convite para {{ convite?.orgName }}</h1>
        <p class="auth-nota">
          <strong>{{ convite?.convidadoPor }}</strong> convidou <strong>{{ convite?.email }}</strong>
          para usar o Lidimus junto com a equipe. As análises e os créditos são compartilhados —
          você não precisa assinar nada.
        </p>

        <!-- Sem sessão: cria conta ou entra, e volta para cá -->
        <template v-if="!me">
          <NuxtLink
            :to="{ path: '/auth/register', query: { redirect: voltarPara } }"
            class="ld-btn ld-btn--primary auth-cta"
          >
            Criar conta e entrar na equipe
          </NuxtLink>
          <p class="auth-troca">
            Já tem conta?
            <NuxtLink :to="{ path: '/auth/login', query: { redirect: voltarPara } }">Entrar</NuxtLink>
          </p>
        </template>

        <!-- Logado com outro e-mail: o convite é nominal -->
        <template v-else-if="emailDivergente">
          <p class="ld-erro" role="alert">
            Você está conectado como <strong>{{ me.email }}</strong>, mas este convite é para
            <strong>{{ convite?.email }}</strong>. Saia da conta atual e entre com o e-mail
            convidado para aceitá-lo.
          </p>
          <NuxtLink
            :to="{ path: '/auth/login', query: { redirect: voltarPara } }"
            class="ld-btn ld-btn--secondary auth-cta"
          >
            Entrar com outra conta
          </NuxtLink>
        </template>

        <!-- Logado com o e-mail certo -->
        <template v-else>
          <p v-if="erro" class="ld-erro" role="alert">{{ erro }}</p>
          <button
            type="button"
            class="ld-btn ld-btn--primary auth-cta"
            :disabled="aceitando"
            @click="aceitar"
          >
            <span v-if="aceitando" class="ld-spinner" aria-hidden="true" />
            {{ aceitando ? 'Entrando…' : 'Entrar na equipe' }}
          </button>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ld-papel);
  color: var(--ld-tinta);
  font-family: var(--ld-font-sans);
  padding: var(--ld-space-lg) var(--ld-space-md);
}
.auth-caixa {
  width: 100%;
  max-width: 26rem;
}
.auth-marca {
  display: flex;
  justify-content: center;
  margin-bottom: var(--ld-space-lg);
}
.auth-marca-logo {
  display: block;
  height: 52px;
  width: auto;
}
.auth-painel {
  padding: var(--ld-space-xl) var(--ld-space-lg);
}
.auth-painel h1 {
  margin: 0 0 var(--ld-space-sm);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.5rem;
  line-height: 1.2;
  text-wrap: balance;
}
.auth-nota {
  margin: 0 0 var(--ld-space-lg);
  font-size: 0.9375rem;
  line-height: 1.55;
  color: var(--ld-tinta-suave);
  text-wrap: pretty;
}
.auth-cta {
  width: 100%;
  margin-top: var(--ld-space-sm);
  /* NuxtLink com aparência de botão não centraliza sozinho */
  justify-content: center;
  text-decoration: none;
}
.auth-troca {
  margin: var(--ld-space-lg) 0 0;
  text-align: center;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}
.auth-troca a {
  color: var(--ld-verde);
  font-weight: 600;
  text-decoration: none;
}
.auth-troca a:hover {
  color: var(--ld-verde-profundo);
  text-decoration: underline;
}
</style>
