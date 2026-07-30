<script setup lang="ts">
// Documentação pública da API v1, para o cliente e para o TI dele.
//
// layout: false como a landing — quem lê isto pode não ter conta, e o cabeçalho
// do app (Painel, Ferramentas, Sair) não faz sentido para visitante. A rota
// também está liberada em middleware/auth.global.ts.
//
// A página serve a uma pergunta acima das outras: "o que exatamente eu recebo?".
// Por isso a seção do resultado é a maior, e todos os campos documentados aqui
// foram extraídos de análises reais — não de exemplo inventado.
definePageMeta({ layout: false })

const url = useRequestURL()
const BASE = `${url.protocol}//${url.host}`

useHead({
  title: 'API do Lidimus — documentação',
  meta: [
    {
      name: 'description',
      content:
        'Envie matrículas para análise e receba o parecer estruturado em JSON. Autenticação, ' +
        'endpoints, formato do resultado e códigos de erro da API v1 do Lidimus.',
    },
    // Documentação de integração não deve competir com a landing na busca.
    { name: 'robots', content: 'noindex, follow' },
  ],
})

const SECOES = [
  { id: 'como-funciona', rotulo: 'Como funciona' },
  { id: 'comecar', rotulo: 'Antes de começar' },
  { id: 'autenticacao', rotulo: '1. Autenticação' },
  { id: 'enviar', rotulo: '2. Enviar a matrícula' },
  { id: 'acompanhar', rotulo: '3. Acompanhar' },
  { id: 'resultado', rotulo: '4. O resultado' },
  { id: 'listar', rotulo: '5. Listar análises' },
  { id: 'erros', rotulo: '6. Erros' },
  { id: 'limites', rotulo: '7. Limites e custo' },
  { id: 'exemplo', rotulo: '8. Exemplo pronto' },
]

const copiado = ref('')

async function copiar(e: MouseEvent, chave: string) {
  const bloco = (e.currentTarget as HTMLElement).closest('.bloco')
  const texto = bloco?.querySelector('pre')?.textContent ?? ''
  try {
    await navigator.clipboard.writeText(texto)
    copiado.value = chave
    setTimeout(() => (copiado.value = ''), 1600)
  } catch {
    // Navegador sem permissão de área de transferência: o código está na tela e
    // pode ser selecionado à mão.
  }
}
</script>

<template>
  <div class="doc">
    <header class="doc-topo">
      <div class="doc-topo-inner">
        <a href="/" class="doc-marca">
          <img src="/logo.svg" alt="Lidimus" class="doc-logo" />
        </a>
        <div class="doc-topo-dir">
          <span class="doc-versao">API v1</span>
          <a href="/conta/api" class="doc-topo-link">Minhas chaves</a>
        </div>
      </div>
    </header>

    <div class="doc-corpo">
      <nav class="doc-indice" aria-label="Sumário">
        <p class="doc-indice-titulo">Nesta página</p>
        <ul>
          <li v-for="s in SECOES" :key="s.id">
            <a :href="`#${s.id}`">{{ s.rotulo }}</a>
          </li>
        </ul>
      </nav>

      <main class="doc-conteudo">
        <h1>API do Lidimus</h1>
        <p class="doc-lide">
          Envie uma matrícula em PDF e receba de volta o parecer completo em JSON: proprietários,
          ônus, histórico de atos, riscos classificados e fundamentação legal — a mesma análise que
          o painel mostra, em formato que o seu sistema consegue ler.
        </p>

        <!-- ── Como funciona ───────────────────────────────────────────── -->
        <section id="como-funciona">
          <h2>Como funciona</h2>
          <p>
            A análise de uma matrícula leva alguns minutos: o documento passa por leitura óptica,
            análise jurídica e montagem do parecer. Por isso a API é <strong>assíncrona</strong> —
            ela não segura a sua conexão esperando ficar pronto.
          </p>

          <div class="fluxo">
            <div class="fluxo-passo">
              <span class="fluxo-num">1</span>
              <p><strong>Você envia o PDF.</strong> A resposta volta na hora com um identificador.</p>
            </div>
            <div class="fluxo-passo">
              <span class="fluxo-num">2</span>
              <p><strong>Nós processamos.</strong> Leitura, análise jurídica e parecer.</p>
            </div>
            <div class="fluxo-passo">
              <span class="fluxo-num">3</span>
              <p>
                <strong>Você consulta o identificador</strong> de tempos em tempos até o estado
                virar <code>done</code>.
              </p>
            </div>
            <div class="fluxo-passo">
              <span class="fluxo-num">4</span>
              <p><strong>O resultado vem nessa consulta</strong>, no campo <code>resultado</code>.</p>
            </div>
          </div>

          <div class="nota">
            <p>
              <strong>Não enviamos aviso quando fica pronto.</strong> Quem pergunta é o seu sistema —
              é você que consulta. Um webhook de saída (nós avisarmos o seu servidor) ainda não
              existe; se isso for importante para a sua integração, fale com o suporte.
            </p>
          </div>
        </section>

        <!-- ── Antes de começar ────────────────────────────────────────── -->
        <section id="comecar">
          <h2>Antes de começar</h2>
          <ul class="lista">
            <li>
              A API faz parte dos planos <strong>Escritório</strong> e <strong>Enterprise</strong>.
            </li>
            <li>
              A chave é emitida pelo <strong>proprietário da conta</strong>, em
              <a href="/conta/api">Conta → API</a>. Ela aparece uma única vez.
            </li>
            <li>
              A chave é <strong>da empresa</strong>, não de uma pessoa: pode ser compartilhada com a
              sua equipe ou com quem faz a integração.
            </li>
          </ul>

          <div class="aviso">
            <p>
              <strong>Cada análise enviada pela API debita créditos do seu plano</strong>, igual às
              feitas no painel. Quem tiver a chave em mãos consome esse saldo em nome da sua empresa
              — compartilhe apenas com quem você autoriza a isso.
            </p>
          </div>
        </section>

        <!-- ── Autenticação ────────────────────────────────────────────── -->
        <section id="autenticacao">
          <h2>1. Autenticação</h2>
          <p>Todas as chamadas levam a chave no cabeçalho <code>Authorization</code>:</p>

          <div class="bloco">
            <button type="button" class="copiar" @click="copiar($event, 'auth')">
              {{ copiado === 'auth' ? 'Copiado' : 'Copiar' }}
            </button>
            <pre v-pre><code>Authorization: Bearer ldm_live_sua_chave_aqui</code></pre>
          </div>

          <p>
            Só <strong>HTTPS</strong>. Uma chamada em <code>http://</code> é recusada — e, se isso
            acontecer, considere a chave exposta e emita outra.
          </p>
          <p>
            A chave vale <strong>um ano</strong> e pode ser revogada a qualquer momento em Conta →
            API; a revogação vale já na chamada seguinte. Se o plano da sua empresa deixar de
            incluir a API, as chaves param de funcionar mesmo dentro do prazo.
          </p>
          <p class="dica">
            Guarde a chave no cofre de senhas ou numa variável de ambiente. Nunca no código-fonte:
            o prefixo <code>ldm_live_</code> é reconhecido pelos detectores de segredo do GitHub e
            do GitLab, e um commit com a chave será bloqueado ou sinalizado.
          </p>
        </section>

        <!-- ── Enviar ──────────────────────────────────────────────────── -->
        <section id="enviar">
          <h2>2. Enviar a matrícula</h2>
          <p class="rota-titulo"><span class="verbo verbo--post">POST</span> /api/v1/matriculas</p>
          <p>
            Envio em <code>multipart/form-data</code> — o mesmo formato de um formulário com anexo,
            que qualquer linguagem monta sem biblioteca extra.
          </p>

          <table class="tabela">
            <thead>
              <tr><th>Campo</th><th>Obrigatório</th><th>Descrição</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><code>file</code></td>
                <td>sim</td>
                <td>O PDF da matrícula. Até 50 MB.</td>
              </tr>
              <tr>
                <td><code>params</code></td>
                <td>não</td>
                <td>
                  JSON com opções: <code>incluirMemorial</code> (padrão <code>true</code>),
                  <code>incluirCroqui</code> (<code>false</code>) e <code>geocodificar</code>
                  (<code>true</code>).
                </td>
              </tr>
            </tbody>
          </table>

          <div class="bloco">
            <button type="button" class="copiar" @click="copiar($event, 'post')">
              {{ copiado === 'post' ? 'Copiado' : 'Copiar' }}
            </button>
            <!-- sem v-pre: este bloco interpola a URL real do ambiente. Vale nos
                 blocos sem JSON, onde não há risco de colidir com a sintaxe. -->
            <pre><code>curl -X POST {{ BASE }}/api/v1/matriculas \
  -H "Authorization: Bearer $LIDIMUS_API_KEY" \
  -F "file=@matricula.pdf" \
  -F 'params={"incluirMemorial":true,"geocodificar":true}'</code></pre>
          </div>

          <p class="resposta-rotulo">Resposta — <code>202 Accepted</code></p>
          <div class="bloco">
            <button type="button" class="copiar" @click="copiar($event, 'post-r')">
              {{ copiado === 'post-r' ? 'Copiado' : 'Copiar' }}
            </button>
            <pre v-pre><code>{
  "id": "2c7e4e0b-61be-4d8d-9087-e24c27bf3c44",
  "status": "queued",
  "paginas": 1,
  "custoCreditos": 91,
  "saldoRestante": 47380
}</code></pre>
          </div>

          <p>
            Guarde o <code>id</code>: é por ele que você busca o resultado. O
            <code>custoCreditos</code> e o <code>saldoRestante</code> aparecem
            <strong>só aqui</strong> — é o único momento em que se sabe exatamente o que foi
            cobrado por esta análise.
          </p>
        </section>

        <!-- ── Acompanhar ──────────────────────────────────────────────── -->
        <section id="acompanhar">
          <h2>3. Acompanhar a análise</h2>
          <p class="rota-titulo"><span class="verbo">GET</span> /api/v1/matriculas/{id}</p>

          <div class="bloco">
            <button type="button" class="copiar" @click="copiar($event, 'get')">
              {{ copiado === 'get' ? 'Copiado' : 'Copiar' }}
            </button>
            <pre><code>curl {{ BASE }}/api/v1/matriculas/$ID \
  -H "Authorization: Bearer $LIDIMUS_API_KEY"</code></pre>
          </div>

          <p>O campo <code>status</code> diz em que pé está:</p>

          <table class="tabela">
            <thead>
              <tr><th>status</th><th>O que significa</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><code class="est est--espera">queued</code></td>
                <td>Na fila, ainda não começou.</td>
              </tr>
              <tr>
                <td><code class="est est--espera">processing</code></td>
                <td>
                  Em andamento. O campo <code>etapa</code> mostra onde:
                  <code>ocr</code> (leitura), <code>juridico</code> (análise) ou
                  <code>doc</code> (montagem do parecer).
                </td>
              </tr>
              <tr>
                <td><code class="est est--ok">done</code></td>
                <td>Pronto. O campo <code>resultado</code> vem preenchido.</td>
              </tr>
              <tr>
                <td><code class="est est--erro">error</code></td>
                <td>
                  Falhou. O motivo vem em <code>erro</code> — e
                  <strong>os créditos são devolvidos automaticamente</strong>.
                </td>
              </tr>
            </tbody>
          </table>

          <div class="nota">
            <p>
              <strong>De quanto em quanto tempo consultar?</strong> A cada 10 a 30 segundos. A
              maioria das matrículas fica pronta em poucos minutos; documentos longos demoram mais.
              Consultar a cada segundo não acelera nada e consome o seu limite de chamadas.
            </p>
          </div>

          <p class="resposta-rotulo">Enquanto processa</p>
          <div class="bloco">
            <button type="button" class="copiar" @click="copiar($event, 'proc')">
              {{ copiado === 'proc' ? 'Copiado' : 'Copiar' }}
            </button>
            <pre v-pre><code>{
  "id": "2c7e4e0b-...",
  "status": "processing",
  "etapa": "juridico",
  "arquivo": "matricula.pdf",
  "paginas": 8,
  "criadoEm": "2026-07-30T00:12:51.291Z",
  "concluidoEm": null,
  "erro": null,
  "resultado": null
}</code></pre>
          </div>
        </section>

        <!-- ── O RESULTADO ─────────────────────────────────────────────── -->
        <section id="resultado">
          <h2>4. O resultado</h2>
          <p class="doc-lide-secao">
            Esta é a parte que importa: o que exatamente chega até você, e onde cada informação
            está.
          </p>

          <h3>Onde o resultado chega</h3>
          <p>
            No campo <code>resultado</code> da consulta do item 3, e só quando
            <code>status</code> for <code>done</code>. Antes disso ele é <code>null</code>. Não há
            outro lugar, outro endpoint ou outro download: o parecer inteiro está nessa resposta.
          </p>

          <h3>O mapa da estrutura</h3>
          <p>
            Por fora, um resumo de leitura rápida. Por dentro de <code>documento</code>, o parecer
            completo:
          </p>

          <div class="bloco">
            <pre v-pre><code>resultado
├── numero_matricula      "328135"
├── cartorio              "11º Cartório de Registro de Imóveis de São Paulo"
├── endereco              descrição do imóvel como consta na matrícula
├── data_certidao         "20/04/2004"
├── certidao_situacao     atualizada | desatualizada | nao_identificada
├── classificacao_risco   critico | alto | medio | baixo | indeterminado
├── resumo_juridico       parecer geral + contadores
└── documento
    ├── cabecalho         identificação da matrícula e da certidão
    ├── imovel            área, endereço, coordenadas, confrontantes
    ├── proprietarios     quem é o dono, com documento e ato de aquisição
    ├── onus              ônus ATIVOS (o que ainda pesa sobre o imóvel)
    ├── historico_atos    todos os atos, inclusive os já cancelados
    ├── analise_juridica  riscos, conclusão, fundamentação legal
    ├── parecer           texto corrido do parecer
    ├── croqui            desenho do perímetro (quando solicitado)
    └── metadados         páginas lidas, avisos de validação</code></pre>
          </div>

          <h3>Resumo de leitura rápida</h3>
          <p>
            Os campos do primeiro nível respondem “devo me preocupar com este imóvel?” sem entrar no
            parecer.
          </p>

          <table class="tabela">
            <thead>
              <tr><th>Campo</th><th>Tipo</th><th>Descrição</th></tr>
            </thead>
            <tbody>
              <tr><td><code>numero_matricula</code></td><td>texto</td><td>Número da matrícula, só dígitos.</td></tr>
              <tr><td><code>cartorio</code></td><td>texto</td><td>Nome completo do cartório.</td></tr>
              <tr><td><code>endereco</code></td><td>texto</td><td>Descrição do imóvel como está na matrícula.</td></tr>
              <tr><td><code>data_certidao</code></td><td>texto</td><td>Data de emissão, em <code>dd/mm/aaaa</code>.</td></tr>
              <tr>
                <td><code>certidao_situacao</code></td>
                <td>texto</td>
                <td>
                  <code>atualizada</code>, <code>desatualizada</code> ou
                  <code>nao_identificada</code>. Certidão de registro de imóveis tem validade curta
                  — vale checar antes de usar o parecer em uma transação.
                </td>
              </tr>
              <tr>
                <td><code>classificacao_risco</code></td>
                <td>texto</td>
                <td>
                  <code>critico</code>, <code>alto</code>, <code>medio</code>, <code>baixo</code> ou
                  <code>indeterminado</code>. É o campo em que a maioria das integrações ramifica.
                </td>
              </tr>
              <tr>
                <td><code>resumo_juridico</code></td>
                <td>objeto</td>
                <td>
                  <code>parecer_geral</code> (texto), <code>total_riscos</code>,
                  <code>total_onus_ativos</code> e <code>classificacao_risco</code>.
                </td>
              </tr>
            </tbody>
          </table>

          <div class="nota">
            <p>
              <code>indeterminado</code> não quer dizer “sem risco”. Quer dizer que o documento não
              permitiu concluir — imagem parcial, ficha só do anverso, PDF sem fé pública. Trate-o
              como “precisa de certidão melhor”, nunca como “liberado”.
            </p>
          </div>

          <h3>documento.imovel</h3>
          <table class="tabela">
            <thead><tr><th>Campo</th><th>Descrição</th></tr></thead>
            <tbody>
              <tr><td><code>area_total_m2</code></td><td>Área total, em texto com vírgula decimal: <code>"15712,00"</code>.</td></tr>
              <tr><td><code>area_construida_m2</code></td><td>Área construída, ou <code>null</code> em terreno.</td></tr>
              <tr><td><code>area_total_display</code></td><td>O mesmo já formatado para exibir: <code>"15712,00 m²"</code>.</td></tr>
              <tr><td><code>endereco_curto</code></td><td>Endereço normalizado: <code>"Avenida Robert Kennedy, 2447, Capela do Socorro, São Paulo - SP"</code>.</td></tr>
              <tr><td><code>lat</code> / <code>lng</code></td><td>Coordenadas, quando <code>geocodificar</code> está ligado. <code>null</code> se o endereço não foi localizado.</td></tr>
              <tr><td><code>confrontantes</code></td><td>Objeto com <code>norte</code>, <code>sul</code>, <code>leste</code> e <code>oeste</code>; cada um texto ou <code>null</code>.</td></tr>
              <tr><td><code>tem_onus</code></td><td>Booleano — atalho para “há ônus ativo?”.</td></tr>
              <tr><td><code>testada</code></td><td>Medida da frente do terreno, quando consta.</td></tr>
            </tbody>
          </table>
          <p class="dica">
            As áreas vêm como <strong>texto</strong>, no formato brasileiro
            (<code>"15712,00"</code>), preservando exatamente o que está escrito na matrícula. Para
            calcular, troque a vírgula por ponto antes de converter.
          </p>

          <h3>documento.proprietarios</h3>
          <p>
            <code>total</code>, <code>origem</code> e <code>lista</code>. Cada item da lista traz:
          </p>
          <div class="bloco">
            <pre v-pre><code>{
  "ordem": 1,
  "nome": "CENTRO ASSOCIATIVO DOS FUNCIONÁRIOS ESTADUAIS – C.A.F.E.",
  "documento_tipo": "CNPJ",
  "documento_numero": "62.577.036/0001-90",
  "percentual": "100%",
  "estado_civil": null,
  "regime_bens": null,
  "natureza": null,
  "ato_aquisitivo": "Av.1/328.135 (unificação – abertura da matrícula em 20/04/2004)",
  "data_aquisicao": "20/04/2004",
  "endereco_domicilio": "Avenida Robert Kennedy, 2447, São Paulo/SP",
  "observacao": "Denominação anterior: CENTRO ASSOCIATIVO FAZENDA ESTADUAL"
}</code></pre>
          </div>
          <p>
            Há também <code>promissarios</code> (compromissários compradores) na mesma forma, em
            <code>proprietarios.promissarios.lista</code>.
          </p>

          <h3>documento.onus e documento.historico_atos</h3>
          <p>
            A diferença entre os dois é o que separa uma consulta útil de uma perigosa:
          </p>
          <ul class="lista">
            <li>
              <code>onus.ativos</code> — <strong>o que ainda pesa</strong> sobre o imóvel agora.
              É aqui que se olha para decidir sobre uma transação.
            </li>
            <li>
              <code>historico_atos.lista</code> — <strong>tudo que já aconteceu</strong>, inclusive
              hipotecas e penhoras já canceladas. Serve para entender a história, não para julgar a
              situação atual.
            </li>
          </ul>

          <div class="bloco">
            <pre v-pre><code>{
  "sequencia": "AV-2",
  "tipo": "AV",
  "tipo_ato": "transporte_onus_arresto",
  "tipo_label": "Transporte de Arresto",
  "data": "15/02/2012",
  "valor": "369.943,67",
  "partes": "NOME DAS PARTES; OUTRO NOME",
  "status": "ativo",
  "cancelado_por": null,
  "texto_resumo": "Av-2. Prenotação n. 4.607, em 15/02/2012. TRANSPORTE DE ÔNUS ARRESTO..."
}</code></pre>
          </div>

          <table class="tabela">
            <thead><tr><th>Campo</th><th>Descrição</th></tr></thead>
            <tbody>
              <tr><td><code>sequencia</code></td><td>Identificação do ato na matrícula: <code>"AV-2"</code>, <code>"R-5"</code>.</td></tr>
              <tr><td><code>tipo</code></td><td><code>AV</code> (averbação) ou <code>R</code> (registro).</td></tr>
              <tr><td><code>tipo_ato</code></td><td>Código do tipo, estável para comparar em código.</td></tr>
              <tr><td><code>tipo_label</code></td><td>O mesmo em português, para exibir.</td></tr>
              <tr><td><code>status</code></td><td><code>ativo</code> ou <code>cancelado</code>.</td></tr>
              <tr><td><code>cancelado_por</code></td><td>Qual ato o cancelou, quando cancelado: <code>"AV-35"</code>.</td></tr>
              <tr><td><code>valor</code></td><td>Valor envolvido, em texto no formato brasileiro. Pode ser <code>null</code>.</td></tr>
            </tbody>
          </table>

          <h3>documento.analise_juridica</h3>
          <p>
            O parecer propriamente dito. Fica em <code>analise_juridica.completa</code>, e os campos
            abaixo são os que mais interessam a uma integração.
          </p>

          <h4><code>completa.riscos</code> — lista</h4>
          <p>O item mais acionável de todo o retorno.</p>
          <div class="bloco">
            <pre v-pre><code>{
  "tipo": "documento_sem_fe_publica",
  "severidade": "alta",
  "impacto": "A análise baseia-se em imagem sem força probante de certidão...",
  "evidencia": "Rodapé: 'ESTE DOCUMENTO NÃO VALE COMO CERTIDÃO'",
  "recomendacao": "Solicitar certidão de inteiro teor atualizada ao 11º CRI..."
}</code></pre>
          </div>
          <p>
            <code>severidade</code> assume <code>critica</code>, <code>alta</code>,
            <code>media</code> ou <code>baixa</code>. Cada risco traz a
            <strong>evidência</strong> que o sustenta — o trecho da matrícula que o originou — e uma
            <strong>recomendação</strong> do que fazer.
          </p>

          <h4><code>completa.resumo_executivo</code></h4>
          <p>
            Três campos: <code>conclusao</code> (o parecer em um parágrafo),
            <code>recomendacao</code> (o que fazer antes de transacionar) e
            <code>classificacao_risco</code>.
          </p>

          <h4><code>completa.estado_atual</code></h4>
          <p>
            A fotografia de agora: <code>propriedade</code> (quem é o dono, em texto),
            <code>onus_ativos</code>, <code>restricoes_ativas</code>,
            <code>direitos_reais_ativos</code>, <code>cadeia_dominial_status</code>
            (<code>completa</code> ou <code>incompleta</code>) e uma <code>observacao</code> sobre
            os limites da leitura.
          </p>

          <h4><code>completa.fundamentacao_legal</code> — lista</h4>
          <p>
            A base legal de cada conclusão: <code>fonte</code> (<code>"Lei n. 6.015/1973"</code>),
            <code>referencia</code> (<code>"art. 234 e seguintes"</code>),
            <code>aplicacao</code> (por que se aplica a este caso) e <code>trecho</code>.
          </p>

          <h4><code>completa.classes_juridicas</code> — lista</h4>
          <p>
            Classificação de cada ato encontrado: <code>tipo</code>, <code>classe</code>
            (<code>REGISTRO</code>, <code>AVERBACAO</code>), <code>confianca</code> e a
            <code>evidencia</code> textual.
          </p>

          <h4><code>completa.regras_deterministicas</code> — lista</h4>
          <p>
            Verificações objetivas, feitas por regra e não por interpretação — por exemplo, se uma
            hipoteca segue ativa depois de um cancelamento. Cada item traz <code>regra</code>,
            <code>condicao</code>, <code>evidencia</code> e <code>resultado</code> (booleano).
            Útil quando a integração precisa justificar uma decisão automática.
          </p>

          <h3>documento.metadados e documento.croqui</h3>
          <p>
            <code>metadados</code> traz <code>total_paginas</code>, <code>data_extracao</code> e
            <code>validacao</code> com <code>erros</code> e <code>avisos</code> — leia os avisos: é
            onde aparece “só o anverso da ficha foi lido”, que muda como interpretar o resto.
          </p>
          <p>
            <code>croqui</code> traz <code>disponivel</code> (booleano), <code>svg</code>,
            <code>data_uri</code> e <code>precisao</code>. Só vem preenchido quando você envia
            <code>incluirCroqui: true</code> e a matrícula descreve o perímetro.
          </p>

          <h3>Os campos terminados em <code>_html</code></h3>
          <div class="aviso">
            <p>
              Espalhados pelo retorno há campos como <code>parecer.html</code>,
              <code>riscos_html</code> e <code>proprietarios.html</code>. Eles são
              <strong>o HTML pronto que o nosso painel usa para desenhar a tela</strong>, com estilos
              embutidos. Servem se você quiser embutir o parecer rapidamente em uma página.
            </p>
            <p>
              <strong>Não construa a sua integração em cima deles.</strong> São apresentação: a
              marcação muda quando mudamos o layout do painel, sem aviso. Para lógica, dados e
              armazenamento, use sempre os campos estruturados descritos acima.
            </p>
          </div>

          <h3>Exemplo — resposta concluída</h3>
          <div class="bloco">
            <button type="button" class="copiar" @click="copiar($event, 'done')">
              {{ copiado === 'done' ? 'Copiado' : 'Copiar' }}
            </button>
            <pre v-pre><code>{
  "id": "2c7e4e0b-61be-4d8d-9087-e24c27bf3c44",
  "status": "done",
  "etapa": "doc",
  "arquivo": "matricula.pdf",
  "paginas": 1,
  "criadoEm": "2026-07-30T00:12:51.291Z",
  "concluidoEm": "2026-07-30T00:15:37.356Z",
  "erro": null,
  "resultado": {
    "numero_matricula": "328135",
    "cartorio": "11º Cartório de Registro de Imóveis de São Paulo",
    "endereco": "Terreno situado na Avenida Robert Kennedy...",
    "data_certidao": "20/04/2004",
    "certidao_situacao": "desatualizada",
    "classificacao_risco": "indeterminado",
    "resumo_juridico": {
      "parecer_geral": "Matrícula 328.135 do 11º CRI de São Paulo, aberta em...",
      "total_riscos": 5,
      "total_onus_ativos": 0,
      "classificacao_risco": "indeterminado"
    },
    "documento": {
      "imovel": {
        "area_total_m2": "15712,00",
        "endereco_curto": "Avenida Robert Kennedy, 2447, São Paulo - SP",
        "lat": -23.7133041,
        "lng": -46.5735504,
        "tem_onus": false
      },
      "proprietarios": { "total": 1, "lista": [ "..." ] },
      "onus": { "total": 0, "ativos": [] },
      "historico_atos": { "total": 0, "lista": [] },
      "analise_juridica": {
        "completa": {
          "riscos": [ "..." ],
          "resumo_executivo": { "conclusao": "...", "recomendacao": "..." },
          "estado_atual": { "cadeia_dominial_status": "incompleta" },
          "fundamentacao_legal": [ "..." ]
        }
      },
      "metadados": { "total_paginas": 1, "validacao": { "erros": [], "avisos": [ "..." ] } }
    }
  }
}</code></pre>
          </div>
        </section>

        <!-- ── Listar ──────────────────────────────────────────────────── -->
        <section id="listar">
          <h2>5. Listar análises</h2>
          <p class="rota-titulo"><span class="verbo">GET</span> /api/v1/matriculas</p>
          <p>
            As análises da sua empresa, da mais recente para a mais antiga. Aceita
            <code>limite</code> (1 a 100, padrão 20), <code>status</code> e <code>cursor</code>.
          </p>
          <p>
            A listagem <strong>não traz o campo <code>resultado</code></strong> — o parecer completo
            de vinte matrículas seria uma resposta enorme. Para o conteúdo, peça a análise pelo id.
          </p>

          <div class="bloco">
            <button type="button" class="copiar" @click="copiar($event, 'lista')">
              {{ copiado === 'lista' ? 'Copiado' : 'Copiar' }}
            </button>
            <pre v-pre><code>{
  "itens": [
    { "id": "2c7e4e0b-...", "status": "done", "arquivo": "matricula.pdf", "paginas": 1 }
  ],
  "proximoCursor": "MjAyNi0wNy0zMFQwMDoxMjo1MS4yOTFa"
}</code></pre>
          </div>
          <p>
            Para a próxima página, repita a chamada passando <code>cursor</code> com o valor de
            <code>proximoCursor</code>. Quando ele vier <code>null</code>, acabou. O cursor é opaco:
            devolva-o como veio, sem interpretar.
          </p>
        </section>

        <!-- ── Erros ───────────────────────────────────────────────────── -->
        <section id="erros">
          <h2>6. Erros</h2>
          <p>
            Todo erro chega no mesmo formato. Programe olhando o <code>codigo</code> — ele é
            estável; a <code>mensagem</code> é para a pessoa que lê o log e pode mudar.
          </p>

          <div class="bloco">
            <pre v-pre><code>{
  "erro": {
    "codigo": "creditos_insuficientes",
    "mensagem": "Créditos insuficientes. Saldo: 40, necessário: 91 (1 página)."
  }
}</code></pre>
          </div>

          <table class="tabela">
            <thead><tr><th>HTTP</th><th>codigo</th><th>O que fazer</th></tr></thead>
            <tbody>
              <tr>
                <td>401</td><td><code>credencial_invalida</code></td>
                <td>Chave ausente, errada, revogada ou vencida. Confira em Conta → API.</td>
              </tr>
              <tr>
                <td>402</td><td><code>creditos_insuficientes</code></td>
                <td>Saldo insuficiente. Nada foi criado e nada foi cobrado.</td>
              </tr>
              <tr>
                <td>403</td><td><code>plano_sem_api</code></td>
                <td>O plano da empresa não inclui a API.</td>
              </tr>
              <tr>
                <td>403</td><td><code>chave_orfa</code></td>
                <td>Quem emitiu a chave saiu da empresa. O proprietário emite outra.</td>
              </tr>
              <tr>
                <td>404</td><td><code>nao_encontrado</code></td>
                <td>Id inexistente ou de outra empresa.</td>
              </tr>
              <tr>
                <td>400</td><td><code>arquivo_invalido</code></td>
                <td>O campo <code>file</code> falta ou não é um PDF.</td>
              </tr>
              <tr>
                <td>413</td><td><code>arquivo_grande_demais</code></td>
                <td>Acima de 50 MB.</td>
              </tr>
              <tr>
                <td>429</td><td><code>limite_de_uso</code></td>
                <td>Limite por hora atingido. Espere e repita.</td>
              </tr>
              <tr>
                <td>5xx</td><td><code>erro_interno</code></td>
                <td>Falha nossa. Repita em alguns minutos; se persistir, fale com o suporte.</td>
              </tr>
            </tbody>
          </table>

          <div class="nota">
            <p>
              <strong>Análise que falha não é cobrada.</strong> Quando o
              <code>status</code> vira <code>error</code>, os créditos voltam para o saldo
              automaticamente — você não precisa pedir estorno.
            </p>
          </div>
        </section>

        <!-- ── Limites ─────────────────────────────────────────────────── -->
        <section id="limites">
          <h2>7. Limites e custo</h2>
          <table class="tabela">
            <thead><tr><th>Item</th><th>Valor</th></tr></thead>
            <tbody>
              <tr><td>Custo por análise</td><td><strong>83 + 8 × número de páginas</strong> créditos</td></tr>
              <tr><td>Envios por hora</td><td>120 por empresa, e 120 por chave</td></tr>
              <tr><td>Tamanho do arquivo</td><td>50 MB</td></tr>
              <tr><td>Chaves ativas</td><td>5 por empresa</td></tr>
              <tr><td>Validade da chave</td><td>1 ano</td></tr>
            </tbody>
          </table>
          <p>
            Uma matrícula de 5 páginas custa <code>83 + 40 = 123</code> créditos. O saldo aparece em
            <a href="/conta/creditos">Conta → Créditos</a> e na resposta de cada envio.
          </p>
          <p>
            O limite por chave existe para o seu benefício: se você tem uma chave por sistema, um
            script descontrolado em um deles não derruba a integração dos outros.
          </p>
        </section>

        <!-- ── Exemplo ─────────────────────────────────────────────────── -->
        <section id="exemplo">
          <h2>8. Exemplo pronto</h2>
          <p>Envia, espera ficar pronto e imprime o parecer. Precisa de <code>curl</code> e <code>jq</code>.</p>

          <div class="bloco">
            <button type="button" class="copiar" @click="copiar($event, 'script')">
              {{ copiado === 'script' ? 'Copiado' : 'Copiar' }}
            </button>
            <pre><code>#!/usr/bin/env bash
set -euo pipefail

BASE={{ BASE }}
PDF="$1"

ID=$(curl -sf -X POST "$BASE/api/v1/matriculas" \
  -H "Authorization: Bearer $LIDIMUS_API_KEY" \
  -F "file=@$PDF" | jq -r .id)

echo "análise $ID enviada; aguardando…"

while :; do
  R=$(curl -sf "$BASE/api/v1/matriculas/$ID" -H "Authorization: Bearer $LIDIMUS_API_KEY")
  case $(jq -r .status <<<"$R") in
    done)
      jq -r '.resultado | "Matrícula \(.numero_matricula) — risco \(.classificacao_risco)"' <<<"$R"
      jq '.resultado.documento.analise_juridica.completa.riscos' <<<"$R"
      break ;;
    error)
      echo "falhou: $(jq -r .erro <<<"$R")" >&2; exit 1 ;;
    *)
      sleep 15 ;;
  esac
done</code></pre>
          </div>
        </section>

        <section class="doc-fim">
          <h2>Ficou alguma dúvida?</h2>
          <p>
            Escreva para
            <a href="mailto:jose.tarallo@gmail.com?subject=Lidimus%20%E2%80%94%20API">
              o suporte
            </a>
            com o <code>id</code> da análise: com ele conseguimos ver exatamente o que aconteceu.
          </p>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* Sistema Modernista (--color-*/ /* --font-*), como a landing: esta é uma página
   pública, e quem a lê pode nem ter conta. As telas internas seguem no verde
   --ld-* até a migração incremental alcançá-las. */
.doc {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
}

/* ── Cabeçalho ────────────────────────────────────────────── */
.doc-topo {
  position: sticky;
  top: 0;
  z-index: var(--ld-z-sticky);
  background: var(--color-bg);
  border-bottom: 2px solid var(--color-text);
}
.doc-topo-inner {
  max-width: 74rem;
  margin: 0 auto;
  padding: 0 var(--ld-space-lg);
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
}
.doc-logo {
  display: block;
  height: 38px;
  width: auto;
}
.doc-topo-dir {
  display: flex;
  align-items: center;
  gap: var(--ld-space-md);
}
.doc-versao {
  font-family: var(--font-cond);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-bg);
  background: var(--color-accent);
  padding: 3px 9px;
}
.doc-topo-link {
  font-family: var(--font-cond);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-text) 65%, transparent);
  text-decoration: none;
}
.doc-topo-link:hover {
  color: var(--color-text);
}

/* ── Estrutura ────────────────────────────────────────────── */
.doc-corpo {
  max-width: 74rem;
  margin: 0 auto;
  padding: var(--ld-space-xl) var(--ld-space-lg) var(--ld-space-2xl);
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr);
  gap: var(--ld-space-2xl);
  align-items: start;
}
@media (max-width: 60rem) {
  .doc-corpo {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ld-space-lg);
  }
}

.doc-indice {
  position: sticky;
  top: calc(60px + var(--ld-space-lg));
}
@media (max-width: 60rem) {
  .doc-indice {
    position: static;
    border-bottom: 1px solid var(--color-divider);
    padding-bottom: var(--ld-space-md);
  }
}
.doc-indice-titulo {
  margin: 0 0 var(--ld-space-sm);
  font-family: var(--font-cond);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-text) 55%, transparent);
}
.doc-indice ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
@media (max-width: 60rem) {
  .doc-indice ul {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--ld-space-sm) var(--ld-space-md);
  }
}
.doc-indice a {
  display: block;
  padding: 4px 0;
  font-size: 0.875rem;
  color: color-mix(in srgb, var(--color-text) 70%, transparent);
  text-decoration: none;
  border-left: 2px solid transparent;
  padding-left: 10px;
  margin-left: -12px;
}
@media (max-width: 60rem) {
  .doc-indice a {
    border-left: none;
    padding-left: 0;
    margin-left: 0;
  }
}
.doc-indice a:hover {
  color: var(--color-accent);
  border-left-color: var(--color-accent);
}

/* ── Tipografia ───────────────────────────────────────────── */
.doc-conteudo {
  min-width: 0;
}
.doc-conteudo h1 {
  margin: 0 0 var(--ld-space-md);
  font-family: var(--font-heading);
  font-size: clamp(2rem, 5vw, 2.75rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
}
.doc-lide {
  margin: 0 0 var(--ld-space-xl);
  font-size: 1.125rem;
  line-height: 1.6;
  max-width: 62ch;
  color: color-mix(in srgb, var(--color-text) 80%, transparent);
}
.doc-lide-secao {
  font-size: 1.0625rem;
  line-height: 1.6;
  max-width: 62ch;
  color: color-mix(in srgb, var(--color-text) 80%, transparent);
}
.doc-conteudo section {
  margin-bottom: var(--ld-space-2xl);
  scroll-margin-top: calc(60px + var(--ld-space-md));
}
.doc-conteudo h2 {
  margin: 0 0 var(--ld-space-md);
  padding-top: var(--ld-space-md);
  border-top: 2px solid var(--color-text);
  font-family: var(--font-heading);
  font-size: 1.5rem;
  line-height: 1.2;
  letter-spacing: -0.01em;
}
.doc-conteudo h3 {
  margin: var(--ld-space-xl) 0 var(--ld-space-sm);
  font-family: var(--font-cond);
  font-size: 1.0625rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.doc-conteudo h4 {
  margin: var(--ld-space-lg) 0 var(--ld-space-xs);
  font-size: 0.9375rem;
  font-weight: 700;
}
.doc-conteudo p {
  margin: 0 0 var(--ld-space-md);
  line-height: 1.65;
  max-width: 68ch;
}
.doc-conteudo a {
  color: var(--color-accent);
  font-weight: 600;
}
.lista {
  margin: 0 0 var(--ld-space-md);
  padding-left: 1.1rem;
  max-width: 68ch;
}
.lista li {
  margin-bottom: var(--ld-space-xs);
  line-height: 1.65;
}
.dica {
  font-size: 0.9375rem;
  color: color-mix(in srgb, var(--color-text) 72%, transparent);
}

code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  padding: 1px 5px;
  white-space: nowrap;
}

/* ── Fluxo em 4 passos ────────────────────────────────────── */
/* Quatro colunas explícitas, não auto-fit: são quatro passos de uma sequência, e
   com auto-fit o quarto cai sozinho numa segunda linha, o que lê como acidente
   em vez de ordem. Quebra em 2×2 e depois em coluna única. */
.fluxo {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ld-space-md);
  margin-bottom: var(--ld-space-lg);
}
@media (max-width: 72rem) {
  .fluxo {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 34rem) {
  .fluxo {
    grid-template-columns: minmax(0, 1fr);
  }
}
.fluxo-passo {
  border: 1px solid var(--color-divider);
  padding: var(--ld-space-md);
  background: var(--color-surface);
}
.fluxo-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-bottom: var(--ld-space-sm);
  background: var(--color-accent);
  color: var(--color-bg);
  font-family: var(--font-cond);
  font-weight: 700;
  font-size: 0.875rem;
}
.fluxo-passo p {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.55;
}

/* ── Blocos de código ─────────────────────────────────────── */
.bloco {
  position: relative;
  margin: 0 0 var(--ld-space-lg);
  border: 1px solid var(--color-divider);
  background: var(--color-surface);
}
.bloco pre {
  margin: 0;
  padding: var(--ld-space-md);
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.6;
  tab-size: 2;
}
.bloco pre code {
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
  white-space: pre;
}
.copiar {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
  border: 1px solid var(--color-divider);
  background: var(--color-bg);
  padding: 3px 10px;
  font-family: var(--font-cond);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-text) 65%, transparent);
  cursor: pointer;
}
.copiar:hover {
  color: var(--color-text);
  border-color: var(--color-text);
}

/* ── Rotas ────────────────────────────────────────────────── */
.rota-titulo {
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  font-family: var(--font-mono);
  font-size: 0.9375rem;
  font-weight: 600;
  flex-wrap: wrap;
}
.verbo {
  font-family: var(--font-cond);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  border: 1px solid var(--color-text);
  text-transform: uppercase;
}
.verbo--post {
  background: var(--color-text);
  color: var(--color-bg);
}
.resposta-rotulo {
  font-family: var(--font-cond);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-text) 60%, transparent);
  margin-bottom: var(--ld-space-xs) !important;
}

/* ── Tabelas ──────────────────────────────────────────────── */
.tabela {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 var(--ld-space-lg);
  font-size: 0.9375rem;
  display: block;
  overflow-x: auto;
}
.tabela thead,
.tabela tbody,
.tabela tr {
  display: table;
  width: 100%;
  table-layout: fixed;
}
.tabela th {
  text-align: left;
  background: var(--color-surface);
  border-bottom: 2px solid var(--color-text);
  padding: 8px 12px;
  font-family: var(--font-cond);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.tabela td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-divider);
  line-height: 1.55;
  vertical-align: top;
}
.tabela th:first-child,
.tabela td:first-child {
  width: 30%;
}
.tabela code {
  white-space: normal;
  word-break: break-word;
}

/* ── Selos de estado ──────────────────────────────────────── */
.est {
  border-width: 1px;
  border-style: solid;
  font-weight: 600;
}
.est--ok {
  color: var(--color-accent-800);
  border-color: var(--color-accent-300);
  background: var(--color-accent-100);
}
.est--espera {
  color: color-mix(in srgb, var(--color-text) 70%, transparent);
}
.est--erro {
  color: var(--color-accent-700);
  border-color: var(--color-accent-400);
}

/* ── Destaques ────────────────────────────────────────────── */
/* Destaques falam a mesma língua do resto da página: régua horizontal no topo,
   como os h2 — e não a barrinha colorida na lateral, que é vocabulário de outro
   sistema. O aviso se distingue do restante pela espessura e pela cor da régua. */
.nota,
.aviso {
  margin: 0 0 var(--ld-space-lg);
  padding: var(--ld-space-md);
  border: 1px solid var(--color-divider);
  border-top: 2px solid var(--color-text);
  background: var(--color-surface);
  max-width: 68ch;
}
.aviso {
  border-top-color: var(--color-accent);
}
.nota p:last-child,
.aviso p:last-child {
  margin-bottom: 0;
}
.nota p,
.aviso p {
  font-size: 0.9375rem;
}

.doc-fim {
  border-top: 1px solid var(--color-divider);
  padding-top: var(--ld-space-lg);
}
.doc-fim h2 {
  border-top: none;
  padding-top: 0;
  font-size: 1.25rem;
}
</style>
