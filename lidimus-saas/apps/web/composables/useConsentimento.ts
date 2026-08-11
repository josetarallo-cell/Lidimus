// Estado de consentimento para cookies e scripts de terceiros.
//
// Hoje o Lidimus não tem um único cookie não-necessário: só sessão, proteção de
// CSRF, aceite dos Termos e os cookies de borda da Cloudflare. Por isso o que o
// usuário vê é o AvisoCookies — informativo, um botão — e não um banner de
// consentimento. O Guia Orientativo da ANPD (18/10/2022) é explícito: para
// cookie necessário a base legal é legítimo interesse ou execução de contrato,
// não consentimento, porque não há escolha real a oferecer. Banner com
// "rejeitar todos" que não desliga nada é declaração falsa ao titular.
//
// Este módulo existe porque analytics deve entrar em alguns meses. Ele é o
// ponto único onde essa decisão passa a valer:
//
//   REGRA: nenhum script de terceiro entra no <head> direto. Todo rastreador
//   carrega condicionado a `useConsentimento()`, e só depois de `aceitou()`
//   devolver true para a categoria dele.
//
// No dia em que o primeiro rastreador entrar, o AvisoCookies vira banner de
// duas camadas — "aceitar todos" e "rejeitar todos" com o mesmo destaque na
// primeira, granularidade por categoria na segunda, tudo desmarcado por padrão.
// A infraestrutura abaixo já suporta isso; falta só a interface.

export type CategoriaCookie = 'necessarios' | 'analiticos' | 'marketing'

export type EstadoConsentimento = Record<CategoriaCookie, boolean>

// Versionado como os Termos: mudando o que se pergunta, a escolha antiga deixa
// de responder à pergunta nova e precisa ser feita de novo. Ver shared/termos.ts.
export const VERSAO_CONSENTIMENTO = '2026-08-07'

const COOKIE_CONSENTIMENTO = 'ld_consentimento'

// Um ano é o teto usual para não transformar a pergunta em incômodo recorrente,
// e ainda assim reapresentá-la de tempos em tempos.
const DURACAO_DIAS = 365

// Necessários são sempre verdadeiros e não são negociáveis: sem eles não há
// login nem proteção contra abuso. Os demais nascem falsos — consentimento
// exige ato afirmativo (art. 5º, XII), então caixa pré-marcada não vale.
const PADRAO: EstadoConsentimento = {
  necessarios: true,
  analiticos: false,
  marketing: false,
}

type Registro = { versao: string; escolhas: EstadoConsentimento }

export function useConsentimento() {
  const cookie = useCookie<Registro | null>(COOKIE_CONSENTIMENTO, {
    default: () => null,
    maxAge: DURACAO_DIAS * 24 * 60 * 60,
    sameSite: 'lax',
    // Não é HttpOnly de propósito: a decisão precisa ser lida pelo próprio
    // navegador antes de carregar (ou não carregar) qualquer script.
    secure: import.meta.client ? window.location.protocol === 'https:' : true,
    path: '/',
  })

  // Registro de versão anterior não vale para a pergunta atual.
  const vigente = computed(
    () => (cookie.value?.versao === VERSAO_CONSENTIMENTO ? cookie.value : null),
  )

  const decidiu = computed(() => vigente.value !== null)

  const escolhas = computed<EstadoConsentimento>(() => ({
    ...PADRAO,
    ...(vigente.value?.escolhas ?? {}),
    // Nunca deixar um registro gravado desligar o que é indispensável.
    necessarios: true,
  }))

  function aceitou(categoria: CategoriaCookie) {
    return escolhas.value[categoria]
  }

  function registrar(escolhasNovas: Partial<EstadoConsentimento>) {
    cookie.value = {
      versao: VERSAO_CONSENTIMENTO,
      escolhas: { ...PADRAO, ...escolhasNovas, necessarios: true },
    }
  }

  // Usado pelo aviso informativo de hoje: reconhece a leitura sem afirmar que
  // houve consentimento para algo que não existe.
  function registrarCiencia() {
    registrar({})
  }

  return { decidiu, escolhas, aceitou, registrar, registrarCiencia }
}
