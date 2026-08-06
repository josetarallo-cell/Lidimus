<script setup lang="ts">
definePageMeta({ layout: false })

useHead({ title: 'Criar conta — Lidimus' })

const name = ref('')
const company = ref('')
const email = ref('')
const password = ref('')
const aceitouTermos = ref(false)
const error = ref('')
// Qual campo destacar em vermelho, para o erro não acender campos que estão
// certos.
const erroCampo = ref<'credenciais' | 'termos' | ''>('')

const termos = ref<{ abrir: () => void } | null>(null)
const loading = ref(false)
const aguardandoVerificacao = ref(false)

const { data: providers } = await useFetch('/api/auth-providers')

const route = useRoute()

// Quem chega por um convite volta para a tela do convite depois de criar a
// conta. Só caminhos internos — `redirect` absoluto viraria trampolim externo.
const destino = computed(() => {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : '/dashboard'
})

// Quem foi convidado já tem organização esperando: perguntar a empresa aqui
// criaria uma segunda, e o convite é justamente para entrar na de outra pessoa.
const veioDeConvite = computed(() => destino.value.startsWith('/convite/'))

// Volta do callback do Google quando o Better Auth recusa o cadastro
if (route.query.erro === 'google') {
  error.value = 'Não foi possível criar a conta com o Google. Tente novamente ou use e-mail e senha.'
}

// Marcar a caixa já resolve a pendência: manter "é preciso aceitar" na tela
// depois disso faria a cobrança sobreviver ao seu próprio motivo.
watch(aceitouTermos, (aceitou) => {
  if (aceitou && erroCampo.value === 'termos') {
    error.value = ''
    erroCampo.value = ''
  }
})

// O aceite vale para os dois caminhos de cadastro: pelo Google a conta nasce
// no callback, então a checagem precisa acontecer antes de sair da página.
function faltaAceitarTermos() {
  if (aceitouTermos.value) return false
  error.value = 'Para criar a conta, é preciso aceitar os Termos e Condições de Uso.'
  erroCampo.value = 'termos'
  return true
}

async function entrarComGoogle() {
  error.value = ''
  erroCampo.value = ''
  if (faltaAceitarTermos()) return
  try {
    const { url } = await $fetch<{ url: string }>('/api/auth/sign-in/social', {
      method: 'POST',
      body: {
        provider: 'google',
        callbackURL: destino.value,
        errorCallbackURL: `/auth/register?erro=google&redirect=${encodeURIComponent(destino.value)}`,
      },
    })
    window.location.href = url
  } catch {
    error.value = 'Não foi possível iniciar o cadastro com Google. Tente novamente.'
  }
}

async function register() {
  error.value = ''
  erroCampo.value = ''
  if (faltaAceitarTermos()) return
  loading.value = true
  try {
    // Com verificação de e-mail ligada, o cadastro não abre sessão: a resposta
    // vem com token null e o usuário precisa confirmar o e-mail antes de entrar.
    const { token } = await $fetch<{ token: string | null }>('/api/auth/sign-up/email', {
      method: 'POST',
      body: {
        name: name.value,
        // `undefined` e não string vazia: é `users.company` nulo que marca a
        // conta como individual e faz as boas-vindas perguntarem a empresa a
        // quem entrou pelo Google.
        company: company.value.trim() || undefined,
        email: email.value,
        password: password.value,
        callbackURL: destino.value,
      },
    })
    if (!token) {
      aguardandoVerificacao.value = true
      return
    }
    await navigateTo(destino.value)
  } catch (e: unknown) {
    error.value =
      (e as { data?: { message?: string } })?.data?.message ??
      'Não foi possível criar a conta. Confira os dados e tente novamente.'
    erroCampo.value = 'credenciais'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth">
    <main class="auth-caixa">
      <NuxtLink to="/" class="auth-marca">
        <img src="/logo.svg" alt="Lidimus" class="auth-marca-logo" />
      </NuxtLink>

      <section v-if="aguardandoVerificacao" class="ld-painel auth-painel">
        <h1>Confirme seu e-mail</h1>
        <p class="auth-nota">
          Enviamos um link de confirmação para <strong>{{ email }}</strong>. Abra o link para
          ativar sua conta e entrar — ele vale por 1 hora.
        </p>
        <p class="auth-nota">
          Não chegou? Confira a caixa de spam ou
          <NuxtLink to="/auth/login">tente entrar</NuxtLink> para receber um novo link.
        </p>
      </section>

      <section v-else class="ld-painel auth-painel">
        <h1>Criar conta</h1>
        <p class="auth-nota">
          A primeira análise de matrícula é grátis, e você ainda ganha 150 créditos para as demais
          ferramentas — sem cartão de crédito.
        </p>
        <form class="auth-form" novalidate @submit.prevent="register">
          <label class="ld-campo">
            <span class="ld-label">Nome</span>
            <input
              v-model="name"
              class="ld-input"
              type="text"
              autocomplete="name"
              placeholder="Seu nome completo"
              required
            />
          </label>
          <label v-if="!veioDeConvite" class="ld-campo">
            <span class="ld-label">Empresa <span class="auth-opcional">(opcional)</span></span>
            <input
              v-model="company"
              class="ld-input"
              type="text"
              autocomplete="organization"
              maxlength="120"
              placeholder="Nome do seu escritório ou cartório"
            />
            <span class="auth-dica">
              Deixe em branco se você usa o Lidimus sozinho — dá para criar uma equipe depois.
            </span>
          </label>
          <label class="ld-campo">
            <span class="ld-label">E-mail</span>
            <input
              v-model="email"
              class="ld-input"
              :class="{ 'ld-input--erro': erroCampo === 'credenciais' }"
              type="email"
              autocomplete="email"
              placeholder="voce@escritorio.com.br"
              required
            />
          </label>
          <label class="ld-campo">
            <span class="ld-label">Senha</span>
            <input
              v-model="password"
              class="ld-input"
              :class="{ 'ld-input--erro': erroCampo === 'credenciais' }"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
            />
            <span class="auth-dica">Mínimo de 8 caracteres.</span>
          </label>

          <!-- O aceite fica acima do botão: é a última coisa lida antes da
               ação, e não uma letra miúda depois dela. -->
          <label class="auth-termos" :class="{ 'auth-termos--erro': erroCampo === 'termos' }">
            <input v-model="aceitouTermos" type="checkbox" class="auth-termos-check" />
            <span>
              Li e compreendi os
              <button type="button" class="auth-termos-link" @click="termos?.abrir()">
                Termos e Condições de Uso
              </button>
              e concordo com eles.
            </span>
          </label>

          <p v-if="error" class="ld-erro" role="alert">{{ error }}</p>

          <button type="submit" class="ld-btn ld-btn--primary auth-cta" :disabled="loading">
            <span v-if="loading" class="ld-spinner" aria-hidden="true" />
            {{ loading ? 'Criando conta…' : 'Criar conta' }}
          </button>
        </form>

        <template v-if="providers?.google">
          <div class="auth-separador" role="separator">ou</div>
          <button type="button" class="ld-btn ld-btn--secondary auth-cta" @click="entrarComGoogle">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.72-4.96H1.29v3.1A12 12 0 0 0 12 24Z"/>
              <path fill="#FBBC05" d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l3.99-3.1Z"/>
              <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.6 4.59 1.79l3.44-3.44A11.98 11.98 0 0 0 1.29 6.62l3.99 3.1C6.22 6.87 8.87 4.76 12 4.76Z"/>
            </svg>
            Continuar com Google
          </button>
        </template>
      </section>

      <p class="auth-troca">
        Já tem conta?
        <NuxtLink :to="{ path: '/auth/login', query: route.query }">Entrar</NuxtLink>
      </p>
    </main>

    <TermosModal ref="termos" />
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
  max-width: 24rem;
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
  margin: 0 0 var(--ld-space-xs);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.5rem;
  line-height: 1.2;
}
.auth-nota {
  margin: 0 0 var(--ld-space-lg);
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-md);
}
.auth-dica {
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
/* "(opcional)" é qualificador do rótulo, não parte dele: peso e cor abaixo do
   nome do campo para não competir com ele na varredura vertical do formulário. */
.auth-opcional {
  font-weight: 400;
  color: var(--ld-tinta-suave);
}
/* ── Aceite dos termos ──────────────────────────────────── */
.auth-termos {
  display: flex;
  align-items: flex-start;
  gap: var(--ld-space-sm);
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--ld-tinta-suave);
  cursor: pointer;
}
.auth-termos-check {
  flex-shrink: 0;
  /* Alinha a caixa à primeira linha do texto, não ao topo da caixa de texto */
  margin-top: 1px;
  width: 1rem;
  height: 1rem;
  accent-color: var(--ld-verde);
  cursor: pointer;
}
/* Abre o modal, então é botão — mas lê como link, que é o que a pessoa procura
   ao lado de "Li e compreendi". */
.auth-termos-link {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--ld-verde);
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
.auth-termos-link:hover {
  color: var(--ld-verde-profundo);
}
/* Mesmos tokens de .ld-erro e .ld-input--erro: a tinta do carimbo no texto, o
   carimbo na moldura. */
.auth-termos--erro,
.auth-termos--erro .auth-termos-link {
  color: var(--ld-carimbo-tinta);
}
.auth-termos--erro .auth-termos-check {
  outline: 2px solid var(--ld-carimbo);
  outline-offset: 2px;
}

.auth-cta {
  width: 100%;
  margin-top: var(--ld-space-sm);
}
.auth-separador {
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  margin: var(--ld-space-md) 0;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.auth-separador::before,
.auth-separador::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--ld-filete);
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
