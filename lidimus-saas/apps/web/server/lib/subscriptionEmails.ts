import { eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { organizations, users } from '@lidimus/db'
import { sendEmail } from './email'
import { emailLayout } from './emailLayout'

// E-mails transacionais de assinatura. Todos são best-effort: falha de envio é
// engolida (com log) para nunca quebrar o webhook do Stripe nem a troca de plano.

export async function getOrgOwnerContact(
  db: Db,
  orgId: string,
): Promise<{ email: string; name: string } | null> {
  const [row] = await db
    .select({ email: users.email, name: users.name })
    .from(organizations)
    .innerJoin(users, eq(users.id, organizations.ownerId))
    .where(eq(organizations.id, orgId))
    .limit(1)
  return row ?? null
}

// Moldura compartilhada; o rodapé padrão dela já aponta para a assinatura, que
// é o assunto de todos os e-mails deste arquivo.
const layout = emailLayout

async function trySend(to: string, subject: string, html: string): Promise<void> {
  try {
    await sendEmail(to, subject, html)
  } catch (err) {
    console.error(`[subscriptionEmails] falha ao enviar "${subject}" para ${to}:`, err)
  }
}

export async function sendPlanChangedEmail(
  to: string,
  name: string,
  opts: { planName: string; change: 'upgrade' | 'downgrade'; creditsDelta?: number },
): Promise<void> {
  const efeito =
    opts.change === 'upgrade'
      ? `A mudança vale imediatamente${opts.creditsDelta && opts.creditsDelta > 0 ? ` e ${opts.creditsDelta} créditos já foram adicionados à sua conta` : ''}. A diferença proporcional do ciclo atual foi cobrada no seu cartão.`
      : 'A mudança vale a partir da próxima renovação — até lá você mantém o preço e os créditos do plano atual.'
  await trySend(
    to,
    `Seu plano mudou para ${opts.planName}`,
    layout(
      `Plano alterado para ${opts.planName}`,
      `<p>Olá, ${name}.</p>
       <p>Confirmamos a alteração da sua assinatura para o plano <strong>${opts.planName}</strong>.</p>
       <p>${efeito}</p>
       <p>Se você não fez essa alteração, responda este e-mail imediatamente.</p>`,
    ),
  )
}

export async function sendPaymentFailedEmail(to: string, name: string): Promise<void> {
  const base = useRuntimeConfig().publicBaseUrl
  await trySend(
    to,
    'Não conseguimos cobrar sua assinatura',
    layout(
      'Pagamento não aprovado',
      `<p>Olá, ${name}.</p>
       <p>A cobrança da renovação da sua assinatura Lidimus não foi aprovada pelo seu banco ou cartão.</p>
       <p>Para não perder o acesso aos créditos do próximo ciclo, atualize sua forma de pagamento em
       <a href="${base}/conta/assinatura" style="color: #2e6e4e;">Minha conta → Assinatura → Gerenciar pagamento</a>.
       A cobrança será tentada novamente nos próximos dias.</p>`,
    ),
  )
}

export async function sendSubscriptionCanceledEmail(to: string, name: string): Promise<void> {
  const base = useRuntimeConfig().publicBaseUrl
  await trySend(
    to,
    'Sua assinatura foi cancelada',
    layout(
      'Assinatura cancelada',
      `<p>Olá, ${name}.</p>
       <p>Sua assinatura Lidimus foi cancelada. Os créditos que você já possui continuam válidos e podem ser usados normalmente.</p>
       <p>Se o cancelamento não foi feito por você, responda este e-mail imediatamente.</p>
       <p>Quando quiser voltar, é só assinar novamente em
       <a href="${base}/conta/assinatura" style="color: #2e6e4e;">Minha conta → Assinatura</a>.</p>`,
    ),
  )
}

export async function sendSubscriptionRenewedEmail(
  to: string,
  name: string,
  opts: { planName: string; credits: number },
): Promise<void> {
  const base = useRuntimeConfig().publicBaseUrl
  await trySend(
    to,
    `Assinatura renovada — ${opts.credits} créditos adicionados`,
    layout(
      'Assinatura renovada',
      `<p>Olá, ${name}.</p>
       <p>Sua assinatura do plano <strong>${opts.planName}</strong> foi renovada e
       <strong>${opts.credits} créditos</strong> foram adicionados à sua conta.</p>
       <p>Acompanhe seu saldo e histórico em
       <a href="${base}/conta/creditos" style="color: #2e6e4e;">Minha conta → Créditos</a>.</p>`,
    ),
  )
}
