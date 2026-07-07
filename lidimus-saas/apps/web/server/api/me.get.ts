import { requireAuth } from '../lib/requireAuth'

export default defineEventHandler((event) => {
  const user = requireAuth(event)
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isPlatformAdmin: user.isPlatformAdmin,
  }
})
