// Tempo decorrido desde que o job entrou na fila.
//
// Numa espera de três minutos (mediana real das matrículas), o cronômetro é o
// que separa "está trabalhando" de "travou": nenhuma barra de progresso honesta
// existe aqui — o pipeline não reporta percentual —, mas um número que anda
// prova movimento sem inventar progresso.
//
// Só conta no cliente: no SSR não há relógio para acompanhar, e um valor
// renderizado no servidor chegaria velho e quebraria a hidratação.
export function useTempoDecorrido(inicio: Ref<string | Date | null | undefined>) {
  const segundos = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null

  function calcular() {
    const t = inicio.value
    if (!t) {
      segundos.value = 0
      return
    }
    const ms = Date.now() - new Date(t).getTime()
    // Relógio do cliente adiantado em relação ao do servidor daria negativo
    segundos.value = Math.max(0, Math.round(ms / 1000))
  }

  function parar() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  onMounted(() => {
    calcular()
    timer = setInterval(calcular, 1000)
  })

  watch(inicio, calcular)
  onUnmounted(parar)

  return { segundos, parar }
}

// "1 min 12 s" — em português, com o minuto aparecendo só quando existe.
// Segundo cru até 60s; abaixo de 10s quem chama nem exibe (ver EstadoProcessando).
export function formatarDecorrido(total: number): string {
  if (total < 60) return `${total} s`
  const min = Math.floor(total / 60)
  const seg = total % 60
  return seg === 0 ? `${min} min` : `${min} min ${seg} s`
}
