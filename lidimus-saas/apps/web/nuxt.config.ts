export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: ['@nuxt/ui'],

  css: ['~/assets/css/lidimus.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      link: [
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
