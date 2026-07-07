import type { H3Event } from 'h3'
import { requireAuth } from './requireAuth'

export function requirePlatformAdmin(event: H3Event) {
  const user = requireAuth(event)
  if (!user.isPlatformAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}
