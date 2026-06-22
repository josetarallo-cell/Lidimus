import { useAuth } from '../lib/auth'

// Injeta o usuário autenticado no contexto do evento.
// Rotas que precisam de auth fazem: const user = event.context.user
export default defineEventHandler(async (event) => {
  const auth = useAuth()
  const session = await auth.api.getSession({ headers: event.headers })
  event.context.user = session?.user ?? null
  event.context.session = session?.session ?? null
})
