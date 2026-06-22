import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { useDb } from './db'
import * as schema from '@lidimus/db'

let _auth: ReturnType<typeof betterAuth> | null = null

export function useAuth() {
  if (!_auth) {
    const config = useRuntimeConfig()
    const db = useDb()

    _auth = betterAuth({
      secret: config.betterAuthSecret,
      baseURL: config.publicBaseUrl,
      database: drizzleAdapter(db, {
        provider: 'pg',
        schema: {
          user: schema.users,
          session: schema.sessions,
          account: schema.accounts,
          verification: schema.verifications,
        },
      }),
      emailAndPassword: {
        enabled: true,
      },
    })
  }
  return _auth
}
