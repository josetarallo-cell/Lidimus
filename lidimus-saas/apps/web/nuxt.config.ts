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
          href: 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800&family=Archivo+Narrow:wght@400;500;600;700&family=Besley:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=Fragment+Mono&display=swap',
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
    // 60 e não 20 desde que a tela envia lote: com teto de 10 arquivos por lote,
    // 20 por hora deixaria o cliente com dois envios e um 429 — o limite viraria
    // o gargalo em vez da proteção.
    uploadRateLimitPerHour: Number(process.env.UPLOAD_RATE_LIMIT_PER_HOUR || 60),
    // Teto próprio para a API pública: integração de lote legitimamente submete
    // mais que gente clicando na tela, então o limite do painel a estrangularia.
    apiRateLimitPerHour: Number(process.env.API_RATE_LIMIT_PER_HOUR || 120),
    maxUploadSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB || 50),
    // Teto de arquivos por lote. Não é só ergonomia: cada arquivo vira uma
    // execução do n8n, e a espera na fila conta para o watchdog de jobs presos
    // (STUCK_JOB_TIMEOUT_MINUTES). Subir este número exige refazer essa conta.
    maxBatchFiles: Number(process.env.MAX_BATCH_FILES || 10),
    // Teto do lote inteiro. O Nitro bufferiza o corpo da requisição em memória,
    // então 10 arquivos no limite individual de 50MB seriam 500MB no processo web.
    maxBatchTotalMb: Number(process.env.MAX_BATCH_TOTAL_MB || 120),
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    resendApiKey: process.env.RESEND_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM || 'Lidimus <onboarding@resend.dev>',
    // Só ligar depois que o Resend estiver enviando de domínio verificado
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
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
