import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { useDb } from './db'
import { sendEmail } from './email'
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
        sendResetPassword: async ({ user, url }) => {
          await sendEmail(
            user.email,
            'Redefinir sua senha — Lidimus',
            `<p>Olá, ${user.name || ''}.</p>
             <p>Recebemos um pedido para redefinir a senha da sua conta no Lidimus.
             Se foi você, use o link abaixo (válido por 1 hora):</p>
             <p><a href="${url}">Redefinir senha</a></p>
             <p>Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.</p>`,
          )
        },
      },
      // Provedores sociais só entram quando as credenciais existirem no .env —
      // sem elas o login por e-mail/senha segue funcionando normalmente
      socialProviders: {
        ...(config.googleClientId && config.googleClientSecret
          ? {
              google: {
                clientId: config.googleClientId,
                clientSecret: config.googleClientSecret,
              },
            }
          : {}),
      },
      user: {
        additionalFields: {
          isPlatformAdmin: {
            type: 'boolean',
            required: false,
            defaultValue: false,
            // nunca aceito via input do usuário (sign-up/update-profile) — só promovido manualmente
            input: false,
          },
        },
      },
    })
  }
  return _auth
}
