<script setup lang="ts">
definePageMeta({ layout: false })

useHead({
  title: 'Memorial descritivo a partir de KML — Lidimus',
  meta: [
    {
      name: 'description',
      content:
        'Converte um arquivo KML em memorial descritivo pronto: vértices em SIRGAS 2000 e UTM, ' +
        'azimutes, distâncias, perímetro e área.',
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
  <DocsPagina titulo="Memorial descritivo" selo="Ferramenta" :secoes="SECOES">
    <p class="doc-lide">
      Você tem o polígono — desenhado no Google Earth, exportado do drone, entregue pelo topógrafo.
      Falta a peça escrita. Envie o KML e receba o memorial descritivo redigido: vértice a vértice,
      com azimute, distância, confrontante, perímetro e área.
    </p>

    <!-- ── Por que importa ─────────────────────────────────────────────── -->
    <section id="por-que">
      <h2>Por que importa</h2>

      <div class="doc-clipes">
        <div class="doc-clipe">
          <span class="doc-clipe-cat">Prazo legal</span>
          <p class="doc-clipe-manchete">Certificação no INCRA até 21/10/2029</p>
          <p class="doc-clipe-chamada">
            O Decreto 12.689/2025 prorrogou a obrigatoriedade da certificação da poligonal para
            outubro de 2029.
          </p>
          <p class="doc-clipe-fonte">
            <a
              href="https://www.conjur.com.br/2025-out-28/georreferenciamento-nao-e-certificacao-o-que-o-decreto-12-689-realmente-prorrogou/"
              target="_blank"
              rel="noopener noreferrer"
            >ConJur · out/2025</a>
          </p>
        </div>
        <div class="doc-clipe">
          <span class="doc-clipe-cat">A leitura errada</span>
          <p class="doc-clipe-manchete">O decreto adiou a certificação, não o georreferenciamento</p>
          <p class="doc-clipe-chamada">
            O levantamento continua exigido em desmembramento, parcelamento, remembramento e
            retificação de área. Quem entendeu “ficou para 2029” vai travar no cartório.
          </p>
          <p class="doc-clipe-fonte">ConJur · IRIB · out/2025</p>
        </div>
        <div class="doc-clipe">
          <span class="doc-clipe-cat">Escala</span>
          <p class="doc-clipe-manchete">1 milhão de imóveis certificados</p>
          <p class="doc-clipe-chamada">
            262 milhões de hectares no SIGEF — mais de 30% do território nacional já georreferenciado.
          </p>
          <p class="doc-clipe-fonte">
            <a
              href="https://www.gov.br/incra/pt-br/assuntos/noticias/sistema-de-gestao-fundiaria-chega-a-1-milhao-de-imoveis-rurais-certificados"
              target="_blank"
              rel="noopener noreferrer"
            >INCRA · 2023</a>
          </p>
        </div>
      </div>

      <div class="aviso">
        <p>
          <strong>A distinção do segundo recorte é a que mais causa prejuízo.</strong> Prorrogou-se
          o prazo da <em>certificação</em> da poligonal junto ao INCRA. O
          <em>georreferenciamento</em> em si segue exigido sempre que houver desmembramento,
          parcelamento, remembramento ou retificação de área — e sem a peça técnica o ato não entra
          no registro, decreto ou não.
        </p>
      </div>

      <p class="doc-procedencia">
        Some a isso o <NuxtLink to="/docs/croqui">SIG-RI</NuxtLink>, criado pelo Provimento CNJ
        195/2025: o registro passa a montar um mosaico georreferenciado das matrículas e a emitir
        alerta quando encontra sobreposição. Memorial bem redigido deixa de ser formalidade e vira
        o que permite ao imóvel entrar nesse mosaico sem conflito.
      </p>
    </section>

    <!-- ── O que faz ───────────────────────────────────────────────────── -->
    <section id="o-que-faz">
      <h2>O que faz</h2>
      <p>Do polígono do KML, calcula e redige:</p>
      <ul class="lista">
        <li>
          <strong>Vértices</strong> — cada um rotulado (P-01, P-02…), em latitude/longitude e em
          coordenadas UTM.
        </li>
        <li>
          <strong>Azimutes e distâncias</strong> — de cada vértice ao seguinte, com azimute em graus,
          minutos e segundos.
        </li>
        <li><strong>Perímetro e área</strong> — calculados sobre a projeção UTM.</li>
        <li><strong>Datum e fuso</strong> — SIRGAS 2000, com o fuso UTM identificado a partir da posição.</li>
        <li>
          <strong>O texto corrido</strong> — a descrição do perímetro na forma consagrada (“inicia-se
          a descrição deste perímetro no vértice P-01, de coordenadas…”), pronta para a peça.
        </li>
      </ul>
    </section>

    <!-- ── Tempo ───────────────────────────────────────────────────────── -->
    <section id="tempo">
      <h2>Quanto tempo leva</h2>
      <div class="doc-metricas">
        <div class="doc-metrica">
          <span class="doc-metrica-valor">48 <small>s</small></span>
          <span class="doc-metrica-rotulo">Mediana</span>
          <span class="doc-metrica-nota">do envio ao memorial pronto</span>
        </div>
        <div class="doc-metrica">
          <span class="doc-metrica-valor">56 <small>s</small></span>
          <span class="doc-metrica-rotulo">9 em cada 10</span>
          <span class="doc-metrica-nota">percentil 90</span>
        </div>
        <div class="doc-metrica">
          <span class="doc-metrica-valor">26 <small>a</small> 57 <small>s</small></span>
          <span class="doc-metrica-rotulo">Faixa observada</span>
          <span class="doc-metrica-nota">a mais rápida e a mais lenta</span>
        </div>
      </div>
      <p class="doc-procedencia">
        Medido sobre 6 memoriais concluídos em produção — amostra pequena, e por isso a faixa está
        aí junto: ela é mais honesta que a média isolada.
      </p>
      <p>
        O trabalho que isso substitui não é o levantamento — é a <strong>transcrição</strong>:
        converter coordenadas para UTM, calcular azimute e distância de cada lado, somar o
        perímetro e redigir tudo sem trocar um dígito. É trabalho de conferência repetitiva, e é
        exatamente onde o erro de digitação entra sem ninguém ver.
      </p>
    </section>

    <!-- ── Como usar ───────────────────────────────────────────────────── -->
    <section id="como-usar">
      <h2>Como usar</h2>
      <p>
        Em <a href="/kml">Ferramentas → Memoriais</a>, envie o arquivo <code>.kml</code> com o
        polígono do terreno. Os campos abaixo são opcionais e entram no texto do memorial:
      </p>

      <table class="tabela">
        <thead><tr><th>Campo</th><th>Efeito no memorial</th></tr></thead>
        <tbody>
          <tr><td><code>nomeImovel</code></td><td>Identificação do imóvel no cabeçalho.</td></tr>
          <tr><td><code>municipio</code></td><td>Município na localização.</td></tr>
          <tr><td><code>estado</code></td><td>Unidade federativa.</td></tr>
          <tr>
            <td><code>rua</code></td>
            <td>
              O logradouro com que o memorial abre. Em branco, o texto sai sem logradouro — o
              endereço não é adivinhado a partir das coordenadas.
            </td>
          </tr>
        </tbody>
      </table>

      <div class="nota">
        <p>
          O arquivo precisa ser <strong>KML</strong> (não KMZ, que é o KML compactado). No Google
          Earth, use “Salvar lugar como…” e escolha <code>.kml</code>. O memorial está incluído em
          todos os planos.
        </p>
      </div>
    </section>

    <!-- ── O que recebe ────────────────────────────────────────────────── -->
    <section id="o-que-recebe">
      <h2>O que você recebe</h2>
      <div class="bloco">
        <pre v-pre><code>{
  "datum": "SIRGAS 2000",
  "fuso_utm": "23S",
  "logradouro": "Rua Vergueiro",
  "area_m2": 3459.32,
  "perimetro_m": 235.71,
  "vertices": [
    { "label": "P-01", "lat": -23.56448, "lon": -46.65272,
      "utm_e": 331323.18, "utm_n": 7393017.46 }
  ],
  "segmentos": [
    { "de": "P-01", "ate": "P-02", "azimute": "121°15'58\"",
      "distancia_m": 56.53, "confrontante": "" }
  ],
  "descricao_perimetro": "Inicia-se a descrição deste perímetro no vértice P-01, de coordenadas…",
  "memorial_descritivo": "MEMORIAL DESCRITIVO\n\nIMÓVEL: Terreno\nLOCALIZAÇÃO: Rua Vergueiro…"
}</code></pre>
      </div>
      <p>
        <code>memorial_descritivo</code> é a peça inteira, pronta para copiar.
        <code>descricao_perimetro</code> é só o trecho do perímetro, para quem já tem o próprio
        modelo de documento e só quer a parte técnica.
      </p>
      <p>
        Os campos <code>vertices</code> e <code>segmentos</code> existem para quem vai conferir ou
        reprocessar: trazem os mesmos números do texto, em forma de dado.
      </p>
    </section>

    <!-- ── Custo ───────────────────────────────────────────────────────── -->
    <section id="custo">
      <h2>Custo</h2>
      <p>
        <strong>50 créditos por memorial</strong>, valor fixo — não varia com o número de vértices,
        porque o cálculo é geométrico e não depende do tamanho do documento.
      </p>
      <p>Memorial que falha é estornado automaticamente.</p>
    </section>

    <!-- ── Limites ─────────────────────────────────────────────────────── -->
    <section id="limites">
      <h2>Limites — leia antes de protocolar</h2>
      <div class="aviso">
        <p>
          <strong>Isto não é levantamento topográfico nem certificação.</strong> A peça é calculada a
          partir das coordenadas que <em>você</em> forneceu: a precisão do memorial é a precisão do
          KML de entrada. Um polígono desenhado à mão sobre imagem de satélite gera um memorial
          impecável na forma e sem valor técnico no conteúdo.
        </p>
        <p>
          Para certificação no INCRA, o levantamento precisa ser feito por profissional habilitado,
          com equipamento e precisão exigidos pela norma técnica, e a peça precisa ser assinada por
          ele — com ART ou TRT.
        </p>
      </div>
      <ul class="lista">
        <li>
          <strong>Confrontantes saem em branco</strong> quando o KML não os traz. Eles não são
          inferidos: nomear vizinho errado num memorial é pior que deixar o campo vazio.
        </li>
        <li>
          O datum é sempre <strong>SIRGAS 2000</strong>, o oficial no Brasil. KML usa WGS 84, que
          para efeitos práticos coincide.
        </li>
        <li>
          <strong>Um polígono por arquivo.</strong> Para várias glebas, envie um KML por gleba.
        </li>
      </ul>
    </section>
  </DocsPagina>
</template>
