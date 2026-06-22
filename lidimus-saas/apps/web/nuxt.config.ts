export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: ['@nuxt/ui'],

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
