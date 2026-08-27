// Marca a árvore de trabalho atual como validada no sandbox.
//
// `pnpm sandbox:ok "o que foi validado"`
//
// É o único sinal que o Lidimus Update aceita para promover algo a produção.
// A alternativa — deduzir sozinho que "o sandbox está mais novo que a produção"
// — mandaria para o ar qualquer código deixado pela metade no fim do dia.
//
// O marcador NÃO guarda o ID da imagem do sandbox: produção builda a própria
// imagem, com outro nome (lidimus-saas-web vs lidimus-sandbox-web), então esse
// campo não provaria nada. O que vale é o hash do que está no disco.
//
// Este arquivo é só a porta do teclado. A outra porta é o aceite pelo WhatsApp
// (docs/25-lidimus-update.md); as duas passam pelo mesmo aprovarSandbox().

import { aprovarSandbox } from './lidimus-update-comum.mjs'

const descricao = process.argv.slice(2).join(' ').trim()

if (!descricao) {
  console.error(
    'Falta a descrição do que foi validado.\n\n' +
    '  pnpm sandbox:ok "corrigi o calculo de creditos no upload em lote"\n\n' +
    'Ela vai para o corpo do commit e para o relatório do WhatsApp — daqui a\n' +
    'duas semanas é ela que explica por que aquele deploy aconteceu.',
  )
  process.exit(1)
}

let marcador
try {
  marcador = await aprovarSandbox(descricao)
} catch (e) {
  console.error(e.message)
  process.exit(1)
}

console.log('Sandbox aprovado para promoção.\n')
console.log(`  descrição: ${marcador.descricao}`)
console.log(`  commit:    ${marcador.commit.slice(0, 7)}`)
console.log(`  árvore:    ${marcador.hashArvore.slice(0, 12)}`)
console.log(`\nO Lidimus Update das 5h vai promover exatamente este estado.`)
console.log('Qualquer edição daqui até lá invalida a aprovação (e o deploy é adiado).')
