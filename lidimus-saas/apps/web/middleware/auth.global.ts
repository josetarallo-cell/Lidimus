// Protege as páginas internas: sem sessão válida, redireciona para o login.
// Antes deste middleware as APIs já respondiam 401 (nenhum dado vazava), mas o
// esqueleto das páginas renderizava para visitantes deslogados.
//
// Rotas públicas: landing e o fluxo de autenticação. Todo o resto exige sessão.
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/' || to.path.startsWith('/auth/')) return

  // useRequestFetch encaminha os cookies da requisição durante o SSR — um
  // $fetch simples no servidor sairia sem cookie e derrubaria sessões válidas.
  try {
    await useRequestFetch()('/api/me')
  } catch {
    return navigateTo('/auth/login')
  }
})
