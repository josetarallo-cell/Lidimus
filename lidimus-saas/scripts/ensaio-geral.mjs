// O ensaio noturno: prepara o ambiente e roda o pipeline inteiro nele.
//
//   pnpm ensaio:geral
//
// É isto que o n8n chama às 3h30, 90 minutos antes do deploy de verdade. A
// diferença para a matriz de cenários (`pnpm ensaio`) é que aqui os Dockerfiles
// são os REAIS: o que está sendo testado é o build do Nuxt e do worker contra um
// clone do banco de produção. A imagem que sair daqui validada é exatamente a
// que a produção promove às 5h, sem rebuildar.
//
// Existe como script separado, e não como um ramo dentro do lidimus-update.mjs,
// porque preparar o ambiente e exercitar o pipeline são responsabilidades
// diferentes — e porque uma falha na PREPARAÇÃO não pode ser confundida com uma
// reprovação do código. Reprovar por engano bloquearia o deploy das 5h.

import { spawn } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import {
  COMPOSE_GERAL, PORTA_GERAL,
  dumpDaProducao, gerarEnvEnsaio, restaurarBanco, subirBanco,
} from './ensaio-preparar.mjs'
import { executar, raizSaas } from './lidimus-update-comum.mjs'

function relatarFalhaDaPreparacao(fase, motivo) {
  // Mesmo formato do lidimus-update.mjs: o agente e o n8n leem os dois pelo
  // mesmo caminho, e a marca é o que separa log de relatório.
  console.log('FIM-DO-RELATORIO')
  console.log(JSON.stringify({
    alvo: 'ensaio',
    iniciadoEm: new Date().toISOString(),
    concluidoEm: new Date().toISOString(),
    resultado: 'erro-do-agente',
    fase,
    motivo: `o ensaio não pôde ser preparado: ${motivo}`,
    erros: [motivo],
    smoke: [],
  }))
  process.exit(1)
}

let dump = null

try {
  console.log('Ensaio geral — preparando o ambiente\n')

  gerarEnvEnsaio(PORTA_GERAL)
  console.log(`  .env.ensaio gerado a partir de .env.sandbox (porta ${PORTA_GERAL})`)

  await subirBanco(COMPOSE_GERAL)
  console.log('  postgres e redis do ensaio de pé')

  // Dump novo, não o último de `backups/`: o ensaio precisa enfrentar o schema
  // que a produção tem AGORA, que é o que o deploy das 5h vai encontrar. Um
  // dump de dias atrás testaria outra coisa.
  dump = await dumpDaProducao()
  const migrations = await restaurarBanco(COMPOSE_GERAL, dump)
  console.log(`  banco clonado da produção (${migrations} migrations no ledger)\n`)
} catch (e) {
  relatarFalhaDaPreparacao('preparacao', String(e?.message || e))
}

const filho = spawn('node', ['scripts/lidimus-update.mjs', '--alvo=ensaio', '--geral'], {
  cwd: raizSaas,
  shell: true,
  stdio: 'inherit',
  env: process.env,
})

filho.on('close', async (codigo) => {
  // O clone do banco tem dados de cliente e não tem por que sobreviver ao
  // ensaio. As IMAGENS ficam — é uma delas que a produção promove às 5h.
  if (dump && existsSync(dump)) {
    try { unlinkSync(dump) } catch { /* o expurgo do tmp pega depois */ }
  }
  await executar('docker', ['compose', '-f', COMPOSE_GERAL, '--env-file', '.env.ensaio', 'down'],
    { cwd: raizSaas, timeoutMs: 5 * 60 * 1000 })

  process.exit(codigo ?? 1)
})
