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

    // Verificação de e-mail no cadastro. Só pode ser ligada quando o Resend
    // estiver enviando de um domínio verificado — com o remetente padrão
    // (onboarding@resend.dev) a entrega só chega ao dono da conta Resend, e
    // todo cadastro novo ficaria travado sem receber o link. Ver docs/50-seguranca.md.
    const requireEmailVerification = config.requireEmailVerification

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
        requireEmailVerification,
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
      emailVerification: {
        sendOnSignUp: requireEmailVerification,
        // Reenvia sozinho quando alguém tenta entrar sem ter verificado — evita
        // que contas antigas (criadas antes desta trava) fiquem sem saída.
        sendOnSignIn: requireEmailVerification,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
          await sendEmail(
            user.email,
            'Confirme seu e-mail — Lidimus',
            `<p>Olá, ${user.name || ''}.</p>
             <p>Para ativar sua conta no Lidimus, confirme este endereço de e-mail
             pelo link abaixo (válido por 1 hora):</p>
             <p><a href="${url}">Confirmar meu e-mail</a></p>
             <p>Se você não criou esta conta, ignore este e-mail.</p>`,
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
      account: {
        // Quem já tem conta por e-mail/senha e entra pelo Google com o mesmo
        // e-mail cai no mesmo usuário.
        accountLinking: {
          enabled: true,
          trustedProviders: ['google'],
          // Sem verificação de e-mail no cadastro, exigir e-mail local
          // verificado bloquearia todo mundo ("account_not_linked"). O preço de
          // afrouxar: quem se cadastrar por senha com o e-mail alheio herda a
          // conta quando o dono real entrar pelo Google — por isso a trava volta
          // junto com a verificação, e não depois.
          requireLocalEmailVerified: requireEmailVerification,
        },
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
          // Marcado pelo próprio app em /api/account/welcome, nunca pelo cliente
          welcomed: {
            type: 'boolean',
            required: false,
            defaultValue: false,
            input: false,
          },
        },
      },
    })
  }
  return _auth
}
