// Dispara um webhook n8n e aguarda o 202 de confirmação.
// O processamento real é assíncrono — o n8n faz callback para /api/webhooks/n8n-callback.
export async function triggerN8nWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`n8n webhook failed: ${res.status} ${body}`)
  }
}
