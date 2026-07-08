import { Resend } from 'resend'

let _resend: Resend | null = null

// E-mail transacional via Resend. Sem RESEND_API_KEY o envio vira log no
// console — em dev dá para copiar o link de redefinição direto do log do web.
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const config = useRuntimeConfig()

  if (!config.resendApiKey) {
    console.log(`[email não configurado] para=${to} assunto="${subject}"\n${html}`)
    return
  }

  if (!_resend) _resend = new Resend(config.resendApiKey)

  await _resend.emails.send({
    from: config.emailFrom,
    to,
    subject,
    html,
  })
}
