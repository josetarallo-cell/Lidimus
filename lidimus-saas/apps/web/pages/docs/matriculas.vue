<script setup lang="ts">
definePageMeta({ layout: false })

useHead({
  title: 'Análise de matrícula — Lidimus',
  meta: [
    {
      name: 'description',
      content:
        'Parecer completo de matrícula imobiliária em cerca de três minutos: cadeia dominial, ' +
        'proprietários, ônus ativos, riscos classificados e fundamentação legal.',
    },
    { name: 'robots', content: 'noindex, follow' },
  ],
})

const SECOES = [
  { id: 'por-que', rotulo: 'Por que importa' },
  { id: 'o-que-faz', rotulo: 'O que a análise faz' },
  { id: 'tempo', rotulo: 'Quanto tempo leva' },
  { id: 'como-usar', rotulo: 'Como usar (e em lote)' },
  { id: 'o-que-recebe', rotulo: 'O que você recebe' },
  { id: 'custo', rotulo: 'Custo' },
  { id: 'limites', rotulo: 'Limites' },
]
</script>

<template>
  <DocsPagina titulo="Análise de matrícula" selo="Ferramenta" :secoes="SECOES">
    <p class="doc-lide">
      Você envia o PDF da matrícula. Volta um parecer estruturado: quem é o dono, o que pesa sobre o
      imóvel, o que já aconteceu com ele, quais riscos existem e em que dispositivo legal cada
      conclusão se apoia.
    </p>

    <!-- ── Por que importa ─────────────────────────────────────────────── -->
    <section id="por-que">
      <h2>Por que importa</h2>
      <p>
        A matrícula é o documento que diz a verdade sobre um imóvel — e é justamente onde os
        problemas se escondem, porque quase ninguém lê a matrícula inteira antes de pagar.
      </p>

      <div class="doc-clipes">
        <div class="doc-clipe">
          <span class="doc-clipe-cat">Escala</span>
          <p class="doc-clipe-manchete">2,26 milhões de estelionatos em um ano</p>
          <p class="doc-clipe-chamada">
            Um caso a cada 14 segundos no Brasil. Alta de 429,8% desde 2018.
          </p>
          <p class="doc-clipe-fonte">
            <a
              href="https://forumseguranca.org.br/publicacoes/anuario-brasileiro-de-seguranca-publica-2025/"
              target="_blank"
              rel="noopener noreferrer"
            >19º Anuário Brasileiro de Segurança Pública · FBSP · 2025</a>
          </p>
        </div>
        <div class="doc-clipe">
          <span class="doc-clipe-cat">Ritmo local</span>
          <p class="doc-clipe-manchete">Mais de 12 golpes por hora em Minas</p>
          <p class="doc-clipe-chamada">
            106 mil casos por ano no estado; a escalada em 7 anos passou de 280%.
          </p>
          <p class="doc-clipe-fonte">
            <a
              href="https://www.otempo.com.br/cidades/2026/6/15/explosao-de-estelionatos-em-mg-acende-alerta-sobre-fraudes-imobiliarias-saiba-como-se-prevenir"
              target="_blank"
              rel="noopener noreferrer"
            >O Tempo · jun/2026</a>
          </p>
        </div>
        <div class="doc-clipe">
          <span class="doc-clipe-cat">O padrão</span>
          <p class="doc-clipe-manchete">Vender o que não é seu, duas vezes</p>
          <p class="doc-clipe-chamada">
            Venda por quem não é proprietário, mesmo imóvel a compradores diferentes e omissão de
            débitos estão entre as fraudes mais recorrentes.
          </p>
          <p class="doc-clipe-fonte">
            <a
              href="https://diariodocomercio.com.br/economia/dica-evitar-golpe-corretor-minas/"
              target="_blank"
              rel="noopener noreferrer"
            >Diário do Comércio · orientação dos cartórios · 2026</a>
          </p>
        </div>
      </div>

      <p class="doc-procedencia">
        Os três padrões da última coluna — falso proprietário, venda dupla e ônus omitido — têm algo
        em comum: <strong>todos aparecem na matrícula</strong>, para quem ler a cadeia dominial
        inteira e conferir cada averbação. O problema nunca foi a informação faltar. Foi o tempo de
        procurá-la.
      </p>
    </section>

    <!-- ── O que faz ───────────────────────────────────────────────────── -->
    <section id="o-que-faz">
      <h2>O que a análise faz</h2>
      <p>
        A leitura vai da primeira à última ficha do documento, e não só do cabeçalho. Em ordem:
      </p>

      <div class="doc-fluxo">
        <div class="doc-passo">
          <span class="doc-passo-num">1</span>
          <p><strong>Leitura óptica.</strong> Transcreve o documento, inclusive as fichas manuscritas e carimbadas.</p>
        </div>
        <div class="doc-passo">
          <span class="doc-passo-num">2</span>
          <p><strong>Extração.</strong> Identifica proprietários, área, endereço, atos e sequência.</p>
        </div>
        <div class="doc-passo">
          <span class="doc-passo-num">3</span>
          <p><strong>Análise jurídica.</strong> Classifica cada ato, separa o que está ativo do que foi cancelado e levanta riscos.</p>
        </div>
        <div class="doc-passo">
          <span class="doc-passo-num">4</span>
          <p><strong>Parecer.</strong> Conclusão, recomendação e a base legal de cada ponto.</p>
        </div>
      </div>

      <h3>O que sai identificado</h3>
      <ul class="lista">
        <li>
          <strong>Cadeia dominial</strong> — a sequência de transferências desde a origem, com aviso
          quando há lacuna. Cadeia com falha torna a propriedade atual contestável.
        </li>
        <li>
          <strong>Proprietários</strong> — nome, CPF ou CNPJ, percentual, estado civil e regime de
          bens, ato que deu origem à aquisição e data.
        </li>
        <li>
          <strong>Ônus ativos</strong> — hipoteca, penhora, arresto, usufruto, servidão: o que ainda
          pesa sobre o imóvel <em>hoje</em>, separado do que já foi baixado.
        </li>
        <li>
          <strong>Riscos classificados</strong> — cada um com a evidência textual que o sustenta e a
          recomendação do que fazer.
        </li>
        <li>
          <strong>Fundamentação legal</strong> — o dispositivo em que cada conclusão se apoia, para
          o parecer poder ser conferido em vez de aceito.
        </li>
        <li>
          <strong>Situação da certidão</strong> — se o documento enviado está atualizado, e há
          quantos dias foi emitido.
        </li>
      </ul>
    </section>

    <!-- ── Tempo ───────────────────────────────────────────────────────── -->
    <section id="tempo">
      <h2>Quanto tempo leva</h2>
      <p>
        Medido nas análises de matrícula já processadas em produção, ponta a ponta — do envio do PDF
        até o parecer pronto:
      </p>

      <div class="doc-metricas">
        <div class="doc-metrica">
          <span class="doc-metrica-valor">3 <small>min</small></span>
          <span class="doc-metrica-rotulo">Mediana</span>
          <span class="doc-metrica-nota">metade das análises fica pronta antes disso</span>
        </div>
        <div class="doc-metrica">
          <span class="doc-metrica-valor">4:45</span>
          <span class="doc-metrica-rotulo">9 em cada 10</span>
          <span class="doc-metrica-nota">percentil 90</span>
        </div>
        <div class="doc-metrica">
          <span class="doc-metrica-valor">1:36 <small>a</small> 5:26</span>
          <span class="doc-metrica-rotulo">Faixa observada</span>
          <span class="doc-metrica-nota">a mais rápida e a mais lenta</span>
        </div>
        <div class="doc-metrica">
          <span class="doc-metrica-valor">18</span>
          <span class="doc-metrica-rotulo">Páginas no maior doc.</span>
          <span class="doc-metrica-nota">média de 5,3 páginas por matrícula</span>
        </div>
      </div>

      <p class="doc-procedencia">
        Números medidos, não estimados: são 27 análises concluídas em produção, calculadas sobre a
        diferença entre a criação e a conclusão de cada uma. Documentos maiores levam mais tempo — o
        custo e a duração crescem com o número de páginas.
      </p>

      <div class="nota">
        <p>
          <strong>A comparação honesta não é com um relógio.</strong> Uma análise de matrícula feita
          por gente não demora porque a pessoa é lenta: demora porque ler a cadeia dominial inteira,
          conferir cada averbação e cruzar o que foi cancelado com o que segue ativo é trabalho
          minucioso — e por isso costuma ser adiado, feito por amostragem ou reduzido ao cabeçalho.
          O ganho aqui não é substituir esse exame. É <strong>ele passar a caber em toda operação,
          e não só nas de maior valor</strong>, e chegar ao especialista já organizado, com as
          evidências apontadas.
        </p>
      </div>
    </section>

    <!-- ── Como usar ───────────────────────────────────────────────────── -->
    <section id="como-usar">
      <h2>Como usar</h2>

      <h3>Pelo painel</h3>
      <p>
        Em <a href="/matriculas">Ferramentas → Matrículas</a>, envie o PDF. O acompanhamento é ao
        vivo e o resultado abre na tela, com o parecer em texto e a opção de baixar em DOCX.
      </p>

      <h3>Em lote — até 10 de uma vez</h3>
      <p>
        Na mesma tela, selecione vários PDFs ou arraste todos juntos. A lista mostra o que vai
        ser enviado, com opção de tirar qualquer arquivo antes de confirmar. Depois do envio você
        cai numa página do lote que acompanha as análises lado a lado e se atualiza sozinha.
      </p>
      <p>
        <strong>O lote é tudo ou nada na hora de cobrar.</strong> Os arquivos são conferidos antes
        de qualquer débito: se um deles não for PDF, nenhuma análise é criada e a mensagem diz
        exatamente quais recusar. Se o total não couber no seu saldo, também não se cria nada — em
        vez de pagar por seis e descobrir no sétimo que acabou.
      </p>
      <p>
        Depois que o lote entra, cada análise segue por conta própria: uma que falhe tem só o
        próprio crédito estornado, sem afetar as outras.
      </p>

      <h3>Pela API</h3>
      <p>
        Para integrar ao seu sistema, a matrícula tem endpoint próprio — disponível nos planos
        Escritório e Enterprise:
      </p>
      <div class="bloco">
        <pre v-pre><code>curl -X POST https://lidimus.gvlar.com/api/v1/matriculas \
  -H "Authorization: Bearer $LIDIMUS_API_KEY" \
  -F "file=@matricula.pdf"</code></pre>
      </div>
      <p>
        Há também <code>/api/v1/matriculas/lote</code>, com a mesma garantia de cobrança da tela.
        O envio, o acompanhamento e o formato completo da resposta estão na
        <NuxtLink to="/docs/api#lote">documentação da API</NuxtLink>.
      </p>

      <h3>Opções de envio</h3>
      <table class="tabela">
        <thead><tr><th>Opção</th><th>Padrão</th><th>Efeito</th></tr></thead>
        <tbody>
          <tr>
            <td><code>incluirMemorial</code></td><td><code>true</code></td>
            <td>Gera também o memorial descritivo a partir do perímetro descrito na matrícula.</td>
          </tr>
          <tr>
            <td><code>incluirCroqui</code></td><td><code>false</code></td>
            <td>Desenha o perímetro. Veja <NuxtLink to="/docs/croqui">Croqui</NuxtLink>.</td>
          </tr>
          <tr>
            <td><code>geocodificar</code></td><td><code>true</code></td>
            <td>Busca as coordenadas do endereço e devolve latitude e longitude.</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ── O que recebe ────────────────────────────────────────────────── -->
    <section id="o-que-recebe">
      <h2>O que você recebe</h2>
      <p>
        No painel, o parecer montado em tela e o DOCX. Pela API, o mesmo conteúdo em JSON. Por fora,
        um resumo de leitura rápida; por dentro de <code>documento</code>, o parecer completo:
      </p>

      <div class="bloco">
        <pre v-pre><code>{
  "numero_matricula": "328135",
  "cartorio": "11º Cartório de Registro de Imóveis de São Paulo",
  "certidao_situacao": "desatualizada",
  "classificacao_risco": "indeterminado",
  "resumo_juridico": { "total_riscos": 5, "total_onus_ativos": 0 },
  "documento": {
    "imovel":          { "area_total_m2": "15712,00", "tem_onus": false },
    "proprietarios":   { "total": 1, "lista": [] },
    "onus":            { "total": 0, "ativos": [] },
    "historico_atos":  { "total": 0, "lista": [] },
    "analise_juridica": {}
  }
}</code></pre>
      </div>

      <p>
        <code>classificacao_risco</code> assume <code>critico</code>, <code>alto</code>,
        <code>medio</code>, <code>baixo</code>, <code>indeterminado</code> ou
        <code>nao_aplicavel</code>. Cada campo está descrito, um a um, na
        <NuxtLink to="/docs/api#resultado">seção do resultado da API</NuxtLink>.
      </p>

      <div class="aviso">
        <p>
          <strong><code>indeterminado</code> não significa “sem risco”.</strong> Significa que o
          documento não permitiu concluir — imagem parcial, só o anverso da ficha, PDF sem fé
          pública. Leia como “precisa de certidão melhor”, nunca como “liberado”.
        </p>
      </div>

      <div class="aviso">
        <p>
          <strong>Matrícula incompleta não recebe parecer.</strong> Quando o documento enviado tem
          menos páginas do que a certidão declara no rodapé, quando a numeração dos atos salta
          (R-02 direto para AV-08) ou quando um ato aparece citado sem estar transcrito, a análise
          devolve <code>matricula_incompleta: true</code> e organiza apenas os dados que constam das
          páginas recebidas. Não é falha de leitura do arquivo — são páginas que não vieram, e
          reprocessar não as traz. O caminho é pedir ao cartório a certidão de inteiro teor.
        </p>
      </div>

      <div class="aviso">
        <p>
          <strong>Valores ficam na moeda do documento.</strong> Uma compra de 1966 registrada em
          <code>Cr$ 12.000.000</code> sai assim, com o símbolo original — nunca convertida para
          real. Conversão sem data-base e índice declarados cria um número que não existe em
          documento nenhum.
        </p>
      </div>
    </section>

    <!-- ── Custo ───────────────────────────────────────────────────────── -->
    <section id="custo">
      <h2>Custo</h2>
      <p>
        <strong>83 créditos + 8 por página.</strong> Uma matrícula de 5 páginas custa 123 créditos;
        uma de 1 página, 91.
      </p>
      <p>
        A cobrança acontece no envio. <strong>Análise que falha é estornada automaticamente</strong>
        — o crédito volta para o saldo sem você precisar pedir.
      </p>
      <p>
        <strong>Lote não tem desconto nem taxa.</strong> Custa a soma das análises: dez matrículas
        de 1 página são 910 créditos, os mesmos 910 de dez envios avulsos. O que o lote poupa é
        tempo e a incerteza de descobrir no meio do caminho que o saldo acabou.
      </p>
      <p>
        A matrícula está incluída a partir do plano <strong>Essencial</strong>. Quem está no plano
        Croqui pode comprar análises avulsas sem trocar de plano.
      </p>
    </section>

    <!-- ── Limites ─────────────────────────────────────────────────────── -->
    <section id="limites">
      <h2>Limites — leia antes de decidir com base nisto</h2>
      <ul class="lista">
        <li>
          <strong>A análise vale o documento que recebeu.</strong> Se você enviar uma ficha
          incompleta ou uma imagem sem fé pública, o parecer aponta isso e limita as conclusões —
          mas não inventa o que não está no papel.
        </li>
        <li>
          <strong>Certidão tem prazo.</strong> O campo <code>certidao_situacao</code> avisa quando o
          documento está desatualizado. Um ônus averbado depois da emissão não aparece em lugar
          nenhum, por definição.
        </li>
        <li>
          <strong>Não substitui o parecer do advogado.</strong> Entrega o exame organizado, com as
          evidências apontadas e a base legal citada, para que a decisão profissional seja tomada
          sobre material conferido — e não sobre uma leitura corrida.
        </li>
        <li>
          <strong>Ônus ativo e histórico são coisas diferentes.</strong> Uma hipoteca cancelada
          aparece no histórico e não em <code>onus.ativos</code>. Confundir os dois é o erro que faz
          reprovar imóvel são — ou aprovar imóvel com penhora.
        </li>
      </ul>
    </section>
  </DocsPagina>
</template>
