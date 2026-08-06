// Versão vigente dos Termos e Condições de Uso, em um lugar só. O modal exibe a
// data e o servidor grava o identificador no aceite: se cada lado tivesse a sua
// cópia, o registro acabaria dizendo que a pessoa aceitou uma versão diferente
// da que leu.
//
// Ao publicar uma alteração relevante no texto, mude as duas linhas abaixo. Os
// aceites anteriores continuam apontando para a versão antiga — é o que os torna
// prova de algo, e não do texto de hoje.
export const VERSAO_TERMOS = '2026-08-06'
export const VIGENCIA_TERMOS = '6 de agosto de 2026'

// Nome do cookie que leva o aceite do formulário até o servidor. Precisa
// atravessar a ida ao Google e voltar no callback, então é cookie e não campo
// do corpo da requisição — o cadastro social não tem corpo nenhum.
export const COOKIE_ACEITE = 'ld_aceite_termos'
