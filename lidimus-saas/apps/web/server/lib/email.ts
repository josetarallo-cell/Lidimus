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

  // O SDK do Resend não lança exceção em falha de API — devolve { error }
  const { error } = await _resend.emails.send({
    from: config.emailFrom,
    to,
    subject,
    html,
  })
  if (error) {
    console.error(`[email] falha no envio para=${to} assunto="${subject}":`, error)
    throw new Error(`Falha ao enviar e-mail: ${error.message}`)
  }
}
