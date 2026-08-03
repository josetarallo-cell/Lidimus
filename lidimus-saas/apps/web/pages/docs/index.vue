<script setup lang="ts">
definePageMeta({ layout: false })

useHead({
  title: 'Documentação — Lidimus',
  meta: [
    {
      name: 'description',
      content:
        'Como funciona cada ferramenta do Lidimus: análise de matrícula, croqui, memorial ' +
        'descritivo e detector de conteúdo oculto — com tempos medidos, formatos e limites.',
    },
    { name: 'robots', content: 'noindex, follow' },
  ],
})

const SECOES = [
  { id: 'ferramentas', rotulo: 'As ferramentas' },
  { id: 'comum', rotulo: 'O que é comum a todas' },
  { id: 'tempos', rotulo: 'Tempos medidos' },
]
</script>

<template>
  <!-- sem selo: ao lado do próprio logo, "Lidimus" seria repetição -->
  <DocsPagina titulo="Documentação" :secoes="SECOES">
    <p class="doc-lide">
      Quatro ferramentas, uma conta e um saldo de créditos. Cada página abaixo explica o que a
      ferramenta faz, quanto tempo leva de verdade, o que ela devolve e — igualmente importante —
      onde ela não vai.
    </p>

    <!-- ── Ferramentas ─────────────────────────────────────────────────── -->
    <section id="ferramentas">
      <h2>As ferramentas</h2>

      <div class="doc-cartoes">
        <NuxtLink to="/docs/matriculas" class="doc-cartao">
          <h2>Análise de matrícula</h2>
          <p>
            Parecer completo do imóvel: cadeia dominial, proprietários, ônus ativos, riscos
            classificados e fundamentação legal. Uma por vez ou até dez em lote.
          </p>
          <span class="doc-cartao-meta">~3 min · 83 + 8/página · plano Essencial</span>
        </NuxtLink>

        <NuxtLink to="/docs/croqui" class="doc-cartao">
          <h2>Croqui do imóvel</h2>
          <p>
            Transforma a descrição do perímetro escrita na matrícula em desenho, com segmentos,
            medidas e confrontantes.
          </p>
          <span class="doc-cartao-meta">~13 s · 12 + 3/página · todos os planos</span>
        </NuxtLink>

        <NuxtLink to="/docs/memorial" class="doc-cartao">
          <h2>Memorial descritivo</h2>
          <p>
            De um arquivo KML para a peça escrita: vértices em SIRGAS 2000 e UTM, azimutes,
            distâncias, perímetro e área.
          </p>
          <span class="doc-cartao-meta">~48 s · 50 créditos · todos os planos</span>
        </NuxtLink>

        <NuxtLink to="/docs/detector" class="doc-cartao">
          <h2>Detector de conteúdo oculto</h2>
          <p>
            Procura instruções escondidas em PDFs antes que o documento chegue a uma inteligência
            artificial.
          </p>
          <span class="doc-cartao-meta">~4 s · 3 + 0,5/página · todos os planos</span>
        </NuxtLink>

        <NuxtLink to="/docs/api" class="doc-cartao">
          <h2>API</h2>
          <p>
            Integre o Lidimus ao seu sistema: envie matrículas — uma ou em lote — e receba o parecer
            em JSON, sem passar pelo painel.
          </p>
          <span class="doc-cartao-meta">Escritório e Enterprise</span>
        </NuxtLink>
      </div>
    </section>

    <!-- ── Comum ───────────────────────────────────────────────────────── -->
    <section id="comum">
      <h2>O que é comum a todas</h2>
      <ul class="lista">
        <li>
          <strong>Créditos.</strong> Um saldo só, da organização, consumido por qualquer ferramenta.
          O custo de cada análise aparece antes de confirmar, e o saldo fica em
          <a href="/conta/creditos">Conta → Créditos</a>.
        </li>
        <li>
          <strong>Análise que falha é estornada.</strong> Automaticamente, sem pedido — se o
          processamento termina em erro, o crédito volta.
        </li>
        <li>
          <strong>Nada fica guardado além do necessário.</strong> O arquivo enviado é apagado depois
          do processamento; o resultado permanece no histórico da sua organização.
        </li>
        <li>
          <strong>A equipe compartilha.</strong> Análises e saldo são da empresa, não da pessoa —
          quem você convidar em <a href="/conta/equipe">Conta → Equipe</a> vê o mesmo histórico.
        </li>
      </ul>
    </section>

    <!-- ── Tempos ──────────────────────────────────────────────────────── -->
    <section id="tempos">
      <h2>Tempos medidos</h2>
      <p>
        Não são estimativas nem promessas comerciais: são as análises reais já processadas,
        medidas do envio à conclusão.
      </p>

      <table class="tabela">
        <thead>
          <tr>
            <th>Ferramenta</th><th>Mediana</th><th>9 em cada 10</th><th>Faixa</th><th>Amostra</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><NuxtLink to="/docs/matriculas">Matrícula</NuxtLink></td>
            <td>3 min</td><td>4 min 45 s</td><td>1:36 – 5:26</td><td>27 análises</td>
          </tr>
          <tr>
            <td><NuxtLink to="/docs/memorial">Memorial</NuxtLink></td>
            <td>48 s</td><td>56 s</td><td>26 – 57 s</td><td>6 memoriais</td>
          </tr>
          <tr>
            <td><NuxtLink to="/docs/croqui">Croqui</NuxtLink></td>
            <td>13 s</td><td>22 s</td><td>10 – 33 s</td><td>10 croquis</td>
          </tr>
          <tr>
            <td><NuxtLink to="/docs/detector">Detector</NuxtLink></td>
            <td>4 s</td><td>6 s</td><td>1 – 12 s</td><td>15 verificações</td>
          </tr>
        </tbody>
      </table>

      <p class="doc-procedencia">
        As amostras ainda são pequenas, e por isso a faixa observada está na tabela junto com a
        mediana: ela mostra a variação real melhor do que uma média isolada mostraria. A matrícula é
        a única cujo tempo cresce visivelmente com o tamanho do documento — as demais operam sobre
        entradas de tamanho parecido.
      </p>
    </section>
  </DocsPagina>
</template>
