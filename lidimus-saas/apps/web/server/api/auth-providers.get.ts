// Quais provedores sociais estão habilitados — o front usa para decidir se
// mostra o botão "Entrar com Google" (depende só de env, sem dado sensível)
export default defineEventHandler(() => {
  const config = useRuntimeConfig()
  return {
    google: Boolean(config.googleClientId && config.googleClientSecret),
  }
})
