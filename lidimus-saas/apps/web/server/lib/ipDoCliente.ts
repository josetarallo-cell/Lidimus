import type { H3Event } from 'h3'

// O IP de quem fez a requisição, na forma em que o resto do servidor o usa como
// chave: limite de falhas de autenticação da API e teto de análises de cortesia.
//
// Atrás do cloudflared o `remoteAddress` é sempre o do proxy — o IP real vem no
// cabeçalho, e `xForwardedFor: true` faz o h3 preferi-lo.
export function ipDoCliente(event: H3Event): string {
  const bruto = getRequestIP(event, { xForwardedFor: true })
  return bruto ? normalizarIp(bruto) : 'desconhecido'
}

// IPv6 é agrupado pelo prefixo /64. Provedor de IPv6 entrega ao assinante um
// bloco inteiro, então o endereço completo muda a cada reconexão (e a cada aba,
// com extensões de privacidade) sem que a casa mude: contar por endereço cheio
// tornaria o teto por IP decorativo. IPv4 fica inteiro — lá o endereço já é a
// unidade que o provedor entrega.
export function normalizarIp(ip: string): string {
  const limpo = ip.trim().toLowerCase()
  if (!limpo.includes(':')) return limpo

  // Endereço IPv4 mapeado em IPv6 (::ffff:187.4.3.2) é IPv4 de verdade.
  const mapeado = limpo.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (mapeado) return mapeado

  return prefixoIpv6(limpo)
}

// Os quatro primeiros hextetos do endereço, expandindo o "::" quando ele aparece
// antes deles (em ::1, por exemplo, os quatro primeiros são todos zero).
function prefixoIpv6(ip: string): string {
  const [antes, depois] = ip.split('::')
  const cabeca = antes ? antes.split(':') : []

  if (depois === undefined) return cabeca.slice(0, 4).join(':')

  const cauda = depois ? depois.split(':') : []
  const zeros = Math.max(0, 8 - cabeca.length - cauda.length)
  const completo = [...cabeca, ...Array(zeros).fill('0'), ...cauda]

  return completo.slice(0, 4).join(':')
}
