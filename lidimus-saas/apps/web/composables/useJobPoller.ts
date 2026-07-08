// Acompanha /api/jobs/:id até status done ou error.
// Preferência: SSE (/api/jobs/:id/stream, push via Redis). Se o EventSource
// falhar (proxy corporativo, rede que bloqueia SSE), cai para polling de 3s.
export function useJobPoller(jobId: Ref<string | null>, intervalMs = 3000) {
  const job = ref<Record<string, unknown> | null>(null)
  const polling = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  let es: EventSource | null = null

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

  function startStream(id: string) {
    es = new EventSource(`/api/jobs/${id}/stream`)
    es.onmessage = (e) => {
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
    es.onerror = () => {
      // EventSource reconecta sozinho em quedas transitórias; se a conexão
      // fechou de vez, troca definitivamente para polling
      if (es && es.readyState === EventSource.CLOSED && polling.value) {
        es.close()
        es = null
        startPolling()
      }
    }
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
