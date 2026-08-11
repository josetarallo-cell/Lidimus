<script setup lang="ts">
// Os Termos com URL própria. Até aqui o texto só existia dentro do modal do
// cadastro: quem já tinha conta não conseguia reler o que aceitou, e o
// documento não podia ser citado, arquivado nem indexado. Livre acesso ao
// conteúdo do tratamento é o art. 6º, IV da LGPD.
//
// O texto vem de TermosTexto.vue, o mesmo que o modal renderiza — ver a nota
// lá sobre por que não pode haver duas cópias.

import { VIGENCIA_TERMOS, VERSAO_TERMOS } from '~/shared/termos'

definePageMeta({ layout: false })

useHead({
  title: 'Termos e Condições de Uso — Lidimus',
  meta: [
    {
      name: 'description',
      content:
        'Termos e Condições de Uso da plataforma Lidimus: natureza da análise, ' +
        'responsabilidade sobre os documentos enviados, créditos e limitações.',
    },
  ],
})

const SECOES = [
  { id: 'termos', rotulo: 'Texto integral' },
  { id: 'versao', rotulo: 'Versão e histórico' },
]

const LEGAIS = [
  { to: '/privacidade', rotulo: 'Privacidade' },
  { to: '/termos', rotulo: 'Termos de Uso' },
]
</script>

<template>
  <DocsPagina
    titulo="Termos e Condições de Uso"
    :secoes="SECOES"
    :irmas="LEGAIS"
    titulo-nav="Legal"
  >
    <p class="doc-lide">
      Vigentes desde {{ VIGENCIA_TERMOS }}. Este é o mesmo texto exibido no cadastro — é a ele
      que se refere o aceite registrado na sua conta.
    </p>

    <section id="termos">
      <TermosTexto />
    </section>

    <section id="versao">
      <h2>Versão e histórico</h2>
      <p>
        Versão vigente: <code>{{ VERSAO_TERMOS }}</code>. Ao aceitar o cadastro, a plataforma
        registra qual versão você leu, a data, o meio utilizado (e-mail ou Google) e os dados
        técnicos da requisição. Aceites anteriores continuam apontando para a versão que estava
        no ar naquele momento — é o que os torna prova do que foi lido, e não do texto de hoje.
      </p>
      <p>
        Alterações relevantes passam a valer com nova data de vigência e são comunicadas.
        Como tratamos os dados desse registro está descrito na
        <NuxtLink to="/privacidade">Política de Privacidade</NuxtLink>.
      </p>
    </section>

    <template #rodape>
      <section class="doc-fim">
        <h2>Dúvidas sobre estes Termos</h2>
        <p>
          Escreva para
          <a href="mailto:jose.tarallo@gmail.com?subject=Lidimus%20%E2%80%94%20Termos%20de%20Uso">
            o suporte
          </a>. Para pedidos relativos aos seus dados pessoais, o canal e o procedimento estão na
          <NuxtLink to="/privacidade#direitos">Política de Privacidade</NuxtLink>.
        </p>
      </section>
    </template>
  </DocsPagina>
</template>
