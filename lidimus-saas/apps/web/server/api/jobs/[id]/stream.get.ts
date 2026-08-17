import { useDb } from '../../../lib/db'
import { useQueues } from '../../../lib/queue'
import { requireAuth } from '../../../lib/requireAuth'
import { getJobForUser } from '../../../lib/getJobForUser'
import { jobEventsChannel } from '../../../lib/jobEvents'

// Status do job via Server-Sent Events, alimentado por pub/sub no Redis.
// O cliente mantém o polling como fallback quando EventSource falha (ver useJobPoller).
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const jobId = getRouterParam(event, 'id')
  if (!jobId) throw createError({ statusCode: 400 })

  const initial = await getJobForUser(db, jobId, user.id)
  if (!initial) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  const eventStream = createEventStream(event)

  // Conexão dedicada — uma conexão Redis em modo subscribe não serve para mais nada
  const subscriber = useQueues().connection.duplicate()

  let closed = false

  async function close() {
    if (closed) return
    closed = true
    clearInterval(safetyInterval)
    await subscriber.quit().catch(() => {})
    await eventStream.close().catch(() => {})
  }

  // Último payload enviado. A reconsulta de segurança dispara a cada 15s mesmo
  // sem nada ter mudado, e desde o corretor de leitura o job carrega os recortes
  // em base64 enquanto espera resposta — reenviar centenas de kilobytes de
  // imagem idêntica de 15 em 15 segundos, por quinze minutos, não informa nada.
  let ultimoEnvio = ''

  // Devolve se chegou a transmitir algo — quem chama usa isso para decidir se
  // precisa mandar um sinal de vida no lugar.
  const push = async (): Promise<boolean> => {
    if (closed) return false
    try {
      const job = await getJobForUser(db, jobId, user.id)
      if (!job) return false
      const payload = JSON.stringify(job)
      if (payload === ultimoEnvio) return false
      ultimoEnvio = payload
      await eventStream.push(payload)
      // após o estado final não há mais o que transmitir — o cliente também
      // fecha do lado dele ao receber done/error (não vai reconectar)
      if (job.status === 'done' || job.status === 'error') await close()
      return true
    } catch {
      // cliente desconectou no meio do push — encerrar sem derrubar o processo
      await close()
      return false
    }
  }

  // Rede de segurança para transições que não publicam evento (ex.: worker
  // marcando processing) — reconsulta esparsa, bem mais leve que polling de 3s.
  //
  // Quando não há nada de novo, vai um sinal de vida no lugar do payload. Ele
  // não é enfeite: antes de existir, a reconsulta reenviava o job inteiro a cada
  // 15s e era isso, sem querer, que mantinha a conexão viva. Ao parar de repetir
  // payload idêntico, o stream ficou minutos calado — e conexão calada atrás do
  // túnel do Cloudflare é conexão encerrada, que chega ao navegador como 502.
  //
  // Vai como evento nomeado de propósito: o `onmessage` do EventSource só recebe
  // eventos sem nome, então o ping atravessa sem passar perto do estado do job.
  // Quem escuta é o vigia de silêncio do useJobPoller, para saber que o canal
  // ainda está de pé.
  const safetyInterval = setInterval(async () => {
    const transmitiu = await push()
    if (transmitiu || closed) return
    try {
      await eventStream.push({ event: 'ping', data: '1' })
    } catch {
      await close()
    }
  }, 15_000)

  eventStream.onClosed(close)

  subscriber
    .subscribe(jobEventsChannel(jobId))
    .then(() => subscriber.on('message', push))
    .catch(() => close())

  // Estado inicial: só depois do response iniciar — fechar/empurrar antes do
  // send() deixa o cliente sem resposta nenhuma
  setTimeout(push, 0)

  return eventStream.send()
})
