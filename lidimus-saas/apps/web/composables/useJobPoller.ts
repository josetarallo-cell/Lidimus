// Composable que faz polling de /api/jobs/:id até status done ou error
export function useJobPoller(jobId: Ref<string | null>, intervalMs = 3000) {
  const job = ref<Record<string, unknown> | null>(null)
  const polling = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  async function fetch() {
    if (!jobId.value) return
    try {
      const data = await $fetch<Record<string, unknown>>(`/api/jobs/${jobId.value}`)
      job.value = data
      if (data.status === 'done' || data.status === 'error') {
        stop()
      }
    } catch {
      // ignora erros transitórios
    }
  }

  function start() {
    // Polling é exclusivo do cliente; no SSR a página renderiza o estado inicial
    if (import.meta.server) return
    if (polling.value) return
    polling.value = true
    fetch()
    timer = setInterval(fetch, intervalMs)
  }

  function stop() {
    polling.value = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  watch(jobId, (id) => {
    stop()
    if (id) start()
  }, { immediate: true })

  onUnmounted(stop)

  return { job, polling, start, stop }
}
