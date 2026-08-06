<script setup lang="ts">
// Termos e Condições de Uso. Vive num modal porque o momento de ler é o do
// cadastro — mandar a pessoa para outra página ali significaria perder o
// formulário já preenchido.
//
// Sistema Modernista (tokens --color-*), como manda a nota normativa em
// assets/css/lidimus.css: espaçamento e z-index seguem os tokens estruturais,
// que ainda não têm equivalente no sistema novo.

// A data de vigência aparece no texto e é o que o usuário declara ter lido —
// mudou o texto, muda a data, e o aceite anterior passa a ser de outra versão.
const VIGENCIA = '6 de agosto de 2026'

const dialogo = ref<HTMLDialogElement | null>(null)

function abrir() {
  dialogo.value?.showModal()
}

function fechar() {
  dialogo.value?.close()
}

defineExpose({ abrir, fechar, VIGENCIA })
</script>

<template>
  <dialog ref="dialogo" class="tm" aria-labelledby="tm-titulo">
    <div class="tm-folha">
      <header class="tm-topo">
        <div>
          <p class="cond tm-marca">Lidimus</p>
          <h2 id="tm-titulo" class="tm-titulo">Termos e Condições de Uso</h2>
          <p class="tm-vigencia">Vigentes desde {{ VIGENCIA }}</p>
        </div>
        <button type="button" class="tm-fechar" aria-label="Fechar termos" @click="fechar">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="square"
            />
          </svg>
        </button>
      </header>

      <div class="tm-corpo">
        <p class="tm-abertura">
          Estes Termos regem o uso da plataforma Lidimus, oferecida por
          <strong>[RAZÃO SOCIAL]</strong>, inscrita no CNPJ sob o nº <strong>[CNPJ]</strong>
          ("Lidimus"). Ao criar uma conta, você declara que leu, compreendeu e concorda
          integralmente com o que segue. Se não concordar, não crie a conta e não utilize a
          plataforma.
        </p>

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">1. O que o Lidimus é — e o que não é</h3>
          <p>
            O Lidimus é uma <strong>ferramenta de apoio à análise documental</strong>. A plataforma
            recebe documentos enviados pelo usuário — matrículas e certidões imobiliárias, arquivos
            KML, PDFs em geral — e devolve leituras, pareceres estruturados, memoriais, croquis e
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

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">2. Responsabilidade sobre os documentos enviados</h3>
          <p>
            <strong>O Lidimus não se responsabiliza pelos documentos enviados pelo usuário: apenas
            os analisa.</strong> A plataforma não os produz, não os emite, não os autentica e não
            atesta sua veracidade, autenticidade, integridade, vigência ou validade jurídica.
          </p>
          <p>O usuário é o único responsável por garantir que:</p>
          <ul class="tm-lista">
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

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">3. Natureza automatizada do resultado</h3>
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

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">4. Conta, acesso e equipe</h3>
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

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">5. Planos, créditos e cobrança</h3>
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

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">6. Uso permitido e condutas vedadas</h3>
          <p>A conta é para uso profissional e legítimo. É vedado ao usuário:</p>
          <ul class="tm-lista">
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

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">7. Documentos, dados pessoais e privacidade</h3>
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
            cadastro e de uso da plataforma é regido pela Política de Privacidade, que complementa
            estes Termos.
          </p>
        </section>

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">8. Disponibilidade do serviço</h3>
          <p>
            A plataforma é oferecida <strong>no estado em que se encontra</strong>. O Lidimus não
            garante funcionamento ininterrupto ou livre de falhas e pode realizar manutenções,
            atualizações e ajustes nas ferramentas, com aviso sempre que possível. Interrupções de
            terceiros — provedores de nuvem, serviços de IA, sistemas de origem dos documentos —
            estão fora do controle da plataforma.
          </p>
        </section>

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">9. Limitação de responsabilidade</h3>
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

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">10. Propriedade intelectual</h3>
          <p>
            A plataforma, seu código, marca, identidade visual, textos e metodologia de análise
            pertencem ao Lidimus. O usuário mantém a titularidade dos documentos que envia e pode
            usar livremente os resultados gerados em seu trabalho profissional.
          </p>
        </section>

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">11. Vigência, alterações e encerramento</h3>
          <p>
            Estes Termos vigoram enquanto a conta existir. O Lidimus pode alterá-los, publicando a
            versão atualizada com nova data de vigência; alterações relevantes serão comunicadas e
            o uso continuado após o aviso significa concordância. O usuário pode encerrar a conta
            a qualquer momento; o Lidimus pode encerrá-la em caso de descumprimento destes Termos
            ou de inadimplência.
          </p>
        </section>

        <section class="tm-secao">
          <h3 class="cond tm-secao-titulo">12. Lei aplicável e foro</h3>
          <p>
            Aplica-se a legislação brasileira. Fica eleito o foro da comarca de
            <strong>[CIDADE/UF]</strong> para dirimir controvérsias, salvo hipótese legal diversa.
          </p>
          <p class="tm-contato">
            Dúvidas sobre estes Termos: <strong>[E-MAIL DE CONTATO]</strong>.
          </p>
        </section>
      </div>

      <footer class="tm-rodape">
        <p class="tm-nota">
          Leia com atenção: o aceite no cadastro se refere a esta versão dos Termos.
        </p>
        <button type="button" class="tm-cta" autofocus @click="fechar">Fechar</button>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.tm {
  /* dialog nativo sobe para a top layer; o z-index só ordena contra camadas
     próprias, mas manter a escala evita número mágico. */
  z-index: var(--ld-z-modal);
  width: min(46rem, calc(100vw - 2 * var(--ld-space-md)));
  max-height: calc(100dvh - 2 * var(--ld-space-lg));
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-body);
  overflow: visible;
}
.tm::backdrop {
  background: color-mix(in srgb, var(--color-text) 62%, transparent);
}
/* O anel de foco global é verde (identidade antiga) e destoaria da folha. */
.tm :focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.tm-folha {
  background: #fff;
  border-top: 2px solid var(--color-text);
  max-height: inherit;
  display: flex;
  flex-direction: column;
}

/* ── Cabeçalho ──────────────────────────────────────────── */
.tm-topo {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ld-space-md);
  padding: var(--ld-space-lg) var(--ld-space-lg) var(--ld-space-md);
}
.tm-marca {
  margin: 0 0 var(--ld-space-xs);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-text) 66%, transparent);
}
.tm-titulo {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: clamp(1.375rem, 3.6vw, 1.875rem);
  line-height: 1.08;
  letter-spacing: -0.015em;
  text-transform: uppercase;
  text-wrap: balance;
}
.tm-vigencia {
  margin: 6px 0 0;
  font-size: 0.8125rem;
  color: color-mix(in srgb, var(--color-text) 66%, transparent);
}
.tm-fechar {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--color-divider);
  border-radius: 0;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition:
    background var(--ld-dur-estado) var(--ld-ease),
    border-color var(--ld-dur-estado) var(--ld-ease);
}
.tm-fechar:hover {
  background: var(--color-surface);
  border-color: var(--color-text);
}

/* ── Corpo ──────────────────────────────────────────────── */
/* O texto é longo por natureza: rola só o corpo, para que título e botão de
   saída continuem à vista durante a leitura. */
.tm-corpo {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 var(--ld-space-lg) var(--ld-space-md);
}
.tm-abertura {
  margin: 0 0 var(--ld-space-lg);
  font-size: 0.9375rem;
  line-height: 1.6;
  max-width: 68ch;
  text-wrap: pretty;
}
.tm-secao {
  padding-top: var(--ld-space-md);
  border-top: 1px solid var(--color-divider);
}
.tm-secao + .tm-secao {
  margin-top: var(--ld-space-md);
}
.tm-secao-titulo {
  margin: 0 0 var(--ld-space-xs);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.3;
}
.tm-secao p,
.tm-lista {
  margin: 0 0 var(--ld-space-sm);
  font-size: 0.9375rem;
  line-height: 1.55;
  /* 78% de ink sobre branco ≈ 9:1 — folga confortável sobre o piso AA */
  color: color-mix(in srgb, var(--color-text) 78%, transparent);
  max-width: 70ch;
  text-wrap: pretty;
}
.tm-secao p:last-child,
.tm-lista:last-child {
  margin-bottom: 0;
}
.tm-secao strong {
  color: var(--color-text);
  font-weight: 700;
}
.tm-lista {
  padding-left: 1.15rem;
}
.tm-lista li + li {
  margin-top: 4px;
}
.tm-contato {
  font-size: 0.875rem;
}

/* ── Rodapé ─────────────────────────────────────────────── */
.tm-rodape {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  padding: var(--ld-space-md) var(--ld-space-lg);
  border-top: 2px solid var(--color-text);
  background: #fff;
}
.tm-nota {
  margin: 0;
  flex: 1 1 22ch;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: color-mix(in srgb, var(--color-text) 74%, transparent);
  max-width: 52ch;
  text-wrap: pretty;
}
.tm-cta {
  flex-shrink: 0;
  border: none;
  border-radius: 0;
  background: var(--color-accent);
  color: #fff;
  font-family: var(--font-cond);
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 11px 28px;
  cursor: pointer;
  transition: background var(--ld-dur-estado) var(--ld-ease);
}
.tm-cta:hover {
  background: var(--color-accent-600);
}

/* ── Entrada ────────────────────────────────────────────── */
@keyframes tm-sobe {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes tm-vela {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.tm[open] .tm-folha {
  animation: tm-sobe var(--ld-dur-superficie) var(--ld-ease) both;
}
.tm[open]::backdrop {
  animation: tm-vela var(--ld-dur-superficie) var(--ld-ease) both;
}
@media (prefers-reduced-motion: reduce) {
  .tm[open] .tm-folha {
    animation: tm-vela 1ms linear both;
  }
}
</style>
