// Protege as páginas internas: sem sessão válida, redireciona para o login.
// Antes deste middleware as APIs já respondiam 401 (nenhum dado vazava), mas o
// esqueleto das páginas renderizava para visitantes deslogados.
//
// Rotas públicas: landing, o fluxo de autenticação, a tela de convite — que
// precisa mostrar quem convidou antes de exigir conta (o aceite em si continua
// exigindo sessão, no servidor) — e a documentação da API, que costuma ser lida
// por quem faz a integração e não necessariamente tem login.
export default defineNuxtRouteMiddleware(async (to) => {
  // `/docs` sem barra é o índice — sem o teste de igualdade ele cairia no login,
  // que é exatamente a página que precisa abrir para quem ainda não tem conta.
  if (
    to.path === '/' ||
    to.path === '/docs' ||
    to.path.startsWith('/auth/') ||
    to.path.startsWith('/convite/') ||
    to.path.startsWith('/docs/')
  )
    return

  // useRequestFetch encaminha os cookies da requisição durante o SSR — um
  // $fetch simples no servidor sairia sem cookie e derrubaria sessões válidas.
  try {
    await useRequestFetch()('/api/me')
  } catch {
    return navigateTo('/auth/login')
  }
})
