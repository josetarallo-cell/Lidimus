<script setup lang="ts">
definePageMeta({ layout: false })

// Saída real do motor de desenho (packages/croqui) sobre um croqui de teste.
// A geometria é autêntica; matrícula, logradouro e confrontantes foram trocados
// por genéricos — a página é pública e a forma é o que ilustra, não o endereço
// de um imóvel identificável.
import croquiExemplo from '~/assets/imagens/croqui-exemplo.svg'

useHead({
  title: 'Croqui do imóvel — Lidimus',
  meta: [
    {
      name: 'description',
      content:
        'Transforma a descrição do perímetro escrita na matrícula em desenho: segmentos, ' +
        'confrontantes, azimutes e área, em cerca de treze segundos.',
    },
    { name: 'robots', content: 'noindex, follow' },
  ],
})

const SECOES = [
  { id: 'por-que', rotulo: 'Por que importa' },
  { id: 'o-que-faz', rotulo: 'O que faz' },
  { id: 'tempo', rotulo: 'Quanto tempo leva' },
  { id: 'como-usar', rotulo: 'Como usar' },
  { id: 'o-que-recebe', rotulo: 'O que você recebe' },
  { id: 'custo', rotulo: 'Custo' },
  { id: 'limites', rotulo: 'Limites' },
]
</script>

<template>
  <DocsPagina titulo="Croqui do imóvel" selo="Ferramenta" :secoes="SECOES">
    <p class="doc-lide">
      A matrícula descreve o terreno por extenso — “deste ponto segue em reta por 7,50 m confrontando
      com o prédio nº 50, daí deflete à direita…”. O croqui lê essa descrição e devolve a geometria:
      segmentos, medidas, confrontantes e o desenho fechado.
    </p>

    <div class="aviso">
      <p>
        <strong>O croqui é uma representação visual de um texto — e nada além disso.</strong> Ele
        desenha o que a matrícula descreve por escrito, para que a descrição possa ser conferida com
        os olhos em vez de imaginada. <strong>É apenas ilustrativo:</strong> não é planta, não é
        levantamento, não tem valor técnico e não serve para instruir ato registral.
      </p>
    </div>

    <figure class="croqui-figura">
      <img :src="croquiExemplo" alt="Croqui de um terreno retangular de 7,50 m de frente por 20,00 m
        de profundidade, com os confrontantes de cada lado, escala e área de 150,00 m²" />
      <figcaption>
        Saída real da ferramenta, sobre um terreno de teste. O próprio desenho declara a precisão
        obtida — aqui, <code>aproximada</code>. Identificação do imóvel trocada por genéricos.
      </figcaption>
    </figure>

    <!-- ── Por que importa ─────────────────────────────────────────────── -->
    <section id="por-que">
      <h2>Por que importa</h2>
      <p>
        Descrição de perímetro é texto jurídico, não desenho. Duas pessoas lendo o mesmo parágrafo
        chegam a polígonos diferentes — e ninguém percebe até o imóvel travar no cartório.
      </p>

      <div class="doc-clipes">
        <div class="doc-clipe">
          <span class="doc-clipe-cat">Novo paradigma</span>
          <p class="doc-clipe-manchete">A matrícula ganha dimensão geoespacial</p>
          <p class="doc-clipe-chamada">
            O Provimento CNJ 195/2025 cria o SIG-RI: um mosaico georreferenciado das matrículas,
            montado a partir das coordenadas nelas contidas.
          </p>
          <p class="doc-clipe-fonte">
            <a
              href="https://atos.cnj.jus.br/atos/detalhar/6151"
              target="_blank"
              rel="noopener noreferrer"
            >Provimento CN-CNJ 195, de 3/6/2025</a>
          </p>
        </div>
        <div class="doc-clipe">
          <span class="doc-clipe-cat">O que o sistema procura</span>
          <p class="doc-clipe-manchete">Alerta de sobreposição de áreas</p>
          <p class="doc-clipe-chamada">
            Registradores passam a emitir relatórios e alertas quando encontram sobreposição ou
            inconsistência na descrição do imóvel — instrumento contra grilagem.
          </p>
          <p class="doc-clipe-fonte">
            <a
              href="https://www.anoreg.org.br/site/geotecnologia-no-registro-de-imoveis-provimento-cnj-195-2025-institui-mapeamento-digital-das-matriculas/"
              target="_blank"
              rel="noopener noreferrer"
            >Anoreg/BR · 2025</a>
          </p>
        </div>
        <div class="doc-clipe">
          <span class="doc-clipe-cat">A consequência</span>
          <p class="doc-clipe-manchete">Perímetro que não fecha vira exigência</p>
          <p class="doc-clipe-chamada">
            Se a descrição não é conferível, a inconsistência aparece na análise registral — melhor
            descobrir antes de protocolar.
          </p>
          <p class="doc-clipe-fonte">
            <a
              href="https://www.irib.org.br/noticias/detalhes/geotecnologia-no-registro-de-imoveis-provimento-cnj-195-2025-institui-mapeamento-digital-das-matriculas"
              target="_blank"
              rel="noopener noreferrer"
            >IRIB · SIG-RI, interoperável com SIGEF e CAR · 2025</a>
          </p>
        </div>
      </div>

      <p class="doc-procedencia">
        O ponto prático: enquanto a descrição estiver só em prosa, ninguém confere. Desenhada, ela
        passa a ser verificável — dá para ver se fecha, se a área bate com a declarada e se os
        confrontantes fazem sentido.
      </p>
    </section>

    <!-- ── O que faz ───────────────────────────────────────────────────── -->
    <section id="o-que-faz">
      <h2>O que faz</h2>
      <p>
        Localiza o trecho da matrícula que descreve o perímetro, interpreta cada segmento e monta o
        polígono. O desenho sai em SVG — <strong>apenas ilustrativo</strong>, para conferência
        visual e para anexar a um relatório interno, nunca como peça técnica.
      </p>
      <ul class="lista">
        <li>
          <strong>Segmentos</strong> — cada lado com origem, destino, distância, confrontante e,
          quando a matrícula informa, azimute, rumo, ângulo interno ou deflexão.
        </li>
        <li><strong>Curvas</strong> — trechos em arco, com raio e desenvolvimento.</li>
        <li>
          <strong>Área</strong> — a declarada na matrícula e, quando os dados permitem fechar o
          polígono, a calculada a partir da geometria. Divergência entre as duas é sinal de
          retificação a fazer.
        </li>
        <li><strong>Sentido</strong> — horário ou anti-horário, como a descrição foi redigida.</li>
        <li>
          <strong>Observações</strong> — o que ficou ambíguo no texto: medidas “mais ou menos”,
          confrontante sem identificação, lado sem medida.
        </li>
      </ul>
    </section>

    <!-- ── Tempo ───────────────────────────────────────────────────────── -->
    <section id="tempo">
      <h2>Quanto tempo leva</h2>
      <div class="doc-metricas">
        <div class="doc-metrica">
          <span class="doc-metrica-valor">13 <small>s</small></span>
          <span class="doc-metrica-rotulo">Mediana</span>
          <span class="doc-metrica-nota">reaproveitando matrícula já lida</span>
        </div>
        <div class="doc-metrica">
          <span class="doc-metrica-valor">22 <small>s</small></span>
          <span class="doc-metrica-rotulo">9 em cada 10</span>
          <span class="doc-metrica-nota">percentil 90</span>
        </div>
        <div class="doc-metrica">
          <span class="doc-metrica-valor">10 <small>a</small> 33 <small>s</small></span>
          <span class="doc-metrica-rotulo">Faixa observada</span>
          <span class="doc-metrica-nota">a mais rápida e a mais lenta</span>
        </div>
      </div>
      <p class="doc-procedencia">
        Medido sobre 10 croquis concluídos em produção. Enviando um PDF novo, some o tempo da
        leitura óptica do documento — some cerca de um a dois minutos.
      </p>
    </section>

    <!-- ── Como usar ───────────────────────────────────────────────────── -->
    <section id="como-usar">
      <h2>Como usar</h2>
      <p>Há dois caminhos, e o segundo é bem mais barato.</p>

      <h3>1. A partir de uma matrícula já analisada</h3>
      <p>
        Se você já rodou a <NuxtLink to="/docs/matriculas">análise de matrícula</NuxtLink>, o texto
        do documento já foi lido. O croqui reaproveita essa leitura, sem lê-lo de novo — é o caminho
        rápido e de custo mínimo. No painel, o botão aparece na própria tela do resultado.
      </p>

      <h3>2. Enviando o PDF direto</h3>
      <p>
        Envie a matrícula em <a href="/croqui">Ferramentas → Croqui</a>. O documento passa por
        leitura óptica antes do desenho, e a cobrança é por página.
      </p>

      <div class="nota">
        <p>
          O croqui está incluído em <strong>todos os planos</strong>, inclusive o de entrada — é a
          ferramenta mais barata do catálogo, e não exige assinatura de nível superior.
        </p>
      </div>
    </section>

    <!-- ── O que recebe ────────────────────────────────────────────────── -->
    <section id="o-que-recebe">
      <h2>O que você recebe</h2>
      <div class="bloco">
        <pre v-pre><code>{
  "croqui_viavel": true,
  "formato": "retangular_4lados",
  "numero_matricula": "52488",
  "rua_frente": "Rua Leme da Silva",
  "testada": 7.5,
  "profundidade": 20,
  "area_descrita_m2": 150,
  "area_calculada_m2": null,
  "sentido_descricao": "horario",
  "precisao": "aproximada",
  "segmentos": [
    {
      "de": "frente",
      "ate": "lateral_direita",
      "tipo": "reta",
      "distancia": 7.5,
      "confrontante": "prédio nº 50",
      "azimute_raw": null,
      "raio_m": null
    }
  ],
  "observacoes": "Medidas descritas como 'mais ou menos'. Frente e fundos sem azimute."
}</code></pre>
      </div>

      <table class="tabela">
        <thead><tr><th>Campo</th><th>Para que serve</th></tr></thead>
        <tbody>
          <tr>
            <td><code>croqui_viavel</code></td>
            <td>
              Se <code>false</code>, a descrição não tinha dados suficientes para fechar o polígono.
              <strong>Confira este campo antes de usar o resto.</strong>
            </td>
          </tr>
          <tr>
            <td><code>precisao</code></td>
            <td>
              Qualidade da geometria obtida. <code>aproximada</code> quer dizer que o desenho serve
              para conferência visual, não para levantamento.
            </td>
          </tr>
          <tr>
            <td><code>area_descrita_m2</code></td>
            <td>A área que a matrícula declara.</td>
          </tr>
          <tr>
            <td><code>area_calculada_m2</code></td>
            <td>
              A área que a geometria produz. <code>null</code> quando faltam medidas. Se as duas
              existirem e divergirem, há o que investigar.
            </td>
          </tr>
          <tr>
            <td><code>observacoes</code></td>
            <td>O que ficou ambíguo no texto original. Leia sempre.</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ── Custo ───────────────────────────────────────────────────────── -->
    <section id="custo">
      <h2>Custo</h2>
      <table class="tabela">
        <thead><tr><th>Caminho</th><th>Custo</th></tr></thead>
        <tbody>
          <tr>
            <td>Reaproveitando matrícula já analisada</td>
            <td><strong>15 créditos</strong> — cobra o mínimo, porque não há leitura nova</td>
          </tr>
          <tr>
            <td>Enviando o PDF</td>
            <td><strong>12 + 3 por página.</strong> Uma matrícula de 3 páginas: 21 créditos</td>
          </tr>
        </tbody>
      </table>
      <p>Croqui que falha é estornado automaticamente.</p>
    </section>

    <!-- ── Limites ─────────────────────────────────────────────────────── -->
    <section id="limites">
      <h2>Limites</h2>
      <div class="aviso">
        <p>
          <strong>Apenas ilustrativo. Não é levantamento topográfico e não substitui um.</strong> O
          croqui é a leitura de um texto: a descrição que está escrita na matrícula. Se a descrição
          estiver errada, o desenho reproduz o erro fielmente e com a mesma aparência de correção.
          Para retificação, georreferenciamento ou certificação, o trabalho é de profissional
          habilitado, em campo, com peça assinada.
        </p>
        <p>
          Ele não mede o terreno, não vai a campo, não confere o que existe no lugar — desenha o que
          o papel diz. É por isso que serve para <em>conferir</em> a descrição, e não para
          <em>provar</em> a área.
        </p>
      </div>
      <ul class="lista">
        <li>
          Matrículas antigas costumam descrever o perímetro sem azimutes, só com distâncias e
          confrontantes. O desenho sai, mas com <code>precisao: "aproximada"</code>.
        </li>
        <li>
          Descrição incompleta — lado sem medida, perímetro que não fecha — resulta em
          <code>croqui_viavel: false</code>, com o motivo em <code>observacoes</code>.
        </li>
        <li>
          O croqui ainda não está exposto na API pública; hoje roda pelo painel. Veja a
          <NuxtLink to="/docs/api">documentação da API</NuxtLink> para o que já está disponível.
        </li>
      </ul>
    </section>
  </DocsPagina>
</template>
