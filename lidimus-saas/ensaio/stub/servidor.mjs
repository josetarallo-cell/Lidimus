// Aplicação mínima que faz o papel do `web` e do `worker` na matriz de cenários.
//
// Por que existe: a matriz precisa rodar dezenas de vezes seguidas, e cada
// `docker compose build` do Nuxt real leva de 15 a 30 minutos. Com este stub um
// cenário fecha em menos de um minuto. A divisão de trabalho é explícita:
//
//   matriz de cenários (stub)  → testa a ORQUESTRAÇÃO do deploy: ordem das
//                                fases, gates, ledger de migrations, rollback,
//                                consumo do marcador, forma do relatório.
//   ensaio geral (Dockerfiles  → testa o BUILD e o schema de verdade, uma vez
//   reais, docker-compose.       por noite, contra um clone do banco de
//   ensaio.yml)                  produção.
//
// O stub não simula o Lidimus: ele simula apenas as superfícies que o pipeline
// observa — /api/health, /api/health?profundo=1, o estado do container e o
// `pnpm --filter db migrate`. É de propósito que a lista seja curta; qualquer
// coisa além disso viraria um segundo sistema para manter em sincronia.

import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'

const papel = process.argv[2] === 'worker' ? 'worker' : 'web'
const versao = process.env.ENSAIO_VERSAO || '?'

// Os defeitos pertencem à imagem CANDIDATA, nunca à anterior.
//
// Sem esta linha o cenário de rollback não prova nada: o `.env.ensaio` é um só
// para as duas imagens, então um `ENSAIO_MODO_WEB=insalubre` deixaria doente
// também a versão para a qual o rollback volta — e o pipeline terminaria em
// "o rollback também falhou" em vez de demonstrar que a produção foi
// restaurada. No mundo real a versão anterior funciona: é por isso que voltar
// para ela é a saída.
const ehCandidata = versao === 'candidata'
const modo = (ehCandidata
  ? (papel === 'worker' ? process.env.ENSAIO_MODO_WORKER : process.env.ENSAIO_MODO_WEB)
  : 'saudavel') || 'saudavel'

// O cenário "código novo contra schema velho" (a falha de 27/08/2026) é
// exatamente isto: o processo sobe, o health raso passa, e a primeira consulta
// que nomeia uma coluna do schema novo estoura. Também só vale para a
// candidata — o código anterior não conhece a coluna nova e não a consulta.
const SELECT_PROFUNDO = (ehCandidata && process.env.ENSAIO_SELECT_PROFUNDO)
  || 'select 1 from plans limit 1'

console.log(`[stub/${papel}] versao=${versao} modo=${modo}`)

// Crash-loop: com `restart: on-failure` no compose, o container fica alternando
// entre `running` e `restarting`. Era esse o caso que o smoke antigo aprovava,
// porque `.State.Running` é `true` entre dois reinícios.
if (modo === 'crash') {
  console.error(`[stub/${papel}] modo crash — saindo em 1.5s`)
  setTimeout(() => process.exit(1), 1500)
}

function consultaOk(sql) {
  const url = process.env.DATABASE_URL
  if (!url) return false
  // Sem shell: o SQL vai como argumento único e não passa por nenhum parser
  // de linha de comando.
  const r = spawnSync('psql', [url, '-t', '-A', '-c', sql], { encoding: 'utf8' })
  if (r.status !== 0) console.error(`[stub/${papel}] consulta falhou: ${(r.stderr || '').trim()}`)
  return r.status === 0
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const responder = (status, corpo) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(corpo))
  }

  if (url.pathname !== '/api/health') return responder(404, { status: 'nao-encontrado' })

  if (modo === 'insalubre') return responder(503, { status: 'error', versao })

  if (url.searchParams.get('profundo') === '1' && !consultaOk(SELECT_PROFUNDO)) {
    return responder(503, { status: 'error', versao })
  }

  return responder(200, { status: 'ok', versao, papel })
}).listen(3000, () => console.log(`[stub/${papel}] escutando em 3000`))
