import * as Sentry from '@sentry/node'

// Rastreamento de erros do servidor web — inativo sem SENTRY_DSN, então dev
// local e ambientes sem Sentry seguem funcionando sem nenhuma configuração.
export default defineNitroPlugin((nitroApp) => {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  })

  nitroApp.hooks.hook('error', (error, { event }) => {
    // 4xx são erros esperados de negócio (401/402/413/429...) — só rastrear falha real
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode && statusCode < 500) return

    Sentry.captureException(error, {
      extra: {
        path: event?.path,
        method: event?.method,
      },
    })
  })
})
