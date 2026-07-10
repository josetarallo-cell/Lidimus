// Traduz falhas de envio em mensagens acionáveis.
// O padrão antigo culpava "sua conexão" para qualquer erro — inclusive 402
// (créditos insuficientes), o erro mais previsível do produto.
export interface ErroUpload {
  texto: string
  linkTo?: string
  linkLabel?: string
}

export function mensagemDeErroDeUpload(err: unknown): ErroUpload {
  const e = err as { statusCode?: number; status?: number; data?: { statusMessage?: string } }
  const status = e?.statusCode ?? e?.status
  const detalhe = e?.data?.statusMessage

  if (status === 402) {
    return {
      texto: detalhe ?? 'Créditos insuficientes para esta análise.',
      linkTo: '/conta/assinatura',
      linkLabel: 'Ver planos e créditos',
    }
  }
  if (status === 413) {
    return { texto: detalhe ?? 'O arquivo excede o tamanho máximo permitido.' }
  }
  if (status === 429) {
    return { texto: 'Muitos envios em sequência. Aguarde alguns minutos e tente novamente.' }
  }
  if (status && status >= 400 && status < 500 && detalhe) {
    return { texto: detalhe }
  }
  return { texto: 'Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.' }
}
