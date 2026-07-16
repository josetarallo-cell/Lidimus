export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: ['@nuxt/ui'],

  css: ['~/assets/css/lidimus.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Besley:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=Fragment+Mono&display=swap',
        },
      ],
    },
  },

  runtimeConfig: {
    // Variáveis disponíveis apenas no servidor
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    betterAuthSecret: process.env.BETTER_AUTH_SECRET,
    n8nCallbackSecret: process.env.N8N_CALLBACK_SECRET,
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
    googleCloudSaKeyJson: process.env.GOOGLE_CLOUD_SA_KEY_JSON,
    gcsBucketName: process.env.GCS_BUCKET_NAME || 'lidimus-job-files',
    uploadRateLimitPerHour: Number(process.env.UPLOAD_RATE_LIMIT_PER_HOUR || 20),
    maxUploadSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB || 25),
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    resendApiKey: process.env.RESEND_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM || 'Lidimus <onboarding@resend.dev>',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    // Câmbio US$→R$ para o painel de custos (custo de modelos é cobrado em USD)
    usdBrlRate: Number(process.env.USD_BRL_RATE || 5.45),

    // Variáveis disponíveis no cliente via useRuntimeConfig().public
    public: {
      appName: 'Lidimus',
    },
  },

  nitro: {
    experimental: {
      asyncContext: true,
    },
  },

  typescript: {
    strict: true,
  },
})
