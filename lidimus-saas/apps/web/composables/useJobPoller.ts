// Acompanha /api/jobs/:id até status done ou error.
// Preferência: SSE (/api/jobs/:id/stream, push via Redis). Se o EventSource
// falhar (proxy corporativo, rede que bloqueia SSE), cai para polling de 3s.
//
// A queda para polling é por SILÊNCIO, não por `readyState`. A diferença custou
// uma tela travada em produção: quando o stream falha de forma repetida atrás de
// um proxy (502 a cada tentativa), o EventSource não desiste — ele fica
// reconectando, e `readyState` alterna entre CONNECTING e OPEN sem nunca chegar
// a CLOSED. A condição antiga (`=== CLOSED`) portanto nunca se cumpria, o
// fallback nunca disparava, e a página esperava para sempre por um estado que já
// estava no banco havia minutos.
//
// Por isso o servidor manda um `ping` a cada 15s (ver stream.get.ts) e aqui só
// interessa uma pergunta: chegou alguma coisa ultimamente? Se não chegou, não
// importa o porquê — passa a buscar por conta própria.
const SILENCIO_TOLERADO_MS = 25_000
const INTERVALO_VIGIA_MS = 5_000

export function useJobPoller(jobId: Ref<string | null>, intervalMs = 3000) {
  const job = ref<Record<string, unknown> | null>(null)
  const polling = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  let vigia: ReturnType<typeof setInterval> | null = null
  let es: EventSource | null = null
  let ultimoSinal = 0

  function isFinal(data: Record<string, unknown>): boolean {
    return data.status === 'done' || data.status === 'error'
  }

  async function fetchOnce() {
    if (!jobId.value) return
    try {
      const data = await $fetch<Record<string, unknown>>(`/api/jobs/${jobId.value}`)
      job.value = data
      if (isFinal(data)) stop()
    } catch {
      // ignora erros transitórios
    }
  }

  function startPolling() {
    if (timer) return
    fetchOnce()
    timer = setInterval(fetchOnce, intervalMs)
  }

  // Desiste do push e passa a buscar. Sem volta: se o stream não se sustentou
  // uma vez, insistir nele é o que deixou a tela parada.
  function caiParaPolling() {
    if (vigia) {
      clearInterval(vigia)
      vigia = null
    }
    if (es) {
      es.close()
      es = null
    }
    if (polling.value) startPolling()
  }

  function startStream(id: string) {
    ultimoSinal = Date.now()
    es = new EventSource(`/api/jobs/${id}/stream`)

    es.onmessage = (e) => {
      ultimoSinal = Date.now()
      try {
        const data = JSON.parse(e.data) as Record<string, unknown>
        job.value = data
        // fecha do lado do cliente no estado final — senão o EventSource
        // reconectaria em loop quando o servidor encerra o stream
        if (isFinal(data)) stop()
      } catch {
        // mensagem malformada — o fallback/reconexão cobre
      }
    }

    // Sinal de vida do servidor. Não carrega estado; serve só para o vigia
    // abaixo saber que o canal está de pé e não trocar por polling à toa.
    es.addEventListener('ping', () => {
      ultimoSinal = Date.now()
    })

    es.onerror = () => {
      // Queda definitiva é rara; quando acontece, não vale esperar o vigia.
      if (es && es.readyState === EventSource.CLOSED && polling.value) caiParaPolling()
    }

    vigia = setInterval(() => {
      if (!polling.value) return
      if (Date.now() - ultimoSinal > SILENCIO_TOLERADO_MS) caiParaPolling()
    }, INTERVALO_VIGIA_MS)
  }

  function start() {
    // Acompanhamento é exclusivo do cliente; no SSR a página renderiza o estado inicial
    if (import.meta.server) return
    if (polling.value || !jobId.value) return
    polling.value = true
    if (typeof EventSource !== 'undefined') {
      startStream(jobId.value)
    } else {
      startPolling()
    }
  }

  function stop() {
    polling.value = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (vigia) {
      clearInterval(vigia)
      vigia = null
    }
    if (es) {
      es.close()
      es = null
    }
  }

  watch(jobId, (id) => {
    stop()
    if (id) start()
  }, { immediate: true })

  onUnmounted(stop)

  return { job, polling, start, stop }
}
