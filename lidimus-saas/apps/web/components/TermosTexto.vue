<script setup lang="ts">
// Corpo dos Termos e Condições de Uso, e só ele: sem cabeçalho, sem botão,
// sem moldura. Existe para que o modal do cadastro (TermosModal.vue) e a
// página pública (/termos) mostrem exatamente o mesmo texto.
//
// Duas cópias do texto seriam pior que inconveniente: o aceite gravado em
// terms_acceptances aponta para VERSAO_TERMOS, e a prova só vale se houver um
// único texto correspondendo àquela versão. Se as cópias divergissem, o
// registro passaria a atestar algo que ninguém leu.
//
// ⚠ PENDÊNCIA JURÍDICA: os marcadores [RAZÃO SOCIAL], [CNPJ], [CIDADE/UF] e
// [E-MAIL DE CONTATO] abaixo continuam por preencher. Enquanto estiverem
// assim, o contrato não identifica o controlador — exigência do art. 9º, I da
// LGPD — e usuários seguem aceitando um instrumento sem parte identificada.
// O aviso vermelho renderizado em desenvolvimento existe para isso não passar
// batido; ele não aparece para o usuário final.

const emDesenvolvimento = import.meta.dev
</script>

<template>
  <div class="tt">
    <p v-if="emDesenvolvimento" class="tt-pendencia">
      <strong>Pendência antes de publicar:</strong> preencher [RAZÃO SOCIAL], [CNPJ],
      [CIDADE/UF] e [E-MAIL DE CONTATO]. Sem isso o contrato não identifica o controlador
      (LGPD, art. 9º, I). Este aviso só aparece em desenvolvimento.
    </p>

    <p class="tt-abertura">
      Estes Termos regem o uso da plataforma Lidimus, oferecida por
      <strong>[RAZÃO SOCIAL]</strong>, inscrita no CNPJ sob o nº <strong>[CNPJ]</strong>
      ("Lidimus"). Ao criar uma conta, você declara que leu, compreendeu e concorda
      integralmente com o que segue. Se não concordar, não crie a conta e não utilize a
      plataforma.
    </p>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">1. O que o Lidimus é — e o que não é</h3>
      <p>
        O Lidimus é uma <strong>ferramenta de apoio à análise documental</strong>. A plataforma
        recebe documentos enviados pelo usuário — matrículas e certidões imobiliárias, arquivos
        KML, PDFs em geral — e devolve leituras, relatórios técnicos estruturados, memoriais, croquis e
        alertas produzidos por sistemas automatizados, incluindo modelos de inteligência
        artificial.
      </p>
      <p>
        O resultado <strong>não é parecer jurídico, laudo técnico, certidão, nem substitui a
        análise de profissional habilitado</strong> (advogado, registrador, engenheiro,
        arquiteto ou agrimensor). O uso da plataforma não cria relação de advogado e cliente,
        nem vínculo de responsabilidade técnica de qualquer natureza. Toda decisão tomada a
        partir do resultado é decisão exclusiva do usuário.
      </p>
    </section>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">2. Responsabilidade sobre os documentos enviados</h3>
      <p>
        <strong>O Lidimus não se responsabiliza pelos documentos enviados pelo usuário: apenas
        os analisa.</strong> A plataforma não os produz, não os emite, não os autentica e não
        atesta sua veracidade, autenticidade, integridade, vigência ou validade jurídica.
      </p>
      <p>O usuário é o único responsável por garantir que:</p>
      <ul class="tt-lista">
        <li>
          é titular do documento ou tem autorização legítima de quem o seja para enviá-lo à
          análise;
        </li>
        <li>
          o documento foi obtido por meio lícito e sua utilização não viola sigilo, contrato,
          dever profissional ou direito de terceiros;
        </li>
        <li>
          o arquivo enviado está completo, legível e corresponde à via atualizada do documento
          — arquivo truncado, ilegível, desatualizado ou adulterado produz resultado
          igualmente comprometido;
        </li>
        <li>
          há base legal para o tratamento dos dados pessoais eventualmente contidos no
          documento, nos termos da Lei nº 13.709/2018 (LGPD).
        </li>
      </ul>
      <p>
        O usuário responde, ainda, perante o Lidimus e terceiros, por qualquer reclamação,
        perda ou dano decorrente do envio de documento em desacordo com esta cláusula.
      </p>
    </section>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">3. Natureza automatizada do resultado</h3>
      <p>
        As análises são geradas por processamento automatizado e por modelos de inteligência
        artificial, que <strong>podem conter erros, omissões, leituras equivocadas ou
        interpretações incompletas</strong>, especialmente diante de documentos manuscritos,
        digitalizações de baixa qualidade, textos ilegíveis ou redações atípicas.
      </p>
      <p>
        <strong>A conferência do resultado contra o documento original é obrigação do
        usuário</strong> e condição para qualquer uso profissional. O Lidimus não garante a
        exatidão, a completude ou a adequação do resultado a uma finalidade específica, e não
        responde por decisão negocial, registral, processual ou financeira tomada com base
        nele.
      </p>
    </section>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">4. Conta, acesso e equipe</h3>
      <p>
        O cadastro exige informações verdadeiras e atualizadas. As credenciais de acesso e as
        chaves de API são pessoais e intransferíveis: o usuário responde por toda atividade
        realizada em sua conta, inclusive por quem ele convidar para a organização, e deve
        comunicar imediatamente qualquer uso não autorizado.
      </p>
      <p>
        Contas de organização permitem o convite de membros. O titular da organização responde
        pelos envios de sua equipe e pelo consumo de créditos correspondente.
      </p>
    </section>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">5. Planos, créditos e cobrança</h3>
      <p>
        O uso das ferramentas consome créditos, debitados conforme o volume processado — em
        regra, por página de documento. O custo é exibido antes de cada envio e o saldo fica
        visível no painel.
      </p>
      <p>
        Créditos não constituem moeda, não são conversíveis em dinheiro e não são
        transferíveis entre contas. <strong>Créditos consumidos em análises efetivamente
        processadas não são reembolsáveis</strong>, ainda que o resultado desagrade o usuário
        — o que se cobra é o processamento, não o desfecho da análise. Falha atribuível à
        plataforma que impeça a entrega do resultado enseja estorno dos créditos
        correspondentes.
      </p>
      <p>
        Assinaturas são renovadas automaticamente até que o usuário as cancele, com efeito ao
        fim do ciclo vigente. Preços e franquias podem ser alterados mediante aviso prévio.
      </p>
    </section>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">6. Uso permitido e condutas vedadas</h3>
      <p>A conta é para uso profissional e legítimo. É vedado ao usuário:</p>
      <ul class="tt-lista">
        <li>enviar documento para o qual não tenha autorização de uso;</li>
        <li>
          utilizar a plataforma para fim ilícito, fraudulento ou que viole direito de
          terceiros;
        </li>
        <li>
          tentar burlar limites de uso, cotas ou controles de crédito, inclusive por
          automação não autorizada;
        </li>
        <li>
          realizar engenharia reversa, extração massiva de conteúdo, ou reproduzir a
          plataforma para oferecer serviço concorrente;
        </li>
        <li>
          apresentar o resultado a terceiros como se fosse manifestação, certificação ou
          parecer emitido pelo Lidimus.
        </li>
      </ul>
      <p>
        O descumprimento autoriza a suspensão ou o encerramento imediato da conta, sem
        prejuízo das medidas cabíveis.
      </p>
    </section>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">7. Documentos, dados pessoais e privacidade</h3>
      <p>
        Os documentos enviados pertencem ao usuário e são utilizados exclusivamente para
        executar a análise solicitada. Os arquivos ficam armazenados por período limitado,
        necessário ao processamento e à consulta do resultado, e depois são excluídos
        automaticamente.
      </p>
      <p>
        Para executar a análise, o Lidimus recorre a subprocessadores de infraestrutura e de
        inteligência artificial, sob obrigação contratual de confidencialidade.
        <strong>Os documentos enviados não são utilizados para treinar modelos de
        IA.</strong>
      </p>
      <p>
        No tratamento dos dados pessoais contidos nos documentos, o usuário atua como
        controlador e o Lidimus como operador, nos termos da LGPD. O tratamento dos dados de
        cadastro e de uso da plataforma é regido pela
        <!-- Nova aba de propósito: este texto também é renderizado dentro do
             modal do cadastro, e navegar dali descartaria o formulário já
             preenchido — o motivo de o modal existir. -->
        <NuxtLink to="/privacidade" target="_blank" class="tt-link">
          Política de Privacidade</NuxtLink>, que complementa estes Termos.
      </p>
    </section>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">8. Disponibilidade do serviço</h3>
      <p>
        A plataforma é oferecida <strong>no estado em que se encontra</strong>. O Lidimus não
        garante funcionamento ininterrupto ou livre de falhas e pode realizar manutenções,
        atualizações e ajustes nas ferramentas, com aviso sempre que possível. Interrupções de
        terceiros — provedores de nuvem, serviços de IA, sistemas de origem dos documentos —
        estão fora do controle da plataforma.
      </p>
    </section>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">9. Limitação de responsabilidade</h3>
      <p>
        Na máxima extensão permitida pela lei, o Lidimus não responde por lucros cessantes,
        perda de negócio, perda de chance, danos indiretos ou por decisões tomadas com base no
        conteúdo das análises. A responsabilidade total do Lidimus, por qualquer causa,
        limita-se ao valor efetivamente pago pelo usuário nos 12 meses anteriores ao fato
        gerador.
      </p>
      <p>
        Nada nestes Termos exclui responsabilidades que a lei considere inafastáveis,
        inclusive as decorrentes do Código de Defesa do Consumidor quando aplicável.
      </p>
    </section>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">10. Propriedade intelectual</h3>
      <p>
        A plataforma, seu código, marca, identidade visual, textos e metodologia de análise
        pertencem ao Lidimus. O usuário mantém a titularidade dos documentos que envia e pode
        usar livremente os resultados gerados em seu trabalho profissional.
      </p>
    </section>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">11. Vigência, alterações e encerramento</h3>
      <p>
        Estes Termos vigoram enquanto a conta existir. O Lidimus pode alterá-los, publicando a
        versão atualizada com nova data de vigência; alterações relevantes serão comunicadas e
        o uso continuado após o aviso significa concordância. O usuário pode encerrar a conta
        a qualquer momento; o Lidimus pode encerrá-la em caso de descumprimento destes Termos
        ou de inadimplência.
      </p>
    </section>

    <section class="tt-secao">
      <h3 class="cond tt-secao-titulo">12. Lei aplicável e foro</h3>
      <p>
        Aplica-se a legislação brasileira. Fica eleito o foro da comarca de
        <strong>[CIDADE/UF]</strong> para dirimir controvérsias, salvo hipótese legal diversa.
      </p>
      <p class="tt-contato">
        Dúvidas sobre estes Termos: <strong>[E-MAIL DE CONTATO]</strong>.
      </p>
    </section>
  </div>
</template>

<style scoped>
/* Estes estilos vinham de TermosModal.vue e precisaram vir junto: CSS com
   `scoped` no pai não atravessa a fronteira do componente filho, então o texto
   perderia a formatação inteira se ficassem lá. */
/* Tokens de alerta jurídico que já existem no sistema (--ld-carimbo-*), em vez
   de hex solto: é literalmente o caso de uso para o qual foram criados. */
.tt-pendencia {
  margin: 0 0 var(--ld-space-md);
  padding: var(--ld-space-sm) var(--ld-space-md);
  border: 1px solid var(--ld-carimbo);
  background: var(--ld-carimbo-selo);
  color: var(--ld-carimbo-tinta);
  font-size: 0.8125rem;
  line-height: 1.5;
  max-width: 70ch;
}
.tt-abertura {
  margin: 0 0 var(--ld-space-lg);
  font-size: 0.9375rem;
  line-height: 1.6;
  max-width: 68ch;
  text-wrap: pretty;
}
.tt-secao {
  padding-top: var(--ld-space-md);
  border-top: 1px solid var(--color-divider);
}
.tt-secao + .tt-secao {
  margin-top: var(--ld-space-md);
}
.tt-secao-titulo {
  margin: 0 0 var(--ld-space-xs);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.3;
}
.tt-secao p,
.tt-lista {
  margin: 0 0 var(--ld-space-sm);
  font-size: 0.9375rem;
  line-height: 1.55;
  /* 78% de ink sobre branco ≈ 9:1 — folga confortável sobre o piso AA */
  color: color-mix(in srgb, var(--color-text) 78%, transparent);
  max-width: 70ch;
  text-wrap: pretty;
}
.tt-secao p:last-child,
.tt-lista:last-child {
  margin-bottom: 0;
}
.tt-secao strong {
  color: var(--color-text);
  font-weight: 700;
}
.tt-lista {
  padding-left: 1.15rem;
}
.tt-lista li + li {
  margin-top: 4px;
}
.tt-contato {
  font-size: 0.875rem;
}
.tt-link {
  color: var(--color-accent);
  text-underline-offset: 2px;
}
</style>
