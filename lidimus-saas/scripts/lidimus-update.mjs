// Lidimus Update — promove para produção o que foi validado no sandbox.
//
// Chamado pelo update-agent.mjs (que o n8n dispara às 5h) ou à mão:
//   node scripts/lidimus-update.mjs --dry-run
//   node scripts/lidimus-update.mjs --alvo=ensaio --geral
//
// Devolve um relatório JSON na última linha do stdout. Tudo o mais que ele
// imprime é log legível — o agente separa os dois pela marca FIM-DO-RELATORIO.
//
// Três decisões de ordem que não são óbvias:
//
// 1. A imagem é construída ANTES de empurrar para o GitHub. Os testes deste
//    repositório cobrem quatro pacotes e nenhuma rota de API, auth ou billing —
//    o build do Nuxt é o gate de qualidade mais amplo que existe. Empurrar antes
//    de buildar publicaria um build quebrado.
//
// 2. O build é separado do `up -d`. Era tudo um passo só (`up -d --build`), e
//    por isso um build quebrado só aparecia depois que a produção já tinha
//    parado. Separando, o site velho continua servindo durante os minutos de
//    build e a interrupção real cai para os segundos da recriação.
//
// 3. Desde 28/08/2026 a produção normalmente NÃO builda: o ensaio das 3h30 já
//    construiu e validou a imagem desta mesma árvore, e às 5h ela é só
//    promovida por `docker tag`. Isso tira ~30 min do caminho crítico e elimina
//    a classe "passou no ensaio e falhou no build de produção". Sem selo de
//    ensaio (máquina desligada de madrugada, por exemplo) ele builda como antes.

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  buscarComRepeticao, carimbo, compararArvores, executar, git, hashArvore,
  lerEnvProducaoBruto, lerMarcador, montarLinkAprovacao, raizSaas,
  resumoPendencia, valorDoEnv, CAMINHO_MARCADOR,
} from './lidimus-update-comum.mjs'
import {
  escolherAlvo, lerSelo,
  CAMINHO_PUBLICACAO_PENDENTE, CAMINHO_SELO_ENSAIO, CAMINHO_SELO_REPROVADO,
} from './lidimus-alvos.mjs'

const ehDryRun = process.argv.includes('--dry-run')
// O ensaio "geral" roda sobre a árvore de trabalho real com os Dockerfiles
// verdadeiros — é o ensaio noturno. Sem ele, o alvo `ensaio` é o da matriz de
// cenários, que roda sobre uma cópia da árvore em tmp.
const ehGeral = process.argv.includes('--geral')
const alvo = escolherAlvo()

// Onde o link de aprovação do WhatsApp aponta (webhook do workflow
// "Lidimus Aprovar"). Vive no .env de produção junto do LIDIMUS_UPDATE_TOKEN.
const URL_APROVAR = valorDoEnv(lerEnvProducaoBruto(), 'LIDIMUS_APROVAR_URL')
  || 'https://n8n.gvlar.com/webhook/lidimus-aprovar'

// SQL que não pode rodar sozinho às 5h. O histórico tem casos reais: a
// migration 0015_papeis_equipe faz DELETE FROM organizations e dropa
// users.active_org_id. Encontrando qualquer um destes, o deploy para antes de
// tocar em produção e chama gente.
//
// Este gate é também o que sustenta a política de rollback lá embaixo: tudo que
// a automação aplica sozinha passou por aqui, logo é aditivo.
const SQL_DESTRUTIVO = /\b(drop\s+(table|column|constraint|index|schema|type)|delete\s+from|truncate|set\s+data\s+type|set\s+not\s+null)\b/i

// Nunca commitar, mesmo com a árvore aprovada.
const NUNCA_COMMITAR = /(^|[\\/])(backups[\\/]|\.lidimus[\\/])|\.(sql|pem|key|p12|pfx)$|\.env($|\.)/i

// Exceções: casam com a peneira por extensão, mas são exatamente o que um
// deploy precisa publicar. Em 27/08/2026 a peneira derrubou a fase do GitHub
// com produção já no ar — o `.sql` mira o dump do banco e levou junto a
// migration 0025_autenticidade; o `.env` mira .env e .env.sandbox, e o ponto
// da alternância pegou também o .env.example, que é template sem segredo.
// Lista estreita de propósito: só migration do Drizzle e só o .example — os
// dois já versionados, e nenhum outro .sql existe fora de packages/db/drizzle.
const PODE_COMMITAR = /(^|[\\/])packages[\\/]db[\\/]drizzle[\\/][^\\/]+\.sql$|(^|[\\/])\.env\.example$/i

const relatorio = {
  iniciadoEm: new Date().toISOString(),
  concluidoEm: null,
  alvo: alvo.nome,
  dryRun: ehDryRun,
  resultado: 'em-andamento',
  fase: null,
  motivo: null,
  aprovacao: null,
  // Só existe quando o deploy não aconteceu por falta de aprovação: descreve o
  // que ficou parado e carrega o link de aceite pelo WhatsApp.
  pendencia: null,
  codigo: { commitsAFrente: 0, commits: [] },
  // `verificado` separa "conferi e não achei nada" de "nem cheguei a conferir".
  // Sem essa distinção, um abort no preflight produzia um relatório dizendo
  // "n8n em sincronia" e "nenhuma migration pendente" — duas afirmações que
  // ninguém tinha checado.
  n8n: { verificado: false, divergentes: [], erros: [] },
  migrations: { verificado: false, pendentes: [], aplicadas: false, bloqueadas: false, contagemAntes: null },
  deploy: { imagensBackup: [], dump: null, downtimeSegundos: null, origemDaImagem: null },
  smoke: [],
  disco: { livreGbAntes: null, livreGbDepois: null },
  github: { commit: null, empurrado: false, conferido: false, pendencia: null },
  ensaio: { selo: null, aproveitado: false },
  erros: [],
}

let hashDaArvore = null

const log = (msg) => console.log(msg)
const servicos = () => [['web', alvo.imagemWeb], ['worker', alvo.imagemWorker]]

// Desfechos que não são falha: o agente e o n8n usam o código de saída para
// decidir o tom da mensagem no WhatsApp.
const DESFECHOS_OK = ['sucesso', 'sucesso-sem-push', 'nada-a-fazer']

function encerrar(resultado, motivo) {
  relatorio.resultado = resultado
  relatorio.motivo = motivo
  relatorio.concluidoEm = new Date().toISOString()

  // O ensaio existe para produzir uma resposta binária para o run das 5h: esta
  // árvore pode subir ou não. Gravar a reprovação aqui (e não no roteiro
  // principal) garante que ela é registrada em QUALQUER caminho de saída,
  // inclusive nos aborts que acontecem dentro das fases.
  //
  // Mas só reprova o que é sobre o CÓDIGO. Um abort de preflight no ensaio é
  // ambiental — sandbox no chão, disco apertado, fila ocupada, credencial
  // vencida — e o run das 5h reavalia cada um desses gates por conta própria,
  // com o ambiente daquele momento. Gravar reprovação aí criaria um portão
  // emperrado: o sandbox volta, tudo está bem, e o deploy continua bloqueado por
  // um selo de madrugada. É exatamente o padrão que deixou 14 dias sem deploy.
  const sobreOCodigo = !['preflight', 'mudancas', 'n8n'].includes(relatorio.fase)
  if (alvo.gravaSelo && !ehDryRun && !DESFECHOS_OK.includes(resultado) && hashDaArvore && sobreOCodigo) {
    gravarSeloReprovado(motivo)
  }

  console.log('FIM-DO-RELATORIO')
  console.log(JSON.stringify(relatorio))
  process.exit(DESFECHOS_OK.includes(resultado) ? 0 : 1)
}

function abortar(fase, motivo) {
  relatorio.fase = fase
  relatorio.erros.push(motivo)
  log(`\n✗ abortado na ${fase}: ${motivo}`)
  encerrar('abortado', motivo)
}

async function docker(args, opcoes = {}) {
  return executar('docker', args, { cwd: alvo.cwd, ...opcoes })
}

// Devolve { ok, valor } ou { ok: false, erro }.
//
// A distinção importa: antes isto devolvia `null` tanto para "o Postgres
// recusou a conexão" quanto para "a consulta não retornou linha", e os três
// pontos que chamam isto reportavam a mesma frase genérica.
//
// O SQL vai por stdin (`psql -f -`) em vez de interpolado em `-c "${sql}"`:
// `executar` roda com `shell: true`, então qualquer aspa dentro do SQL quebrava
// a linha de comando no cmd.exe.
async function consultarBanco(sql) {
  const r = await docker(
    [...alvo.compose, 'exec', '-T', 'postgres',
      'psql', '-U', alvo.pg.usuario, '-d', alvo.pg.banco, '-t', '-A', '-f', '-'],
    { entrada: sql },
  )
  return r.ok
    ? { ok: true, valor: r.saida.trim() }
    : { ok: false, erro: (r.erro || r.saida || 'sem saída').slice(-400) }
}

async function espacoLivreGb() {
  const r = await executar('powershell', ['-NoProfile', '-Command', '"(Get-PSDrive C).Free"'])
  const bytes = Number(r.saida)
  return Number.isFinite(bytes) ? bytes / 1024 ** 3 : null
}

// Nome do container resolvido pelo Compose, não escrito à mão.
//
// Era `lidimus-saas-web-1` literal, o que amarrava o script a um único projeto
// e quebraria silenciosamente se o Compose mudasse a convenção de nome.
async function idDoContainer(servico) {
  const r = await docker([...alvo.compose, 'ps', '-q', servico])
  if (!r.ok) return null
  return r.saida.trim().split(/\r?\n/).filter(Boolean)[0] || null
}

// Dois `inspect` separados, e não um template só, porque `executar` usa
// `shell: true`: um formato como `{{if .State.Health}}` tem espaço dentro e
// seria quebrado em dois argumentos pelo cmd.exe.
async function estadoDoContainer(id) {
  const status = await docker(['inspect', '-f', '{{.State.Status}}', id])
  const saude = await docker(['inspect', '-f', '{{.State.Health.Status}}', id])
  return {
    estado: (status.saida || '').trim(),
    // Sem healthcheck declarado o template falha; aí o estado é o único critério.
    saude: saude.ok ? (saude.saida || '').trim() : 'sem-healthcheck',
  }
}

// Espera o container ficar SAUDÁVEL, não apenas "rodando".
//
// `.State.Running` era o critério do smoke, e ele é `true` entre dois reinícios
// de um crash-loop: um worker que morre a cada 5s passava no teste. E como o
// healthcheck do compose tem interval de 30s, logo depois do `up` o estado
// legítimo é `starting` — por isso isto faz polling em vez de uma leitura só.
async function esperarSaude(servico, { tentativas = 30, esperaMs = 3000 } = {}) {
  const id = await idDoContainer(servico)
  if (!id) return { ok: false, detalhe: 'o Compose não conhece esse container' }

  let ultimo = 'desconhecido'
  for (let i = 0; i < tentativas; i++) {
    const { estado, saude } = await estadoDoContainer(id)
    ultimo = `${estado}/${saude}`

    if (estado !== 'running') return { ok: false, detalhe: ultimo }
    if (saude === 'healthy' || saude === 'sem-healthcheck') return { ok: true, detalhe: ultimo }
    if (saude === 'unhealthy') return { ok: false, detalhe: ultimo }
    await new Promise((r) => setTimeout(r, esperaMs))
  }
  return { ok: false, detalhe: `${ultimo} — não estabilizou` }
}

// Os pacotes que têm teste, descobertos no disco.
//
// A lista era fixa em ['croqui', 'docx'] e ficou defasada: em 27/08/2026 subiu
// para produção o pacote `autenticidade`, que TEM testes e não era rodado por
// ninguém. Uma lista escrita à mão envelhece em silêncio; esta não.
function pacotesComTeste() {
  const achados = []
  for (const grupo of ['packages', 'apps']) {
    const base = resolve(raizSaas, grupo)
    if (!existsSync(base)) continue
    for (const nome of readdirSync(base)) {
      const manifesto = resolve(base, nome, 'package.json')
      if (!existsSync(manifesto)) continue
      try {
        const json = JSON.parse(readFileSync(manifesto, 'utf8'))
        if (json.scripts?.test) achados.push(json.name || nome)
      } catch { /* package.json ilegível não vira gate de deploy */ }
    }
  }
  return achados.sort()
}

function consumirMarcador(sufixo) {
  if (!alvo.consomeMarcador || ehDryRun) return
  if (!existsSync(CAMINHO_MARCADOR)) return
  writeFileSync(`${CAMINHO_MARCADOR}.${sufixo}`, readFileSync(CAMINHO_MARCADOR))
  unlinkSync(CAMINHO_MARCADOR)
  if (relatorio.aprovacao) relatorio.aprovacao.consumida = sufixo
}

function registrarPublicacaoPendente(tipo, motivo) {
  const pendencia = { tipo, motivo, quando: new Date().toISOString(), commit: relatorio.github.commit }
  mkdirSync(dirname(CAMINHO_PUBLICACAO_PENDENTE), { recursive: true })
  writeFileSync(CAMINHO_PUBLICACAO_PENDENTE, JSON.stringify(pendencia, null, 2) + '\n', 'utf8')
  relatorio.github.pendencia = pendencia
}

function gravarSeloReprovado(motivo) {
  try {
    mkdirSync(dirname(CAMINHO_SELO_REPROVADO), { recursive: true })
    writeFileSync(CAMINHO_SELO_REPROVADO, JSON.stringify({
      hashArvore: hashDaArvore,
      fase: relatorio.fase,
      motivo,
      quando: new Date().toISOString(),
    }, null, 2) + '\n', 'utf8')
    if (existsSync(CAMINHO_SELO_ENSAIO)) unlinkSync(CAMINHO_SELO_ENSAIO)
  } catch (e) {
    relatorio.erros.push(`não consegui gravar o selo de ensaio reprovado: ${e.message}`)
  }
}

// ---------------------------------------------------------------- fase 0
async function preflight() {
  relatorio.fase = 'preflight'
  log('— preflight')

  const livre = await espacoLivreGb()
  relatorio.disco.livreGbAntes = livre === null ? null : Number(livre.toFixed(1))
  if (livre !== null && livre < alvo.espacoMinimoGb) {
    abortar('preflight', `disco com ${livre.toFixed(1)} GB livres (mínimo ${alvo.espacoMinimoGb} GB) — o build cresceria o disco virtual do Docker até derrubar o Postgres de produção`)
  }
  log(`  disco: ${livre?.toFixed(1)} GB livres`)

  const marcador = lerMarcador()
  if (!marcador) {
    log('  nenhuma aprovação pendente')
    // Antes de desistir, levanta o que ficou para trás. É isso que transforma o
    // "💤 nada aprovado" numa mensagem acionável: a lista do que está parado e o
    // link para aprovar do celular. Falha aqui não pode derrubar o relatório —
    // o desfecho continua sendo `nada-a-fazer`.
    try {
      const pendencia = await resumoPendencia()
      if (pendencia.temMudanca) {
        relatorio.pendencia = { ...pendencia, ...montarLinkAprovacao(pendencia, URL_APROVAR) }
      }
    } catch (e) {
      relatorio.erros.push(`não consegui montar o convite de aprovação: ${e.message}`)
    }
    encerrar('nada-a-fazer', 'nenhum sandbox aprovado desde o último deploy')
  }
  relatorio.aprovacao = marcador

  const atual = await hashArvore()
  hashDaArvore = atual.hash
  if (atual.hash !== marcador.hashArvore) {
    // Nomear os arquivos importa: quem lê isto às 8h precisa distinguir entre
    // "o editor reformatou um arquivo" e "alguém mexeu no código depois de
    // aprovar" sem ter que ir garimpar no git.
    const mudancas = compararArvores(marcador.arquivos, atual.arquivos)
    abortar('preflight',
      `a árvore mudou depois da aprovação de ${marcador.aprovadoEm}: `
      + `${mudancas.slice(0, 10).join(', ')}${mudancas.length > 10 ? ` e mais ${mudancas.length - 10}` : ''}`
      + ' — valide de novo e rode pnpm sandbox:ok')
  }
  log(`  aprovação: "${marcador.descricao}" (${marcador.commit.slice(0, 7)})`)

  // O veredito do ensaio da madrugada. Reprovação vale só para a árvore que ele
  // ensaiou: se o código mudou depois, o selo está desatualizado e não diz nada
  // sobre o que está no disco agora.
  if (alvo.aproveitaSeloDoEnsaio) {
    const reprovado = lerSelo(CAMINHO_SELO_REPROVADO, hashDaArvore)
    if (reprovado && !reprovado.desatualizado) {
      abortar('preflight',
        `o ensaio reprovou esta mesma árvore em ${reprovado.quando} (fase ${reprovado.fase}): `
        + `${reprovado.motivo} — produção não foi tocada. Corrija, valide no sandbox e aprove de novo`)
    }
  }

  if (alvo.urlSandbox) {
    const sandbox = await buscarComRepeticao(`${alvo.urlSandbox}/api/health`, { tentativas: 2 })
    if (!sandbox.ok) abortar('preflight', `sandbox não respondeu em ${alvo.urlSandbox}/api/health`)
    log('  sandbox saudável')
  }

  if (alvo.verificaEnv) {
    const env = await executar('node', ['scripts/verificar-env-producao.mjs', '--json'])
    const envJson = JSON.parse(env.saida || '{}')
    if (!envJson.ok) {
      abortar('preflight', `.env de produção não sustenta este código: ${(envJson.problemas || []).join('; ')}`)
    }
    log('  .env de produção consistente')
  }

  if (alvo.rodaTestes) {
    const pacotes = pacotesComTeste()
    for (const pacote of pacotes) {
      const t = await executar('pnpm', ['--filter', pacote, 'test'], { timeoutMs: 5 * 60 * 1000 })
      if (!t.ok) abortar('preflight', `testes de ${pacote} falharam:\n${(t.saida || t.erro).slice(-2000)}`)
    }
    log(`  testes passaram: ${pacotes.join(', ')}`)
  } else if (alvo.testesSimulados === 'falha') {
    abortar('preflight', 'testes de @lidimus/simulado falharam:\n(simulado pela matriz de cenários)')
  }

  if (alvo.verificaPush) {
    // --dry-run e não ls-remote: credencial só de leitura passa no ls-remote e
    // falha no push, já com a produção buildada.
    const push = await git(['push', '--dry-run', 'origin', 'main'], { timeoutMs: 60000 })
    if (!push.ok) {
      abortar('preflight', `git push não está autorizado (o token do gh expira periodicamente): ${push.erro || push.saida}`)
    }
    log('  credencial do GitHub válida para push')
  }

  if (alvo.exigeFilaVazia) {
    const emVoo = await consultarBanco("select count(*) from jobs where status in ('pending','queued','processing')")
    if (!emVoo.ok) abortar('preflight', `não consegui consultar a fila no banco: ${emVoo.erro}`)
    if (Number(emVoo.valor) > 0) {
      // Durante a recriação do web o callback do n8n leva conexão recusada; o job
      // fica preso e o watchdog estorna o crédito depois do timeout. O cliente
      // perde a análise e o custo de Document AI/Claude já foi gasto.
      abortar('preflight', `${emVoo.valor} job(s) em processamento — adiado para não derrubar callback do n8n em voo`)
    }
    log('  fila vazia')
  }
}

// ---------------------------------------------------------------- fase 1
async function levantarMudancas() {
  relatorio.fase = 'mudancas'
  log('— o que mudou')

  // Um push que ficou para trás é a primeira coisa a resolver: entre 22 e 24/08
  // de 2026 a fase do GitHub abortou três dias seguidos com a produção já no ar,
  // e ninguém tentou de novo — o repositório passou dias atrás do que estava
  // rodando.
  await tentarPublicacaoPendente()

  await git(['fetch', 'origin', 'main'], { timeoutMs: 60000 })
  const commits = await git(['log', '--oneline', 'origin/main..HEAD'])
  const linhas = commits.saida.split(/\r?\n/).filter(Boolean)
  relatorio.codigo.commits = linhas
  relatorio.codigo.commitsAFrente = linhas.length

  const sujos = await git(['status', '--porcelain'])
  relatorio.codigo.arquivosNaoCommitados = sujos.saida.split(/\r?\n/).filter(Boolean).length

  log(`  ${linhas.length} commit(s) à frente de origin/main, ${relatorio.codigo.arquivosNaoCommitados} arquivo(s) a commitar`)
}

async function tentarPublicacaoPendente() {
  if (!alvo.publicaNoGithub || !existsSync(CAMINHO_PUBLICACAO_PENDENTE)) return

  let pendencia
  try {
    pendencia = JSON.parse(readFileSync(CAMINHO_PUBLICACAO_PENDENTE, 'utf8'))
  } catch {
    unlinkSync(CAMINHO_PUBLICACAO_PENDENTE)
    return
  }

  // Só o push se retenta sozinho. Uma pendência de commit veio de arquivo
  // barrado pela peneira — isso exige gente, e insistir só repetiria o abort.
  if (pendencia.tipo !== 'push') {
    relatorio.github.pendencia = pendencia
    relatorio.erros.push(`publicação pendente desde ${pendencia.quando}: ${pendencia.motivo}`)
    log(`  ⚠ publicação pendente desde ${pendencia.quando} — ${pendencia.motivo}`)
    return
  }

  log(`  push pendente desde ${pendencia.quando} — tentando de novo`)
  const p = await git(['push', 'origin', 'main'], { timeoutMs: 5 * 60 * 1000 })
  if (p.ok) {
    unlinkSync(CAMINHO_PUBLICACAO_PENDENTE)
    log('  push pendente resolvido')
  } else {
    relatorio.github.pendencia = pendencia
    relatorio.erros.push(`o push pendente de ${pendencia.quando} continua falhando: ${p.erro || p.saida}`)
    log('  ⚠ o push pendente continua falhando')
  }
}

// ---------------------------------------------------------------- fase 2
async function conferirN8n() {
  relatorio.fase = 'n8n'
  log('— divergência do n8n')

  const r = await executar('node', ['scripts/n8n-diff.mjs', '--json'], { timeoutMs: 120000 })
  try {
    const json = JSON.parse(r.saida)
    relatorio.n8n.divergentes = json.workflows.filter((w) => w.estado === 'divergente')
      .map((w) => ({ arquivo: w.arquivo, nos: w.nos }))
    relatorio.n8n.erros = json.workflows.filter((w) => w.estado === 'erro')
      .map((w) => `${w.arquivo}: ${w.detalhe}`)
  } catch {
    relatorio.n8n.erros = ['não consegui ler o diff do n8n']
  }

  // Divergência é informação, nunca bloqueio: a reconciliação é decisão humana
  // e este passo não escreve em ponta nenhuma.
  relatorio.n8n.verificado = true
  log(`  ${relatorio.n8n.divergentes.length} divergente(s), ${relatorio.n8n.erros.length} erro(s)`)
}

// ---------------------------------------------------------------- fase 3
async function conferirMigrations() {
  relatorio.fase = 'migrations'
  log('— migrations pendentes')

  const journal = JSON.parse(readFileSync(resolve(raizSaas, 'packages/db/drizzle/meta/_journal.json'), 'utf8'))
  const aplicadasEm = await consultarBanco('select coalesce(max(created_at), 0) from drizzle.__drizzle_migrations')
  if (!aplicadasEm.ok) abortar('migrations', `não consegui ler drizzle.__drizzle_migrations: ${aplicadasEm.erro}`)

  const marco = Number(aplicadasEm.valor)
  const pendentes = journal.entries.filter((e) => e.when > marco)

  // O migrator ordena por `when`, não por nome, e este journal tem `when`
  // escritos à mão. Uma migration nova com `when` menor que o marco seria
  // pulada em silêncio e o deploy reportaria sucesso.
  const contagem = await consultarBanco('select count(*) from drizzle.__drizzle_migrations')
  if (!contagem.ok) abortar('migrations', `não consegui contar as migrations aplicadas: ${contagem.erro}`)
  const esperadas = journal.entries.filter((e) => e.when <= marco).length
  if (Number(contagem.valor) !== esperadas) {
    abortar('migrations', `o journal tem ${esperadas} migrations até o marco mas o banco registra ${contagem.valor} — alguma foi pulada, confira à mão`)
  }

  relatorio.migrations.contagemAntes = Number(contagem.valor)
  relatorio.migrations.pendentes = pendentes.map((e) => e.tag)
  relatorio.migrations.verificado = true
  if (!pendentes.length) {
    log('  nenhuma pendente')
    return
  }

  for (const entrada of pendentes) {
    const caminho = resolve(raizSaas, 'packages/db/drizzle', `${entrada.tag}.sql`)
    if (!existsSync(caminho)) abortar('migrations', `${entrada.tag}.sql está no journal mas não no disco`)
    const sql = readFileSync(caminho, 'utf8')
    if (SQL_DESTRUTIVO.test(sql)) {
      relatorio.migrations.bloqueadas = true
      abortar('migrations', `${entrada.tag} contém SQL destrutivo — aplique à mão, com backup, e rode o deploy depois`)
    }
  }

  log(`  ${pendentes.length} pendente(s), todas aditivas: ${relatorio.migrations.pendentes.join(', ')}`)
}

// ---------------------------------------------------------------- fase 4
async function implantar() {
  relatorio.fase = 'deploy'
  log('— deploy')

  if (ehDryRun) {
    // Mesmo sem tocar em nada, dizer QUAL caminho seria tomado é metade do valor
    // de um dry-run.
    const selo = alvo.aproveitaSeloDoEnsaio ? lerSelo(CAMINHO_SELO_ENSAIO, hashDaArvore) : null
    const origem = selo && !selo.desatualizado ? `promoveria a imagem do ensaio de ${selo.quando}` : 'buildaria do zero'
    relatorio.ensaio.selo = selo
    log(`  (dry-run: ${origem}; migrations e recriação pulados)`)
    return {}
  }

  const marca = carimbo()

  mkdirSync(alvo.dirBackups, { recursive: true })
  const caminhoDump = resolve(alvo.dirBackups, `pre-deploy-${marca}.sql`)
  const dump = await docker([...alvo.compose, 'exec', '-T', 'postgres', 'pg_dump', '-U', alvo.pg.usuario, alvo.pg.banco],
    { timeoutMs: 10 * 60 * 1000 })
  if (!dump.ok) abortar('deploy', `pg_dump falhou: ${dump.erro}`)
  writeFileSync(caminhoDump, dump.saida, 'utf8')
  relatorio.deploy.dump = caminhoDump
  log(`  dump em ${caminhoDump}`)

  // Tag com hora, não só data: as tags `antes-2026-08-11` que existiam foram
  // sobrescritas por um segundo deploy no mesmo dia e o ponto de rollback se
  // perdeu.
  for (const [servico, imagem] of servicos()) {
    const destino = `${imagem}:antes-${marca}`
    const t = await docker(['tag', `${imagem}:latest`, destino])
    if (!t.ok) {
      // Sem imagem anterior não existe ponto de rollback. Em produção isso é
      // anomalia e para tudo; numa stack de ensaio recém-criada é o primeiro
      // deploy dela, e seguir sem rede é aceitável.
      if (alvo.nome === 'producao') abortar('deploy', `não consegui marcar ${destino}: ${t.erro}`)
      log(`  (sem imagem anterior de ${servico}: este deploy não terá rollback)`)
      continue
    }
    relatorio.deploy.imagensBackup.push(destino)
  }
  if (relatorio.deploy.imagensBackup.length) log(`  imagens marcadas para rollback: antes-${marca}`)

  await obterImagem()

  if (relatorio.migrations.pendentes.length) {
    // Do host o `pnpm db:migrate` não funciona: o .env aponta @postgres:5432,
    // que não resolve no Windows. Dentro do container o hostname resolve e o
    // dotenv vira no-op (o .env não é COPYado na imagem).
    //
    // `run --rm`, não `exec`: o `exec` roda no container que AINDA está no ar,
    // cuja imagem é a antiga e não tem os .sql novos. Em 27/08/2026 o migrator
    // leu o journal velho, não viu nada pendente, saiu com código 0, e o deploy
    // subiu código novo contra schema velho — todo upload passou a morrer em
    // `column "sha256" does not exist`. `run` usa a imagem recém-buildada.
    // `--no-deps` pelo mesmo motivo do `up` abaixo, e `run` não publica portas,
    // então não briga com o container de produção na 3000.
    const m = await docker([...alvo.compose, 'run', '--rm', '--no-deps', 'web', 'pnpm', '--filter', 'db', 'migrate'],
      { timeoutMs: 10 * 60 * 1000 })
    if (!m.ok) abortar('deploy', `migrations falharam: ${m.erro || m.saida}`)

    // Código 0 não prova que aplicou — foi exatamente assim que a falha de
    // 27/08 passou batido. Confere no ledger que ele cresceu o tanto esperado.
    // Aqui produção ainda está na imagem antiga: abortar deixa o site intacto,
    // e `aplicadas` continua false, então o rollback segue permitido.
    const depois = await consultarBanco('select count(*) from drizzle.__drizzle_migrations')
    if (!depois.ok) abortar('deploy', `não consegui conferir o ledger de migrations: ${depois.erro}`)
    const esperado = relatorio.migrations.contagemAntes + relatorio.migrations.pendentes.length
    if (Number(depois.valor) !== esperado) {
      abortar('deploy', `migrations não aplicaram: o ledger registra ${depois.valor}, esperava ${esperado} `
        + `(${relatorio.migrations.pendentes.join(', ')}) — produção intacta na imagem anterior`)
    }
    relatorio.migrations.aplicadas = true
    log(`  migrations aplicadas: ${relatorio.migrations.pendentes.join(', ')}`)
  }

  // --no-deps é obrigatório: sem ele o Compose reavalia postgres e redis e
  // pode recriar o banco de produção junto.
  const w = await docker([...alvo.compose, 'up', '-d', '--no-deps', 'worker'], { timeoutMs: 5 * 60 * 1000 })
  if (!w.ok) abortar('deploy', `worker não subiu: ${w.erro}`)
  log('  worker recriado')

  const inicio = Date.now()
  const web = await docker([...alvo.compose, 'up', '-d', '--no-deps', 'web'], { timeoutMs: 5 * 60 * 1000 })
  if (!web.ok) abortar('deploy', `web não subiu: ${web.erro}`)

  // Polling direto, não `docker inspect`: o healthcheck do compose tem
  // interval de 30s sem start_interval, então a primeira sonda só roda 30s
  // depois do start — 90s+ para declarar falha.
  const saudavel = await buscarComRepeticao(`${alvo.urlWeb}/api/health`, { tentativas: 60, esperaMs: 1000, timeoutMs: 3000 })
  relatorio.deploy.downtimeSegundos = Math.round((Date.now() - inicio) / 1000)
  if (!saudavel.ok) return { falhou: 'o web não ficou saudável em 60s' }

  log(`  web recriado e saudável (${relatorio.deploy.downtimeSegundos}s)`)
  return {}
}

// De onde vem a imagem que vai para o ar: do ensaio da madrugada, ou de um build
// feito agora.
async function obterImagem() {
  const selo = alvo.aproveitaSeloDoEnsaio ? lerSelo(CAMINHO_SELO_ENSAIO, hashDaArvore) : null
  relatorio.ensaio.selo = selo

  if (selo && !selo.desatualizado && selo.imagens) {
    let promovidas = 0
    for (const [servico, imagem] of servicos()) {
      const candidata = selo.imagens[servico]
      const t = candidata ? await docker(['tag', candidata, `${imagem}:latest`]) : { ok: false }
      if (t.ok) promovidas++
    }

    if (promovidas === servicos().length) {
      relatorio.deploy.origemDaImagem = 'ensaio'
      relatorio.ensaio.aproveitado = true
      log(`  imagem promovida do ensaio de ${selo.quando} (sem rebuildar)`)
      return
    }
    // A imagem candidata sumiu (um `image prune` agressivo, por exemplo). Não é
    // motivo para adiar o deploy: builda, que é o que se fazia antes de existir
    // ensaio.
    log('  a imagem do ensaio não está mais no disco — buildando do zero')
  } else if (selo?.desatualizado) {
    log('  o selo do ensaio é de outra árvore — buildando do zero')
  }

  // O passo demorado, com o site velho no ar. Build quebrado morre aqui.
  const build = await docker([...alvo.compose, 'build', 'web', 'worker'], { timeoutMs: 30 * 60 * 1000 })
  if (!build.ok) {
    abortar('deploy', `build falhou — produção intacta:\n${(build.erro || build.saida).slice(-2000)}`)
  }
  relatorio.deploy.origemDaImagem = 'build'
  log('  build concluído (produção ainda no ar)')
}

// ---------------------------------------------------------------- fase 5
async function smoke() {
  relatorio.fase = 'smoke'
  log('— smoke tests')

  const testes = []

  const raso = await buscarComRepeticao(`${alvo.urlWeb}/api/health`, { tentativas: 3 })
  testes.push({ nome: 'health raso', ok: raso.ok && raso.corpo.includes('"ok"') })

  // O que realmente importa: monta SQL a partir do schema do Drizzle, então
  // pega o caso "código novo contra schema velho" — que o health raso aprova.
  const profundo = await buscarComRepeticao(`${alvo.urlWeb}/api/health?profundo=1`, { tentativas: 3 })
  testes.push({ nome: 'health profundo (lê tabelas reais)', ok: profundo.ok && profundo.corpo.includes('"ok"') })

  // Pelo túnel: valida também o cloudflared. Com repetição longa porque
  // durante a recriação ele registra `no such host` e `connection refused`
  // transitórios, que não são motivo de rollback. A stack de ensaio não tem
  // túnel, e testar uma URL que não existe naquele alvo só produziria ruído.
  if (alvo.urlPublica) {
    const publico = await buscarComRepeticao(alvo.urlPublica, { tentativas: 15, esperaMs: 3000, timeoutMs: 15000 })
    testes.push({ nome: 'site público pelo túnel', ok: publico.ok && /Lidimus/i.test(publico.corpo) })
  }

  for (const servico of ['web', 'worker']) {
    const saude = await esperarSaude(servico)
    testes.push({ nome: `container ${servico} saudável`, ok: saude.ok, detalhe: saude.detalhe })
  }

  relatorio.smoke = testes
  for (const t of testes) log(`  ${t.ok ? '✓' : '✗'} ${t.nome}${t.detalhe ? ` (${t.detalhe})` : ''}`)

  return testes.every((t) => t.ok)
}

// ---------------------------------------------------------------- fase 6
async function reverter() {
  relatorio.fase = 'rollback'

  if (!relatorio.deploy.imagensBackup.length) {
    encerrar('intervencao-manual',
      'o smoke falhou e não existe imagem anterior marcada para voltar — a stack precisa de socorro à mão')
  }

  // Até 27/08/2026, encontrar `migrations.aplicadas` aqui encerrava em
  // intervenção manual: retagear colocaria código velho contra schema novo.
  //
  // A política mudou porque o raciocínio estava incompleto. Tudo que a
  // automação aplica sozinha passou pelo gate SQL_DESTRUTIVO na fase 3 — nada
  // de DROP, DELETE, TRUNCATE, SET DATA TYPE ou SET NOT NULL. O que sobra é
  // aditivo, e código velho roda contra schema aditivamente à frente sem
  // enxergar a diferença: colunas e tabelas novas simplesmente não são
  // referenciadas.
  //
  // O custo da política antiga foi medido: em 27/08/2026 ela transformou uma
  // falha de smoke de 2 minutos em nove horas de site fora do ar, das 5h às
  // 14h, esperando alguém acordar e ler o WhatsApp. Voltar a imagem custa
  // segundos. O dump continua sendo feito antes de tudo, e o relatório diz
  // explicitamente que o schema ficou à frente do código.
  const schemaAFrente = relatorio.migrations.aplicadas

  log(schemaAFrente
    ? `\n— rollback (o schema fica à frente do código: ${relatorio.migrations.pendentes.join(', ')} são aditivas e o código anterior as ignora)`
    : '\n— rollback')

  for (const backup of relatorio.deploy.imagensBackup) {
    const imagem = backup.slice(0, backup.lastIndexOf(':'))
    await docker(['tag', backup, `${imagem}:latest`])
  }
  const r = await docker([...alvo.compose, 'up', '-d', '--no-deps', '--force-recreate', 'web', 'worker'],
    { timeoutMs: 5 * 60 * 1000 })
  const voltou = await buscarComRepeticao(`${alvo.urlWeb}/api/health`, { tentativas: 60, esperaMs: 1000, timeoutMs: 3000 })

  // A aprovação morre aqui, mesmo tendo voltado: sem isso o run de amanhã acha o
  // mesmo marcador, promove o mesmo código quebrado e reverte de novo, todo dia,
  // até alguém perceber. Quem corrigir precisa reaprovar.
  consumirMarcador('rejeitado')

  log(voltou.ok ? '  produção restaurada na versão anterior' : '  ATENÇÃO: rollback não restaurou a saúde')

  if (!voltou.ok) {
    encerrar('intervencao-manual',
      `o smoke falhou e o rollback também (${r.erro || 'health não voltou'}) — produção precisa de socorro. `
      + `Dump em ${relatorio.deploy.dump}`)
  }

  encerrar('rollback', schemaAFrente
    ? `smoke falhou; produção restaurada na imagem anterior. O schema ficou à frente (${relatorio.migrations.pendentes.join(', ')}, aditivas) — nada a desfazer no banco. Aprove de novo depois de corrigir`
    : 'smoke falhou; produção restaurada na imagem anterior. Aprove de novo depois de corrigir')
}

// ---------------------------------------------------------------- fase 7
async function publicarNoGithub() {
  relatorio.fase = 'github'
  log('— GitHub')

  if (ehDryRun) {
    log('  (dry-run: commit e push pulados)')
    return
  }

  const sujo = await git(['status', '--porcelain'])

  // No ensaio a fase vira conferência: roda a mesma peneira sobre os mesmos
  // caminhos e não escreve nada. É o que teria pego, na madrugada de 22/08, o
  // `.env.example` que abortou a fase do GitHub três dias seguidos com a
  // produção já no ar.
  if (!alvo.publicaNoGithub) {
    const caminhos = sujo.saida.split(/\r?\n/).filter(Boolean)
      .map((linha) => linha.slice(3).trim().replace(/^"|"$/g, ''))
    const proibidos = caminhos.filter((f) => NUNCA_COMMITAR.test(f) && !PODE_COMMITAR.test(f))
    relatorio.github.conferido = true
    relatorio.github.proibidos = proibidos
    if (proibidos.length) {
      log(`  ⚠ ${proibidos.length} arquivo(s) seriam barrados no commit: ${proibidos.join(', ')}`)
    } else {
      log('  nada seria barrado no commit')
    }
    return
  }

  if (!sujo.saida.trim() && !relatorio.codigo.commitsAFrente) {
    log('  nada a publicar')
    return
  }

  if (sujo.saida.trim()) {
    await git(['add', '-A'])

    // A árvore já foi aprovada e conferida por hash, então o -A é seguro para
    // o CÓDIGO. O que não pode passar de jeito nenhum é o dump do banco ou uma
    // chave — daí a segunda peneira.
    const staged = await git(['diff', '--cached', '--name-only'])
    const proibidos = staged.saida.split(/\r?\n/)
      .filter((f) => f && NUNCA_COMMITAR.test(f) && !PODE_COMMITAR.test(f))
    if (proibidos.length) {
      await git(['reset'])
      // A produção JÁ está no ar com este código e o marcador já foi consumido:
      // o deploy aconteceu, só a publicação não. Registrar a pendência é o que
      // impede o abort de se repetir todo dia sem ninguém notar.
      registrarPublicacaoPendente('commit',
        `arquivos barrados pela peneira: ${proibidos.join(', ')}`)
      abortar('github', `arquivos que nunca podem ser commitados entraram no stage: ${proibidos.join(', ')}`
        + ' — a produção está no ar com este código, mas ele não foi publicado')
    }

    const mensagem = `feat(deploy): promove sandbox validado em ${new Date().toLocaleDateString('pt-BR')}

${relatorio.aprovacao.descricao}

Aprovado em ${relatorio.aprovacao.aprovadoEm} por ${relatorio.aprovacao.aprovadoPor}.
Deploy automatico pelo Lidimus Update.`

    // Mensagem por stdin. Era `-m JSON.stringify(mensagem)` sob `shell: true`, e
    // as quebras de linha viravam `\n` literal dentro do commit — o `17cc0fe`
    // no histórico é assim: título, corpo e trilha de auditoria num parágrafo só.
    const c = await git(['commit', '-F', '-'], { entrada: mensagem })
    if (!c.ok) abortar('github', `commit falhou: ${c.erro || c.saida}`)
    const sha = await git(['rev-parse', 'HEAD'])
    relatorio.github.commit = sha.saida.slice(0, 7)
    log(`  commit ${relatorio.github.commit}`)
  }

  const p = await git(['push', 'origin', 'main'], { timeoutMs: 5 * 60 * 1000 })
  if (!p.ok) {
    // Não é abort: a produção está no ar, saudável, com o código novo. O deploy
    // deu certo — o que falhou foi a publicação, e o run de amanhã retenta.
    registrarPublicacaoPendente('push', String(p.erro || p.saida).slice(-400))
    log('  ⚠ push falhou; a produção está no ar e a publicação ficou pendente')
    return
  }
  relatorio.github.empurrado = true
  if (existsSync(CAMINHO_PUBLICACAO_PENDENTE)) unlinkSync(CAMINHO_PUBLICACAO_PENDENTE)
  log('  push concluído')
}

// Selo do ensaio: a resposta binária que o run das 5h consome.
async function gravarSeloAprovado() {
  if (!alvo.gravaSelo || ehDryRun) return

  const imagens = {}
  const versao = hashDaArvore.slice(0, 12)
  for (const [servico, imagem] of servicos()) {
    // Tag imutável, não `:latest`: um ensaio posterior sobrescreveria o latest e
    // a produção promoveria uma imagem que não é a que o selo descreve.
    const destino = `${imagem}:${versao}`
    const t = await docker(['tag', `${imagem}:latest`, destino])
    if (!t.ok) {
      relatorio.erros.push(`não consegui marcar a imagem validada ${destino}: ${t.erro}`)
      return
    }
    imagens[servico] = destino
  }

  mkdirSync(dirname(CAMINHO_SELO_ENSAIO), { recursive: true })
  writeFileSync(CAMINHO_SELO_ENSAIO, JSON.stringify({
    hashArvore: hashDaArvore,
    commit: relatorio.aprovacao?.commit || null,
    imagens,
    migrations: relatorio.migrations.pendentes,
    geral: ehGeral,
    quando: new Date().toISOString(),
  }, null, 2) + '\n', 'utf8')
  if (existsSync(CAMINHO_SELO_REPROVADO)) unlinkSync(CAMINHO_SELO_REPROVADO)

  relatorio.ensaio.selo = { imagens, hashArvore: hashDaArvore }
  log(`  selo de ensaio gravado: ${Object.values(imagens).join(', ')}`)
}

// ---------------------------------------------------------------- fase 8
async function limpar() {
  relatorio.fase = 'limpeza'
  if (!ehDryRun && alvo.limpaDisco) {
    await docker(['image', 'prune', '-f'], { timeoutMs: 5 * 60 * 1000 })
    await docker(['builder', 'prune', '--keep-storage=10GB', '-f'], { timeoutMs: 10 * 60 * 1000 })
    await expurgarImagens()
  }
  if (!ehDryRun) expurgarBackups()
  const livre = await espacoLivreGb()
  relatorio.disco.livreGbDepois = livre === null ? null : Number(livre.toFixed(1))
  log(`— limpeza: ${livre?.toFixed(1)} GB livres`)
}

// Os dumps ficam no mesmo disco cujo piso de 20 GB existe para proteger o WAL do
// Postgres. Oito deles já somavam 68 MB e ninguém apagava nenhum.
const DUMPS_A_MANTER = 7

// Imagens marcadas por deploy: o ponto de rollback (`antes-<carimbo>`) e a
// candidata que o ensaio validou (`lidimus-candidato-web:<hash>`). São ~1 GB
// cada e nascem uma por noite — sem expurgo, é o gate de disco do preflight que
// acaba disparando, semanas depois, sem ninguém entender por quê.
const TAGS_A_MANTER = 3

async function expurgarImagens() {
  const r = await docker(['images', '--format', '{{.Repository}}:{{.Tag}}'])
  if (!r.ok) return

  // `docker images` já lista da mais nova para a mais velha.
  const porRepositorio = new Map()
  for (const imagem of r.saida.split(/\r?\n/).filter(Boolean)) {
    if (!/^lidimus-(candidato|saas)-(web|worker):/.test(imagem)) continue
    if (imagem.endsWith(':latest')) continue
    const repositorio = imagem.slice(0, imagem.lastIndexOf(':'))
    porRepositorio.set(repositorio, [...(porRepositorio.get(repositorio) || []), imagem])
  }

  const aApagar = [...porRepositorio.values()].flatMap((lista) => lista.slice(TAGS_A_MANTER))
  if (!aApagar.length) return

  // Sem -f de propósito: uma imagem em uso por container não é removida, e é
  // exatamente isso que se quer — o `:latest` de produção aponta para uma delas.
  const rm = await docker(['rmi', ...aApagar], { timeoutMs: 5 * 60 * 1000 })
  log(`  ${aApagar.length} tag(s) de imagem antiga(s) removida(s)${rm.ok ? '' : ' (parcialmente)'}`)
}

function expurgarBackups() {
  try {
    if (!existsSync(alvo.dirBackups)) return
    const dumps = readdirSync(alvo.dirBackups)
      .filter((n) => /^pre-deploy-.*\.sql$/.test(n))
      .sort()
      .reverse()
    for (const velho of dumps.slice(DUMPS_A_MANTER)) {
      unlinkSync(resolve(alvo.dirBackups, velho))
    }
    if (dumps.length > DUMPS_A_MANTER) {
      log(`  ${dumps.length - DUMPS_A_MANTER} dump(s) antigo(s) apagado(s), mantidos os ${DUMPS_A_MANTER} mais recentes`)
    }
  } catch (e) {
    relatorio.erros.push(`não consegui expurgar backups antigos: ${e.message}`)
  }
}

// ---------------------------------------------------------------- roteiro
try {
  log(`Lidimus Update — alvo ${alvo.nome}${ehGeral ? ' (ensaio geral)' : ''}${ehDryRun ? ' (dry-run)' : ''}\n`)

  await preflight()
  await levantarMudancas()
  await conferirN8n()
  await conferirMigrations()

  const problemaNoDeploy = await implantar()

  if (!ehDryRun) {
    if (problemaNoDeploy?.falhou) {
      relatorio.erros.push(problemaNoDeploy.falhou)
      await reverter()
    }
    if (!(await smoke())) await reverter()

    // A partir daqui o deploy ACONTECEU: o código novo está no ar e saudável.
    //
    // O marcador é consumido agora, e não no fim do roteiro, porque tudo que
    // vem depois é publicação — e falha de publicação não desfaz um deploy. Com
    // o consumo no fim, os aborts da fase do GitHub de 22, 23 e 24/08/2026
    // deixaram o marcador vivo com a produção já atualizada; nos dias seguintes
    // a árvore não batia mais com ele e o preflight abortou, todo dia, até
    // alguém ir olhar.
    consumirMarcador('aplicado')
  }

  await publicarNoGithub()
  await gravarSeloAprovado()
  await limpar()

  const pendente = relatorio.github.pendencia && !relatorio.github.empurrado
  encerrar(pendente ? 'sucesso-sem-push' : 'sucesso',
    pendente ? `deploy no ar, mas a publicação ficou pendente: ${relatorio.github.pendencia.motivo}` : null)
} catch (e) {
  relatorio.erros.push(String(e?.stack || e))
  abortar(relatorio.fase || 'desconhecida', String(e?.message || e))
}
