import { sendEmail } from './email'
import { emailLayout, escapeHtml } from './emailLayout'

// Convite para entrar numa organização.
//
// Diferente dos e-mails de assinatura, este NÃO é best-effort: se o envio
// falhar, o erro precisa subir até a tela. Um convite que não chega e não avisa
// deixa o dono esperando alguém que nunca foi convidado de fato — por isso o
// endpoint desfaz o convite quando este envio estoura.
export async function sendInviteEmail(
  to: string,
  opts: { orgName: string; convidadoPor: string; token: string; expiraEm: Date },
): Promise<void> {
  const base = useRuntimeConfig().publicBaseUrl
  const url = `${base}/convite/${opts.token}`
  const org = escapeHtml(opts.orgName)
  const quem = escapeHtml(opts.convidadoPor)
  const validade = opts.expiraEm.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  await sendEmail(
    to,
    `${quem} convidou você para o Lidimus`,
    emailLayout(
      `Convite para ${org}`,
      `<p><strong>${quem}</strong> convidou você para usar o Lidimus junto com a equipe de
       <strong>${org}</strong>.</p>
       <p>As análises de matrícula, croquis e memoriais ficam disponíveis para todo mundo da
       organização, e os créditos são do plano — você não precisa assinar nada.</p>
       <p style="margin: 24px 0;">
         <a href="${url}" style="background: #2e6e4e; color: #ffffff; padding: 12px 22px; text-decoration: none; display: inline-block;">Entrar na equipe</a>
       </p>
       <p style="font-size: 13px; color: #55635b;">O convite vale até ${validade}. Se o botão não
       funcionar, copie este endereço no navegador:<br /><span style="word-break: break-all;">${url}</span></p>`,
      'Não esperava este convite? Basta ignorar este e-mail — nada acontece sem você abrir o link.',
    ),
  )
}
