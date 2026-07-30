// Moldura comum dos e-mails transacionais. Fica separada do envio (email.ts)
// e dos textos (subscriptionEmails.ts, orgEmails.ts) porque cada família de
// e-mail tem seu próprio rodapé, mas todos precisam do mesmo cabeçalho.
export function emailLayout(titulo: string, corpo: string, rodape?: string): string {
  const base = useRuntimeConfig().publicBaseUrl
  const pe =
    rodape ??
    `Dúvidas sobre sua assinatura? Acesse <a href="${base}/conta/assinatura" style="color: #2e6e4e;">Minha conta → Assinatura</a>.`

  return `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #22302a;">
      <p style="font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #2e6e4e; margin-bottom: 4px;">Lidimus</p>
      <h1 style="font-size: 22px; margin: 0 0 16px;">${titulo}</h1>
      ${corpo}
      <p style="font-size: 13px; color: #55635b; border-top: 1px solid #dde2da; padding-top: 12px; margin-top: 24px;">
        ${pe}
      </p>
    </div>`
}

// Escapa o que vem do usuário (nome da organização, nome de quem convida)
// antes de entrar no HTML do e-mail.
export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
