// Os cenários da matriz de ensaio.
//
// A regra para entrar nesta lista: ou o cenário reproduz uma falha que já
// aconteceu de verdade (a data está no comentário), ou fecha um caminho pelo
// qual o pipeline poderia quebrar a produção sem ninguém perceber. Cenário sem
// uma dessas duas justificativas é manutenção sem contrapartida.
//
// Cada um recebe um `ctx` com: sql, git, docker, saude, escrever, botoes,
// aprovar, migracao — mais `copia` e `marco`. Ver scripts/ensaio.mjs.

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const marcador = (ctx, sufixo = '') =>
  resolve(ctx.copia, `.lidimus/sandbox-aprovado.json${sufixo}`)

const MIGRACAO_ADITIVA = 'alter table plans add column if not exists ensaio_marca text;\n'

async function versaoNoAr(ctx) {
  const s = await ctx.saude()
  return s.corpo?.versao || `sem resposta (${s.status})`
}

async function conferirVersao(ctx, esperada) {
  const versao = await versaoNoAr(ctx)
  return versao === esperada ? [] : [`a stack devia estar em "${esperada}" e está em "${versao}"`]
}

export const CENARIOS = [
  // ------------------------------------------------------------ caminho feliz
  {
    nome: 'feliz-sem-migration',
    descricao: 'árvore aprovada sem migration: sobe, passa no smoke, commita e empurra',
    async preparar(ctx) {
      ctx.escrever('lidimus-saas/apps/web/ENSAIO.md', 'mudanca do cenario feliz\n')
      await ctx.aprovar('cenario feliz sem migration')
    },
    espera: { resultado: 'sucesso' },
    async conferir(ctx, r) {
      const problemas = await conferirVersao(ctx, 'candidata')

      if (!r.github.empurrado) problemas.push('o relatório não marcou o push como concluído')
      if (existsSync(marcador(ctx))) problemas.push('o marcador de aprovação não foi consumido')
      if (!existsSync(marcador(ctx, '.aplicado'))) problemas.push('o marcador consumido não foi arquivado como .aplicado')

      const local = await ctx.git(['rev-parse', 'HEAD'])
      const remoto = await ctx.git(['ls-remote', 'origin', 'main'])
      if (!remoto.saida.startsWith(local.saida.trim().slice(0, 40))) {
        problemas.push('o commit não chegou ao repositório remoto')
      }

      // A mensagem de commit precisa ter quebras de linha DE VERDADE. Até
      // 27/08/2026 ela era passada por `-m JSON.stringify(...)` sob shell, e os
      // \n viravam texto literal — o commit 17cc0fe no histórico é assim.
      const objeto = await ctx.git(['cat-file', 'commit', 'HEAD'])
      if (objeto.saida.includes('\\n')) problemas.push('a mensagem de commit tem \\n literal em vez de quebra de linha')
      if (!objeto.saida.includes('cenario feliz sem migration')) {
        problemas.push('a mensagem de commit não traz a descrição da aprovação')
      }

      return problemas
    },
  },

  {
    nome: 'feliz-com-migration',
    descricao: 'migration aditiva pendente: aplica, confere no ledger e sobe',
    async preparar(ctx) {
      await ctx.migracao({ sql: MIGRACAO_ADITIVA })
      await ctx.aprovar('cenario feliz com migration aditiva')
    },
    espera: { resultado: 'sucesso' },
    async conferir(ctx, r) {
      const problemas = await conferirVersao(ctx, 'candidata')

      if (!r.migrations.aplicadas) problemas.push('o relatório não marcou as migrations como aplicadas')

      const contagem = Number(await ctx.sql('select count(*) from drizzle.__drizzle_migrations;'))
      if (contagem !== r.migrations.contagemAntes + 1) {
        problemas.push(`o ledger devia ter ${r.migrations.contagemAntes + 1} linhas e tem ${contagem}`)
      }

      const coluna = await ctx.sql(
        "select count(*) from information_schema.columns where table_name='plans' and column_name='ensaio_marca';")
      if (coluna !== '1') problemas.push('a coluna da migration não existe no banco')

      return problemas
    },
  },

  // ---------------------------------------------------------------- preflight
  {
    nome: 'sem-marcador',
    descricao: 'nada aprovado: não faz nada, mas devolve o convite com link',
    async preparar(ctx) {
      // Sem mudança na árvore não há o que aprovar, e o convite fica (com razão)
      // calado. O cenário é "há trabalho parado esperando aprovação".
      ctx.escrever('lidimus-saas/apps/web/ENSAIO.md', 'trabalho aguardando aprovacao\n')
    },
    espera: { resultado: 'nada-a-fazer' },
    conferir(ctx, r) {
      const problemas = []
      if (!r.pendencia) problemas.push('não montou a pendência — o aviso sairia mudo, sem o que aprovar')
      if (!r.pendencia?.url?.includes('?t=')) problemas.push('a pendência veio sem link de aprovação assinado')
      if (!r.pendencia?.validoAteTexto) problemas.push('o link não diz até quando vale')
      return problemas
    },
  },

  {
    // Falhas reais de 25 e 26/08/2026.
    nome: 'arvore-mudou',
    descricao: 'código editado depois da aprovação: adia e nomeia os arquivos',
    async preparar(ctx) {
      ctx.escrever('lidimus-saas/apps/web/ENSAIO.md', 'estado aprovado\n')
      await ctx.aprovar('cenario arvore mudou')
      ctx.escrever('lidimus-saas/apps/web/ENSAIO.md', 'estado DIFERENTE do aprovado\n')
    },
    espera: { resultado: 'abortado', fase: 'preflight', erro: /árvore mudou depois da aprovação/ },
    async conferir(ctx, r) {
      const problemas = await conferirVersao(ctx, 'anterior')
      const texto = [r.motivo, ...r.erros].join('\n')
      if (!texto.includes('ENSAIO.md')) problemas.push('o relatório não nomeia o arquivo que mudou')
      return problemas
    },
  },

  {
    nome: 'fila-ocupada',
    descricao: 'job em processamento: adia para não derrubar callback do n8n em voo',
    async preparar(ctx) {
      await ctx.aprovar('cenario fila ocupada')
      await ctx.sql("insert into jobs (org_id, user_id, type, status) select org_id, user_id, type, 'processing' from jobs limit 1;")
    },
    espera: { resultado: 'abortado', fase: 'preflight', erro: /em processamento/ },
    conferir: (ctx) => conferirVersao(ctx, 'anterior'),
  },

  {
    nome: 'disco-baixo',
    descricao: 'sem espaço: para antes de o build inchar o disco virtual do Docker',
    env: { LIDIMUS_ENSAIO_ESPACO_MINIMO_GB: '999999' },
    espera: { resultado: 'abortado', fase: 'preflight', erro: /disco com .* GB livres/ },
    conferir: (ctx) => conferirVersao(ctx, 'anterior'),
  },

  {
    nome: 'push-negado',
    descricao: 'credencial do GitHub inválida: descobre ANTES de buildar',
    async preparar(ctx) {
      await ctx.aprovar('cenario push negado');
      await ctx.git(['remote', 'set-url', 'origin', `"${resolve(ctx.origem, '..', 'nao-existe.git')}"`])
    },
    espera: { resultado: 'abortado', fase: 'preflight', erro: /push não está autorizado/ },
    async conferir(ctx, r) {
      const problemas = await conferirVersao(ctx, 'anterior')
      // O ponto do cenário: o gate está no preflight justamente para não gastar
      // 30 min de build e só então descobrir que não dá para publicar.
      if (r.deploy.origemDaImagem) problemas.push('chegou a obter imagem — o gate do push devia ter parado antes')
      if (r.deploy.imagensBackup.length) problemas.push('chegou a marcar imagens de rollback antes de abortar')
      return problemas
    },
  },

  {
    nome: 'sandbox-fora',
    descricao: 'sandbox no chão: não promove o que ninguém pôde validar',
    env: { LIDIMUS_ENSAIO_URL_SANDBOX: 'http://127.0.0.1:59997' },
    async preparar(ctx) {
      await ctx.aprovar('cenario sandbox fora')
    },
    espera: { resultado: 'abortado', fase: 'preflight', erro: /sandbox não respondeu/ },
    async conferir(ctx) {
      const problemas = await conferirVersao(ctx, 'anterior')
      // Falha de preflight é ambiental, não do código: o run das 5h reavalia
      // este mesmo gate com o ambiente daquele momento. Gravar reprovação aqui
      // criaria um portão emperrado — sandbox volta, tudo certo, e o deploy
      // continua bloqueado por um selo da madrugada.
      if (existsSync(resolve(ctx.copia, '.lidimus/ensaio-reprovado.json'))) {
        problemas.push('gravou selo de ensaio reprovado por falha ambiental — isso travaria o deploy das 5h mesmo depois de o sandbox voltar')
      }
      return problemas
    },
  },

  // --------------------------------------------------------------- migrations
  {
    // A 0015_papeis_equipe faz DELETE FROM organizations e dropa uma coluna.
    nome: 'migration-destrutiva',
    descricao: 'SQL destrutivo pendente: recusa rodar sozinho de madrugada',
    async preparar(ctx) {
      await ctx.migracao({ tag: '9999_ensaio', sql: 'drop table if exists ensaio_lixo;\n' })
      await ctx.aprovar('cenario migration destrutiva')
    },
    espera: { resultado: 'abortado', fase: 'migrations', erro: /SQL destrutivo/ },
    async conferir(ctx, r) {
      const problemas = await conferirVersao(ctx, 'anterior')
      if (!r.migrations.bloqueadas) problemas.push('o relatório não marcou a migration como bloqueada')
      return problemas
    },
  },

  {
    nome: 'migration-sem-arquivo',
    descricao: 'journal cita uma migration que não está no disco',
    async preparar(ctx) {
      await ctx.migracao({ tag: '9999_fantasma', sql: null })
      await ctx.aprovar('cenario migration sem arquivo')
    },
    espera: { resultado: 'abortado', fase: 'migrations', erro: /não no disco/ },
    conferir: (ctx) => conferirVersao(ctx, 'anterior'),
  },

  {
    // O migrator ordena por `when`, e este journal tem `when` escritos à mão:
    // uma entrada com `when` menor que o marco seria pulada em silêncio.
    nome: 'migration-pulada',
    descricao: 'journal e ledger discordam na contagem: para e chama gente',
    async preparar(ctx) {
      await ctx.migracao({ tag: '9999_atrasada', sql: MIGRACAO_ADITIVA, when: ctx.marco - 1000 })
      await ctx.aprovar('cenario migration pulada')
    },
    espera: { resultado: 'abortado', fase: 'migrations', erro: /alguma foi pulada/ },
    conferir: (ctx) => conferirVersao(ctx, 'anterior'),
  },

  {
    // A FALHA DE 27/08/2026, em forma de teste.
    //
    // O migrator rodava com `compose exec` no container que ainda estava no ar —
    // imagem antiga, journal antigo — concluía "nada pendente" e saía com código
    // 0. O pipeline marcava `aplicadas: true` a partir da lista calculada no
    // host, subia o código novo contra o schema velho, e como `aplicadas`
    // estava (falsamente) true o rollback ficou proibido. Nove horas fora do ar.
    nome: 'migration-nao-aplicou',
    descricao: 'migrator sai com código 0 sem aplicar nada: o ledger denuncia',
    async preparar(ctx) {
      await ctx.migracao({ sql: MIGRACAO_ADITIVA })
      ctx.botoes({ ENSAIO_MIGRACAO: 'ignora' })
      await ctx.aprovar('cenario migration nao aplicou')
    },
    espera: { resultado: 'abortado', fase: 'deploy', erro: /migrations não aplicaram/ },
    async conferir(ctx, r) {
      // Produção intacta é o requisito: a conferência do ledger acontece ANTES
      // do `up -d web`, de propósito.
      const problemas = await conferirVersao(ctx, 'anterior')
      if (r.migrations.aplicadas) {
        problemas.push('o relatório afirma que aplicou migrations que não foram aplicadas — foi essa mentira que custou 9h de produção')
      }
      return problemas
    },
  },

  // ------------------------------------------------------------------- deploy
  {
    nome: 'build-quebrado',
    descricao: 'build falha: morre antes de encostar na produção',
    async preparar(ctx) {
      ctx.escrever('lidimus-saas/ensaio/stub/servidor.mjs', 'isto ( nao e javascript valido\n')
      await ctx.aprovar('cenario build quebrado')
    },
    espera: { resultado: 'abortado', fase: 'deploy', erro: /build falhou/ },
    async conferir(ctx) {
      const problemas = await conferirVersao(ctx, 'anterior')
      // O outro lado da regra do `sandbox-fora`: build quebrado é sobre o
      // CÓDIGO, e o run das 5h precisa saber disso antes de tentar subir.
      if (!existsSync(resolve(ctx.copia, '.lidimus/ensaio-reprovado.json'))) {
        problemas.push('não gravou o selo de reprovação — o deploy das 5h tentaria buildar o mesmo código quebrado')
      }
      return problemas
    },
  },

  // -------------------------------------------------------- smoke e rollback
  {
    nome: 'web-insalubre-sem-migration',
    descricao: 'versão nova não fica de pé: reverte e a produção volta',
    async preparar(ctx) {
      ctx.botoes({ ENSAIO_MODO_WEB: 'insalubre' })
      await ctx.aprovar('cenario web insalubre')
    },
    espera: { resultado: 'rollback' },
    async conferir(ctx, r) {
      const problemas = await conferirVersao(ctx, 'anterior')
      if (!r.deploy.imagensBackup.length) problemas.push('não marcou imagem de rollback antes de subir')
      return problemas
    },
  },

  {
    // A MUDANÇA DE POLÍTICA de 28/08/2026.
    //
    // Antes, migration aplicada + smoke falhando = `intervencao-manual`, com a
    // produção parada até alguém acordar. Mas tudo que a automação aplica passou
    // pelo gate SQL_DESTRUTIVO, logo é aditivo, logo o código anterior roda
    // contra o schema à frente sem enxergar diferença. Reverter custa segundos;
    // esperar custou nove horas.
    nome: 'web-insalubre-com-migration-aditiva',
    descricao: 'smoke falha COM migration aplicada: reverte assim mesmo (aditiva)',
    async preparar(ctx) {
      await ctx.migracao({ sql: MIGRACAO_ADITIVA })
      ctx.botoes({ ENSAIO_MODO_WEB: 'insalubre' })
      await ctx.aprovar('cenario insalubre com migration')
    },
    espera: { resultado: 'rollback', erro: /schema ficou à frente/ },
    async conferir(ctx, r) {
      const problemas = await conferirVersao(ctx, 'anterior')

      if (r.resultado === 'intervencao-manual') {
        problemas.push('caiu em intervenção manual — é exatamente a política antiga que causou as 9h de 27/08')
      }
      if (!r.migrations.aplicadas) problemas.push('o cenário não chegou a aplicar a migration; não testou o que devia')

      // O schema fica à frente de propósito, e nada no banco é desfeito.
      const coluna = await ctx.sql(
        "select count(*) from information_schema.columns where table_name='plans' and column_name='ensaio_marca';")
      if (coluna !== '1') problemas.push('a coluna aditiva sumiu — o rollback não pode mexer no banco')

      return problemas
    },
  },

  {
    // O smoke antigo usava `.State.Running`, que é `true` entre dois reinícios.
    nome: 'worker-crash-loop',
    descricao: 'worker em crash-loop: o smoke reprova e reverte',
    async preparar(ctx) {
      ctx.botoes({ ENSAIO_MODO_WORKER: 'crash' })
      await ctx.aprovar('cenario worker em crash loop')
    },
    espera: { resultado: 'rollback' },
    async conferir(ctx, r) {
      const problemas = await conferirVersao(ctx, 'anterior')
      const teste = r.smoke.find((t) => /worker/.test(t.nome))
      if (!teste) problemas.push('o smoke não tem teste algum do worker')
      else if (teste.ok) problemas.push('o smoke aprovou um worker em crash-loop')
      return problemas
    },
  },

  {
    // O outro lado da falha de 27/08: o health raso devolve 200 com o site
    // quebrado para quem está logado. Só o profundo pega.
    nome: 'codigo-novo-schema-velho',
    descricao: 'health raso passa, profundo estoura: reverte',
    async preparar(ctx) {
      ctx.botoes({ ENSAIO_SELECT_PROFUNDO: 'select coluna_que_nao_existe from plans limit 1' })
      await ctx.aprovar('cenario codigo novo schema velho')
    },
    espera: { resultado: 'rollback' },
    async conferir(ctx, r) {
      const problemas = await conferirVersao(ctx, 'anterior')
      const raso = r.smoke.find((t) => t.nome === 'health raso')
      const profundo = r.smoke.find((t) => /profundo/.test(t.nome))
      if (!raso?.ok) problemas.push('o health raso devia ter passado — é justamente o que o torna insuficiente sozinho')
      if (profundo?.ok) problemas.push('o health profundo aprovou um schema incompatível')
      return problemas
    },
  },

  // ------------------------------------------- selo do ensaio (promoção 5h)
  {
    // O mecanismo que tira ~30 min do caminho crítico das 5h: o ensaio das 3h30
    // já construiu e validou esta imagem, então o deploy só a promove.
    nome: 'promove-imagem-do-ensaio',
    descricao: 'selo válido para esta árvore: promove a imagem em vez de buildar',
    env: { LIDIMUS_ENSAIO_APROVEITA_SELO: '1', LIDIMUS_ENSAIO_GRAVA_SELO: '0' },
    async preparar(ctx) {
      ctx.escrever('lidimus-saas/apps/web/ENSAIO.md', 'promocao de imagem\n')
      await ctx.aprovar('cenario promove imagem do ensaio')
      const imagens = await ctx.imagemSelada('selada')
      ctx.selo('ensaio-ok.json', {
        hashArvore: ctx.hashDaArvore(),
        commit: null,
        imagens,
        migrations: [],
        geral: true,
        quando: new Date().toISOString(),
      })
    },
    espera: { resultado: 'sucesso' },
    async conferir(ctx, r) {
      const problemas = []
      if (r.deploy.origemDaImagem !== 'ensaio') {
        problemas.push(`buildou em vez de promover (origemDaImagem=${r.deploy.origemDaImagem}) — os ~30 min de build voltariam ao caminho crítico das 5h`)
      }
      if (!r.ensaio?.aproveitado) problemas.push('o relatório não registrou que aproveitou o ensaio')
      // A prova: no ar está a imagem SELADA, não a que um build produziria
      // (essa se identificaria como "candidata").
      problemas.push(...await conferirVersao(ctx, 'selada'))
      return problemas
    },
  },

  {
    nome: 'selo-de-outra-arvore',
    descricao: 'selo de ensaio desatualizado: ignora e builda do zero',
    env: { LIDIMUS_ENSAIO_APROVEITA_SELO: '1', LIDIMUS_ENSAIO_GRAVA_SELO: '0' },
    async preparar(ctx) {
      ctx.escrever('lidimus-saas/apps/web/ENSAIO.md', 'selo velho\n')
      await ctx.aprovar('cenario selo de outra arvore')
      const imagens = await ctx.imagemSelada('selada')
      ctx.selo('ensaio-ok.json', {
        // Um selo de anteontem descreve um build de anteontem.
        hashArvore: 'e'.repeat(64),
        commit: null,
        imagens,
        migrations: [],
        quando: new Date(Date.now() - 48 * 3600e3).toISOString(),
      })
    },
    espera: { resultado: 'sucesso' },
    async conferir(ctx, r) {
      const problemas = []
      if (r.deploy.origemDaImagem !== 'build') {
        problemas.push(`promoveu a imagem de um selo que não é desta árvore (origemDaImagem=${r.deploy.origemDaImagem})`)
      }
      problemas.push(...await conferirVersao(ctx, 'candidata'))
      return problemas
    },
  },

  {
    // O portão que faz o ensaio valer alguma coisa: reprovou de madrugada, o
    // deploy das 5h não acontece.
    nome: 'ensaio-reprovou',
    descricao: 'selo de reprovação para esta árvore: o deploy nem começa',
    env: { LIDIMUS_ENSAIO_APROVEITA_SELO: '1', LIDIMUS_ENSAIO_GRAVA_SELO: '0' },
    async preparar(ctx) {
      ctx.escrever('lidimus-saas/apps/web/ENSAIO.md', 'reprovado no ensaio\n')
      await ctx.aprovar('cenario ensaio reprovou')
      ctx.selo('ensaio-reprovado.json', {
        hashArvore: ctx.hashDaArvore(),
        fase: 'deploy',
        motivo: 'build falhou no ensaio das 3h30',
        quando: new Date().toISOString(),
      })
    },
    espera: { resultado: 'abortado', fase: 'preflight', erro: /ensaio reprovou esta mesma árvore/ },
    async conferir(ctx, r) {
      const problemas = await conferirVersao(ctx, 'anterior')
      if (r.deploy.origemDaImagem) problemas.push('chegou a obter imagem — o selo devia ter parado antes de qualquer build')
      if (existsSync(marcador(ctx, '.aplicado'))) problemas.push('consumiu o marcador sem ter feito deploy nenhum')
      return problemas
    },
  },

  // ------------------------------------------------------------------- GitHub
  {
    // Falhas de 22, 23 e 24/08/2026: a peneira NUNCA_COMMITAR derrubou o
    // .env.example (template, sem segredo) três dias seguidos, com a produção já
    // no ar e o push nunca acontecendo.
    nome: 'env-example-no-stage',
    descricao: '.env.example alterado: é template, precisa ser publicado',
    async preparar(ctx) {
      ctx.escrever('lidimus-saas/.env.example', '# alterado pelo cenario de ensaio\nEXEMPLO=1\n')
      await ctx.aprovar('cenario env example')
    },
    espera: { resultado: 'sucesso' },
    async conferir(ctx, r) {
      const problemas = await conferirVersao(ctx, 'candidata')
      if (!r.github.empurrado) problemas.push('não empurrou')
      const arquivos = await ctx.git(['diff', '--name-only', 'HEAD~1', 'HEAD'])
      if (!arquivos.saida.includes('.env.example')) {
        problemas.push('o .env.example não entrou no commit — a peneira barrou um template sem segredo')
      }
      return problemas
    },
  },

  {
    nome: 'chave-no-stage',
    descricao: 'arquivo proibido de verdade: barra o commit sem repetir o abort amanhã',
    async preparar(ctx) {
      ctx.escrever('ensaio-chave-falsa.pem', '-----BEGIN FAKE KEY-----\nnao-e-uma-chave\n')
      await ctx.aprovar('cenario chave no stage')
    },
    espera: { resultado: 'abortado', fase: 'github', erro: /nunca podem ser commitados/ },
    async conferir(ctx, r) {
      // O deploy ACONTECEU: o que falhou foi a publicação.
      const problemas = await conferirVersao(ctx, 'candidata')

      // Esta é a correção do loop de 22 a 26/08: o marcador precisa ser
      // consumido mesmo com a fase do GitHub abortando, senão amanhã o preflight
      // aborta por "a árvore mudou" e assim todo dia.
      if (existsSync(marcador(ctx))) {
        problemas.push('o marcador sobreviveu ao abort — é assim que o pipeline entra no loop diário de abortos')
      }
      if (!existsSync(resolve(ctx.copia, '.lidimus/publicacao-pendente.json'))) {
        problemas.push('não registrou a publicação pendente')
      }
      if (r.github.pendencia?.tipo !== 'commit') {
        problemas.push(`a pendência devia ser do tipo "commit" e veio "${r.github.pendencia?.tipo}"`)
      }
      return problemas
    },
  },
]
