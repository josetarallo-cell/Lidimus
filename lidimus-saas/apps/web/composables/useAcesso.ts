// Nível de acesso da organização (ferramentas do plano + análises avulsas).
// A chave fixa faz layout e páginas compartilharem uma única requisição por
// render — o servidor é quem decide o acesso; isto aqui só evita oferecer o que
// vai ser recusado.
export function useAcesso() {
  return useFetch('/api/account/access', { key: 'account-access' })
}
