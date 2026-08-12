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

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { CAMINHO_MARCADOR, hashArvore } from './lidimus-update-comum.mjs'
import { PORTA_WEB } from './sandbox-env.mjs'

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

// Aprovar um sandbox que não está de pé é quase sempre engano: ou o container
// caiu, ou o que foi testado foi o `nuxt dev` no host, que não passa pelo build
// do container — justamente onde os erros de build aparecem.
const url = `http://127.0.0.1:${PORTA_WEB}/api/health`
let saude
try {
  const resposta = await fetch(url, { signal: AbortSignal.timeout(5000) })
  saude = await resposta.json()
} catch (e) {
  console.error(`O sandbox não respondeu em ${url} (${e.message}).\n` +
    'Suba com `pnpm sandbox:up` e valide lá antes de aprovar.')
  process.exit(1)
}

if (saude?.status !== 'ok') {
  console.error(`O sandbox respondeu, mas não está saudável: ${JSON.stringify(saude)}`)
  process.exit(1)
}

const { commit, hash, arquivos } = await hashArvore()

const marcador = {
  descricao,
  commit,
  hashArvore: hash,
  arquivos,
  aprovadoEm: new Date().toISOString(),
  aprovadoPor: process.env.USERNAME || process.env.USER || 'desconhecido',
}

mkdirSync(dirname(CAMINHO_MARCADOR), { recursive: true })
writeFileSync(CAMINHO_MARCADOR, JSON.stringify(marcador, null, 2) + '\n', 'utf8')

console.log('Sandbox aprovado para promoção.\n')
console.log(`  descrição: ${descricao}`)
console.log(`  commit:    ${commit.slice(0, 7)}`)
console.log(`  árvore:    ${hash.slice(0, 12)}`)
console.log(`\nO Lidimus Update das 5h vai promover exatamente este estado.`)
console.log('Qualquer edição daqui até lá invalida a aprovação (e o deploy é adiado).')
