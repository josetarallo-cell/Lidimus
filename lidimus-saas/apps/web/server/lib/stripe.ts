import Stripe from 'stripe'

let _stripe: Stripe | null = null

// Retorna o cliente Stripe, ou lança 503 se as chaves ainda não foram configuradas
// (em dev sem Stripe o restante do app segue funcionando).
export function useStripe(): Stripe {
  if (!_stripe) {
    const config = useRuntimeConfig()
    if (!config.stripeSecretKey) {
      throw createError({ statusCode: 503, statusMessage: 'Pagamentos ainda não configurados.' })
    }
    _stripe = new Stripe(config.stripeSecretKey)
  }
  return _stripe
}
