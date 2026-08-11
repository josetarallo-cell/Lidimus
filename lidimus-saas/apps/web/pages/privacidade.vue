<script setup lang="ts">
// Política de Privacidade. Até agora não existia — e a cláusula 7 dos Termos já
// afirmava que "o tratamento dos dados de cadastro e de uso da plataforma é
// regido pela Política de Privacidade": o contrato incorporava um documento
// ausente. O art. 9º da LGPD exige que o titular saiba, antes do tratamento,
// finalidade, forma, duração, com quem se compartilha e como exercer direitos.
//
// Regra de manutenção: este texto descreve o que o código faz HOJE, não o que
// se pretende fazer. Retenção, suboperadores e cookies foram levantados do
// schema, do docker-compose e dos workflows do n8n. Ao mudar qualquer um dos
// três, esta página muda junto — política que descreve sistema imaginário é
// pior que política nenhuma, porque vira declaração falsa ao titular.
//
// ⚠ PENDÊNCIA: [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO] e [E-MAIL DO ENCARREGADO]
// seguem por preencher, como nos Termos. Aviso em desenvolvimento abaixo.

definePageMeta({ layout: false })

useHead({
  title: 'Política de Privacidade — Lidimus',
  meta: [
    {
      name: 'description',
      content:
        'Como o Lidimus trata dados pessoais: o que coletamos, com que base legal, ' +
        'cookies utilizados, com quem compartilhamos e como exercer seus direitos.',
    },
  ],
})

const SECOES = [
  { id: 'papeis', rotulo: 'Nossos dois papéis' },
  { id: 'dados', rotulo: 'Dados que tratamos' },
  { id: 'cookies', rotulo: 'Cookies e armazenamento' },
  { id: 'compartilhamento', rotulo: 'Com quem compartilhamos' },
  { id: 'retencao', rotulo: 'Por quanto tempo guardamos' },
  { id: 'direitos', rotulo: 'Seus direitos' },
  { id: 'seguranca', rotulo: 'Segurança' },
  { id: 'alteracoes', rotulo: 'Alterações' },
]

const LEGAIS = [
  { to: '/privacidade', rotulo: 'Privacidade' },
  { to: '/termos', rotulo: 'Termos de Uso' },
]

const emDesenvolvimento = import.meta.dev

// Mesma fonte de verdade do aceite dos Termos: a política descreve o registro
// gravado em terms_acceptances, então precisa citar a versão correspondente.
const VIGENCIA = '7 de agosto de 2026'
</script>

<template>
  <DocsPagina
    titulo="Política de Privacidade"
    :secoes="SECOES"
    :irmas="LEGAIS"
    titulo-nav="Legal"
  >
    <p v-if="emDesenvolvimento" class="pendencia">
      <strong>Pendência antes de publicar:</strong> preencher [RAZÃO SOCIAL], [CNPJ],
      [ENDEREÇO] e [E-MAIL DO ENCARREGADO], e nomear formalmente o encarregado (LGPD,
      arts. 9º, I e 41). Este aviso só aparece em desenvolvimento.
    </p>

    <p class="doc-lide">
      Vigente desde {{ VIGENCIA }}. Esta política explica quais dados pessoais o Lidimus trata,
      com que fundamento legal, por quanto tempo e com quem os compartilha. Ela complementa os
      <NuxtLink to="/termos">Termos e Condições de Uso</NuxtLink>.
    </p>

    <p>
      O controlador dos dados descritos aqui é <strong>[RAZÃO SOCIAL]</strong>, inscrita no CNPJ
      sob o nº <strong>[CNPJ]</strong>, com sede em <strong>[ENDEREÇO]</strong>. Encarregado pelo
      tratamento de dados pessoais (DPO): <strong>[E-MAIL DO ENCARREGADO]</strong>.
    </p>

    <!-- ── Papéis ──────────────────────────────────────────────────────── -->
    <section id="papeis">
      <h2>Nossos dois papéis</h2>
      <p>
        A distinção abaixo determina a quem você deve recorrer para cada tipo de pedido, e por
        isso vem antes de tudo.
      </p>
      <table class="tabela">
        <thead>
          <tr><th>Situação</th><th>Nosso papel</th><th>O que significa</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Seus dados de cadastro e de uso da plataforma</td>
            <td><strong>Controlador</strong></td>
            <td>
              Nós decidimos por que e como tratá-los. Pedidos sobre esses dados vêm direto
              para nós.
            </td>
          </tr>
          <tr>
            <td>Dados pessoais contidos nos documentos que você envia</td>
            <td><strong>Operador</strong></td>
            <td>
              Tratamos apenas para executar a análise que você pediu, seguindo sua instrução.
              Quem decide sobre esses dados é você — inclusive quanto à base legal para
              tratá-los.
            </td>
          </tr>
        </tbody>
      </table>
      <p class="dica">
        Na prática: uma matrícula imobiliária costuma trazer nome, CPF, estado civil, profissão e
        endereço de pessoas que não são você. Ao enviá-la, você declara ter base legal para esse
        tratamento — é a cláusula 2 dos Termos. Se um titular mencionado num documento nos
        procurar diretamente, nós o encaminharemos a você.
      </p>
    </section>

    <!-- ── Dados ───────────────────────────────────────────────────────── -->
    <section id="dados">
      <h2>Dados que tratamos, e com que base legal</h2>
      <table class="tabela">
        <thead>
          <tr><th>Categoria</th><th>Dados</th><th>Finalidade e base legal</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Cadastro</td>
            <td>Nome, e-mail, empresa, senha (armazenada como hash) e, no login pelo Google,
              nome, e-mail e foto do perfil</td>
            <td>Criar e manter sua conta — execução de contrato (art. 7º, V)</td>
          </tr>
          <tr>
            <td>Sessão e segurança</td>
            <td>Endereço IP, identificação do navegador (user-agent), data e hora de acesso</td>
            <td>Manter você autenticado, prevenir fraude e abuso — execução de contrato e
              legítimo interesse (art. 7º, V e IX)</td>
          </tr>
          <tr>
            <td>Aceite dos Termos</td>
            <td>Versão aceita, data, meio (e-mail ou Google), endereço IP e user-agent</td>
            <td>Comprovar o aceite e demonstrar conformidade — cumprimento de obrigação e
              legítimo interesse (art. 7º, II e IX)</td>
          </tr>
          <tr>
            <td>Documentos e análises</td>
            <td>Arquivo enviado, texto extraído por OCR e o relatório gerado — que podem conter
              dados pessoais de terceiros</td>
            <td>Executar a análise solicitada. Aqui atuamos como <strong>operador</strong>: a
              base legal é definida por você</td>
          </tr>
          <tr>
            <td>Uso e cobrança</td>
            <td>Créditos consumidos, análises realizadas, plano contratado, identificadores de
              cliente e assinatura no provedor de pagamento</td>
            <td>Faturamento e controle de consumo — execução de contrato e obrigação legal
              fiscal (art. 7º, V e II)</td>
          </tr>
          <tr>
            <td>Equipe</td>
            <td>E-mail do convidado, cargo informado, papel na organização</td>
            <td>Gerir o acesso da sua equipe — execução de contrato (art. 7º, V)</td>
          </tr>
        </tbody>
      </table>
      <p>
        Não tratamos dados pessoais sensíveis de forma deliberada, não fazemos perfilamento
        comportamental e não tomamos decisões automatizadas que produzam efeitos jurídicos sobre
        você. O resultado das análises é insumo para a sua decisão — nunca a substitui.
      </p>
      <p>
        <strong>Não vendemos dados pessoais</strong> e não os cedemos para publicidade de
        terceiros.
      </p>
    </section>

    <!-- ── Cookies ─────────────────────────────────────────────────────── -->
    <section id="cookies">
      <h2>Cookies e armazenamento no seu dispositivo</h2>
      <p>
        O Lidimus <strong>não usa cookies de publicidade, de análise de audiência ou de
        rastreamento entre sites</strong>. Não há Google Analytics, pixel de rede social,
        mapa de calor ou gravação de sessão. Todos os cookies abaixo são necessários para
        que a plataforma funcione ou permaneça segura — por isso se apoiam no legítimo
        interesse e na execução do contrato, e não em consentimento.
      </p>
      <table class="tabela">
        <thead>
          <tr><th>Cookie</th><th>Para que serve</th><th>Prazo</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>better-auth.session_token</code></td>
            <td>Mantém você autenticado entre uma página e outra. Sem ele, seria preciso
              refazer o login a cada clique.</td>
            <td>7 dias</td>
          </tr>
          <tr>
            <td><code>better-auth.state</code></td>
            <td>Protege o login pelo Google contra falsificação de requisição (CSRF).</td>
            <td>5 minutos</td>
          </tr>
          <tr>
            <td><code>ld_aceite_termos</code></td>
            <td>Leva o aceite dos Termos marcado no formulário até o servidor, inclusive
              quando o cadastro passa pelo Google.</td>
            <td>30 minutos</td>
          </tr>
          <tr>
            <td><code>ld_consentimento</code></td>
            <td>Registra que você já viu o aviso sobre cookies, para não repeti-lo a cada
              visita.</td>
            <td>1 ano</td>
          </tr>
          <tr>
            <td><code>__cf_bm</code>, <code>_cfuvid</code></td>
            <td>Definidos pela Cloudflare, que protege o site na borda: distinguem tráfego
              humano de automatizado e aplicam limites de requisição.</td>
            <td>Até 30 minutos / duração da sessão</td>
          </tr>
        </tbody>
      </table>
      <p>
        Ao inspecionar os cookies no navegador, os dois primeiros aparecem com o prefixo
        <code>__Secure-</code> — marca que impede o envio fora de conexão cifrada. Ambos são
        também <code>HttpOnly</code>: nenhum script consegue lê-los.
      </p>
      <p>
        Guardamos também, na memória local do navegador (<code>localStorage</code>), a chave
        <code>nuxt-color-mode</code>, com a preferência de tema da interface. Ela não identifica
        você e não é enviada aos nossos servidores.
      </p>
      <p class="dica">
        Você pode bloquear ou apagar cookies nas configurações do seu navegador. Como todos os
        nossos cookies são necessários, bloqueá-los impedirá o login e o uso da plataforma — não
        há como manter sessão autenticada sem cookie de sessão.
      </p>
      <p>
        Se um dia passarmos a usar cookies não necessários — de audiência ou de marketing —
        pediremos seu consentimento antes de ativá-los, com a opção de recusar em igual
        destaque, e esta seção será atualizada.
      </p>
    </section>

    <!-- ── Compartilhamento ────────────────────────────────────────────── -->
    <section id="compartilhamento">
      <h2>Com quem compartilhamos, e a transferência internacional</h2>
      <p>
        Para operar a plataforma recorremos a fornecedores que tratam dados por nossa conta e
        sob instrução. Vários deles ficam fora do Brasil, de modo que há
        <strong>transferência internacional de dados</strong> (LGPD, arts. 33 a 36), realizada
        para a execução do contrato firmado com você e mediante cláusulas contratuais de
        proteção oferecidas por esses fornecedores.
      </p>
      <table class="tabela">
        <thead>
          <tr><th>Fornecedor</th><th>O que trata</th><th>País</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Google Cloud (armazenamento e leitura de documentos)</td>
            <td>O arquivo enviado, para guarda temporária e extração de texto</td>
            <td>Estados Unidos</td>
          </tr>
          <tr>
            <td>Provedores de inteligência artificial (Anthropic, OpenAI, Mistral)</td>
            <td>O texto extraído do documento, para produzir a análise</td>
            <td>Estados Unidos e União Europeia</td>
          </tr>
          <tr>
            <td>Serviço de busca vetorial (Qdrant)</td>
            <td>Consultas derivadas do documento, para localizar fundamentação no material de
              referência</td>
            <td>União Europeia</td>
          </tr>
          <tr>
            <td>Google Maps</td>
            <td>Endereço do imóvel extraído da matrícula, para localização</td>
            <td>Estados Unidos</td>
          </tr>
          <tr>
            <td>Stripe e Asaas</td>
            <td>E-mail e identificadores de cobrança, para processar pagamentos</td>
            <td>Estados Unidos e Brasil</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>Seu e-mail e nome, para enviar mensagens transacionais (verificação, convites,
              redefinição de senha)</td>
            <td>Estados Unidos</td>
          </tr>
          <tr>
            <td>Cloudflare</td>
            <td>Tráfego de rede, para proteção e entrega do site</td>
            <td>Estados Unidos</td>
          </tr>
          <tr>
            <td>Sentry</td>
            <td>Registros técnicos de erro do servidor, para diagnóstico</td>
            <td>Estados Unidos</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Os documentos enviados não são utilizados para treinar modelos de inteligência
        artificial.</strong> Além dos fornecedores acima, só compartilhamos dados mediante
        determinação legal ou ordem de autoridade competente.
      </p>
    </section>

    <!-- ── Retenção ────────────────────────────────────────────────────── -->
    <section id="retencao">
      <h2>Por quanto tempo guardamos</h2>
      <table class="tabela">
        <thead>
          <tr><th>Dado</th><th>Prazo</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Arquivo enviado (o PDF ou KML em si)</td>
            <td>Apagado logo após a extração do texto. A política de ciclo de vida do
              armazenamento garante remoção em até 7 dias mesmo em caso de falha.</td>
          </tr>
          <tr>
            <td>Texto extraído e relatório gerado</td>
            <td>Enquanto a conta existir, para que você possa reabrir as análises. Ainda não há
              expurgo automático — veja a ressalva abaixo.</td>
          </tr>
          <tr>
            <td>Dados de cadastro</td>
            <td>Enquanto a conta existir</td>
          </tr>
          <tr>
            <td>Sessões</td>
            <td>Expiram em 7 dias</td>
          </tr>
          <tr>
            <td>Registro de aceite dos Termos</td>
            <td>Enquanto a conta existir, como prova do consentimento contratual</td>
          </tr>
          <tr>
            <td>Registros de crédito e cobrança</td>
            <td>Pelo prazo exigido pela legislação fiscal</td>
          </tr>
        </tbody>
      </table>
      <p class="dica">
        Transparência sobre uma limitação atual: o texto extraído e o relatório permanecem
        armazenados enquanto a conta existir, sem prazo automático de eliminação. Estamos
        implementando expurgo programado. Enquanto isso, você pode solicitar a exclusão de
        análises específicas pelo canal indicado abaixo, e nós as eliminaremos.
      </p>
    </section>

    <!-- ── Direitos ────────────────────────────────────────────────────── -->
    <section id="direitos">
      <h2>Seus direitos</h2>
      <p>A LGPD (arts. 17 a 22) garante a você, a qualquer momento:</p>
      <ul class="lista">
        <li>confirmar se tratamos seus dados e acessá-los;</li>
        <li>corrigir dados incompletos, inexatos ou desatualizados;</li>
        <li>pedir anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
        <li>solicitar a portabilidade a outro fornecedor;</li>
        <li>pedir a eliminação dos dados tratados com base em consentimento;</li>
        <li>saber com quem compartilhamos seus dados;</li>
        <li>revogar consentimento, quando for essa a base legal;</li>
        <li>opor-se a tratamento fundado em legítimo interesse.</li>
      </ul>
      <p>
        Nome, e-mail e empresa você altera direto em <NuxtLink to="/conta">Minha conta</NuxtLink>.
        Para os demais pedidos, escreva para <strong>[E-MAIL DO ENCARREGADO]</strong>: nós
        respondemos em até 15 dias.
      </p>
      <p class="dica">
        Também com transparência: a exclusão e a exportação completas da conta ainda são feitas
        manualmente pela nossa equipe, e não por um botão no painel. O pedido é atendido do
        mesmo jeito e no mesmo prazo — a automação está no nosso roteiro.
      </p>
      <p>
        Se entender que seu pedido não foi bem atendido, você pode reclamar à
        <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer">Autoridade
        Nacional de Proteção de Dados (ANPD)</a>.
      </p>
    </section>

    <!-- ── Segurança ───────────────────────────────────────────────────── -->
    <section id="seguranca">
      <h2>Segurança</h2>
      <p>
        Todo o tráfego trafega cifrado por TLS. Senhas são guardadas como hash, nunca em texto
        legível. As chaves de API são exibidas uma única vez e armazenadas apenas como hash. O
        acesso aos documentos exige autenticação e ocorre por endereço temporário e assinado. O
        banco de dados não é exposto à internet.
      </p>
      <p>
        Nenhuma medida elimina o risco por completo. Caso ocorra incidente de segurança com risco
        relevante aos seus direitos, comunicaremos você e a ANPD, nos termos do art. 48 da LGPD.
      </p>
    </section>

    <!-- ── Alterações ──────────────────────────────────────────────────── -->
    <section id="alteracoes">
      <h2>Alterações desta política</h2>
      <p>
        Podemos atualizar esta política para refletir mudanças na plataforma ou na legislação. A
        versão vigente estará sempre nesta página, com a data de vigência no topo. Alterações
        relevantes serão comunicadas por e-mail ou aviso no painel antes de passarem a valer.
      </p>
    </section>

    <template #rodape>
      <section class="doc-fim">
        <h2>Falar sobre seus dados</h2>
        <p>
          Encarregado pelo tratamento de dados pessoais:
          <strong>[E-MAIL DO ENCARREGADO]</strong>. Para dúvidas sobre o contrato, veja os
          <NuxtLink to="/termos">Termos e Condições de Uso</NuxtLink>.
        </p>
      </section>
    </template>
  </DocsPagina>
</template>

<style scoped>
/* Tokens de alerta jurídico do sistema (--ld-carimbo-*), os mesmos usados em
   TermosTexto.vue para a pendência equivalente. */
.pendencia {
  margin: 0 0 var(--ld-space-lg);
  padding: var(--ld-space-sm) var(--ld-space-md);
  border: 1px solid var(--ld-carimbo);
  background: var(--ld-carimbo-selo);
  color: var(--ld-carimbo-tinta);
  font-size: 0.8125rem;
  line-height: 1.5;
  max-width: 70ch;
}
</style>
