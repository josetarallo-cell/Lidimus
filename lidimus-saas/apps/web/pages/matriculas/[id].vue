<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify'
import { nivelRisco, riscoLabel } from '@lidimus/docx'
import type { NivelRisco } from '@lidimus/docx'

const route = useRoute()
const jobId = ref(route.params.id as string)
const { job } = useJobPoller(jobId)

// ─── Etapas do pipeline (sequência real: a ordem informa) ────────────────────
const STAGES = [
  { key: 'ocr', label: 'Leitura do documento' },
  { key: 'juridico', label: 'Análise jurídica' },
  { key: 'doc', label: 'Montagem do relatório' },
] as const

// O que a tela de espera conta enquanto o pipeline roda. Cada frase descreve
// trabalho que a etapa realmente faz — espera de três minutos entretida com
// enfeite genérico é a mesma espera, só que mentindo.
const TITULOS_ESPERA: Record<string, string> = {
  ocr: 'Lendo o documento',
  // A etapa de revisão normalmente não usa a tela de espera — ela tem a própria.
  // Mas há segundos em que o job está em 'revisao' e os recortes ainda não
  // ficaram prontos, e sem esta entrada o painel cai no rótulo genérico
  // "Processando", que não conta nada a quem está olhando.
  revisao: 'Conferindo a leitura',
  juridico: 'Analisando os atos',
  doc: 'Montando o relatório',
}

const MENSAGENS_ESPERA: Record<string, string[]> = {
  ocr: [
    'Separando as páginas',
    'Reconhecendo o texto do cartório',
    'Recompondo a ordem dos atos',
    'Conferindo se falta alguma página',
  ],
  revisao: [
    'Separando os trechos de leitura duvidosa',
    'Recortando os pedaços da página',
  ],
  juridico: [
    'Identificando proprietários e transmissões',
    'Reconstruindo a cadeia dominial',
    'Levantando ônus, penhoras e cláusulas',
    'Consultando a base legal',
    'Pesando o risco de cada apontamento',
  ],
  doc: [
    'Redigindo o relatório',
    'Organizando as seções do laudo',
    'Conferindo datas, números e valores',
    'Batendo o carimbo final',
  ],
}

// ─── Documento ────────────────────────────────────────────────────────────────
const doc = computed(() => {
  const result = job.value?.result as Record<string, any> | undefined
  return result?.documento ?? null
})

const textoOcr = computed(() => {
  const stageData = job.value?.stageData as Record<string, any> | undefined
  return stageData?.ocr?.texto_ocr ?? null
})

// ─── Corretor de leitura (OCR → CORRETOR → Jurídico) ─────────────────────────
// Quando o filtro encontra trechos que valem conferência humana, o pipeline para
// aqui e a tela de espera dá lugar ao corretor. É a única pausa deliberada do
// fluxo — e ela tem prazo: passado o tempo, a análise segue com a leitura atual.
const candidatosRevisao = computed(() => {
  const stageData = job.value?.stageData as Record<string, any> | undefined
  const lista = stageData?.revisao?.candidatos
  return Array.isArray(lista) ? lista : []
})

// Os trechos fazem parte da condição, e não só o status: `awaiting_review` sem
// candidato nenhum não deveria existir (o worker só para o job aí depois de ter
// recorte), mas se existisse a tela cairia entre dois `v-else-if` e o usuário
// veria a página em branco. Assim ela continua sendo a tela de espera, que é a
// leitura honesta do que está acontecendo — e o watchdog destrava em minutos.
const emRevisao = computed(
  () => job.value?.status === 'awaiting_review' && candidatosRevisao.value.length > 0,
)

const prazoRevisao = Number(useRuntimeConfig().public.revisaoPrazoMinutos ?? 15)
const enviandoRevisao = ref(false)
const erroRevisao = ref<string | null>(null)

async function responderRevisao(
  correcoes: { id: string; texto: string; descartar?: boolean }[],
) {
  if (enviandoRevisao.value) return
  enviandoRevisao.value = true
  erroRevisao.value = null
  try {
    await $fetch(`/api/jobs/${jobId.value}/revisao`, { method: 'POST', body: { correcoes } })
  } catch (err: any) {
    // 409 é o caso legítimo de corrida (prazo estourou enquanto digitava): a
    // análise já seguiu e o SSE vai trazer o novo estado sozinho.
    erroRevisao.value =
      err?.statusMessage ?? 'Não foi possível enviar as correções. Tente novamente.'
    enviandoRevisao.value = false
    return
  }
  // O estado novo chega pelo SSE; o botão fica travado até lá para não haver
  // duas submissões da mesma revisão.
}

const processando = computed(() => {
  if (!job.value) return true
  if (job.value.status === 'done' || job.value.status === 'error') return false
  return !emRevisao.value
})

// O guilhoché de segurança forra o corpo da página (ver lidimus.css); a folha do
// parecer repousa limpa sobre ele. Durante o processamento não há folha alguma —
// e o papel verde brigaria com a tela de espera, que já veste o sistema
// Modernista. Entra junto com o laudo.
useHead({
  title: 'Relatório técnico de matrícula — Lidimus',
  bodyAttrs: {
    class: computed(() => (processando.value || emRevisao.value ? '' : 'ld-pagina-certidao')),
  },
})

// Classificação de risco → selo (A Regra do Carimbo: vermelho só em risco real).
//
// `nivelRisco` e os rótulos vivem em @lidimus/docx porque agora há dois
// renderizadores do mesmo veredito — esta tela e o parecer exportado em Word.
// Um job "crítico" aqui e "médio" no arquivo baixado seria pior que não
// exportar. As tabelas de classe CSS abaixo continuam aqui: são da tela.
const SELO_POR_NIVEL: Record<NivelRisco, string> = {
  baixo: 'ld-selo--verde',
  medio: 'ld-selo--ocre',
  alto: 'ld-selo--carimbo',
  critico: 'ld-selo--critico',
  indeterminado: 'ld-selo--neutro',
  nao_aplicavel: 'ld-selo--neutro',
}
const CARIMBO_POR_NIVEL: Record<NivelRisco, string> = {
  baixo: 'ld-carimbo--baixo',
  medio: 'ld-carimbo--medio',
  alto: 'ld-carimbo--alto',
  critico: 'ld-carimbo--critico',
  indeterminado: 'ld-carimbo--neutro',
  nao_aplicavel: 'ld-carimbo--neutro',
}
const risco = computed(() => nivelRisco(doc.value?.cabecalho?.classificacao_risco))

const riscoSeloClass = computed(() =>
  risco.value ? SELO_POR_NIVEL[risco.value] : 'ld-selo--neutro',
)

// O carimbo do parecer estampa o veredito em destaque — cor forte por nível,
// respeitando A Regra do Carimbo (vermelho só em risco alto ou crítico)
function carimboRiscoClass(valor: unknown): string {
  const nivel = nivelRisco(valor)
  return nivel ? CARIMBO_POR_NIVEL[nivel] : 'ld-carimbo--neutro'
}

// ─── Matrícula incompleta ────────────────────────────────────────────────────
// Documento que chegou pela metade não recebe parecer: nem propriedade, nem
// ônus, nem cadeia dominial se sustentam sobre páginas que ninguém leu. A
// página passa a apresentar só o que consta do que foi enviado.
const matriculaIncompleta = computed(() => doc.value?.cabecalho?.matricula_incompleta === true)
const avisoIncompleta = computed(() => doc.value?.cabecalho?.aviso_matricula_incompleta ?? null)
const integridade = computed(() => doc.value?.integridade ?? null)

// O último ato data a certidão por baixo mesmo quando não há rótulo de
// expedição: uma certidão que certifica um ato de 21/03/2024 é posterior a ele.
const certidaoPosteriorA = computed(() => doc.value?.cabecalho?.certidao?.posterior_a ?? null)

// Confrontação só sai como rumo cardeal quando a matrícula escreve o rumo. Sem
// isso, a página exibia Norte/Sul/Leste/Oeste inferidos — confrontação
// fabricada, que vira retificação e georreferenciamento errados.
const confrontantesDescricao = computed(
  () => (doc.value?.imovel?.confrontantes_descricao ?? []) as { lado: string; confrontante: string }[],
)

// Valor do ato na moeda em que o documento o escreveu. Laudos antigos não têm
// `valor_display`; para eles o real corrente segue sendo a leitura correta.
function valorDoAto(a: Record<string, any>): string | null {
  if (a.valor_display) return a.valor_display
  if (!a.valor) return null
  return `${a.moeda ?? 'R$'} ${a.valor}`
}

// Traduz o prefixo técnico "[ocr]"/"[juridico]"/"[doc]" que o backend anexa
// à mensagem de erro — jargão de máquina não aparece na UI
const mensagemFalha = computed(() => {
  const msg = job.value?.errorMessage as string | undefined
  if (!msg) return 'Ocorreu um erro inesperado durante o processamento.'
  const m = msg.match(/^\[(\w+)\]\s*(.*)$/)
  if (!m) return msg
  const etapa = STAGES.find((s) => s.key === m[1])?.label
  return etapa ? `${etapa}: ${m[2]}` : m[2]
})

// Fuso fixo em America/Sao_Paulo: sem ele o horário saía no fuso de quem lê (ou
// em UTC no servidor), e a mesma análise aparecia com dois horários diferentes
// conforme o renderizador. Um laudo registral se data pelo fuso do registro.
const emitidoEm = computed(() => {
  const ts = job.value?.completedAt as string | undefined
  if (ts) {
    return new Date(ts).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    })
  }
  return doc.value?.metadados?.data_extracao ?? '—'
})

// A data em que o cartório expediu a certidão (detectada na montagem do
// documento). Não é a abertura da matrícula nem a emissão do parecer: é o que
// diz até onde o documento analisado enxerga o registro.
const certidao = computed(() => doc.value?.cabecalho?.certidao ?? null)

const certidaoLabel = computed(() => {
  const c = certidao.value
  // Sem data de expedição ainda dá para dizer algo útil: a certidão é
  // necessariamente posterior ao último ato que ela própria certifica.
  if (!c?.data) return c?.posterior_a ? `Posterior a ${c.posterior_a}` : 'Não identificada'
  return c.hora ? `${c.data} · ${c.hora}` : c.data
})

const certidaoAlerta = computed(() => {
  const c = certidao.value
  return !c?.detectada || c.situacao === 'desatualizada'
})

const temConfrontantes = computed(() => {
  const c = doc.value?.imovel?.confrontantes
  return c && Object.values(c).some(Boolean)
})

// O HTML da análise e o SVG do croqui vêm do pipeline (n8n/LLM), que processa
// texto controlado pelo cliente — sanitizar antes de renderizar
function sanitizar(html: unknown): string {
  return html ? DOMPurify.sanitize(String(html)) : ''
}
function sanitizarSvg(svg: unknown): string {
  return svg
    ? DOMPurify.sanitize(String(svg), { USE_PROFILES: { svg: true, svgFilters: true } })
    : ''
}

function exportarPdf() {
  window.print()
}

// O PDF é papel: bom de arquivar, impossível de editar. O DOCX é a outra
// metade — o parecer que o cliente abre no Word para ajustar a redação ou colar
// um trecho numa petição. Quem monta é o servidor (@lidimus/docx); aqui só
// entra o estado do botão.
const { gerando: gerandoDocx, erro: erroDocx, exportar } = useExportarDocx()
const exportarDocx = () => exportar(`/api/jobs/${jobId.value}/docx`)

// DOCX é recurso do Profissional para cima. Esconder o botão de quem não tem é
// só cortesia — não oferecer o que levaria 403; quem barra é a rota.
const { data: acesso } = useAcesso()
const podeExportarDocx = computed(() => acesso.value?.docx === true)

// ─── Croqui do terreno: ferramenta separada que reaproveita o texto já lido ──
const gerandoCroqui = ref(false)
const erroCroqui = ref<string | null>(null)

// Um croqui já gerado a partir desta matrícula? Se sim, o parecer leva a ele
// ("Visualizar croqui") em vez de oferecer gerar de novo — o croqui é acessível
// pelo laudo, e não se duplica trabalho já pago.
const { data: croquiVinculado } = await useFetch<{ croquiJobId: string | null }>(
  () => `/api/jobs/${jobId.value}/croqui`,
)
const croquiJobId = computed(() => croquiVinculado.value?.croquiJobId ?? null)

async function gerarCroquiDaMatricula() {
  gerandoCroqui.value = true
  erroCroqui.value = null
  try {
    const { jobId: novoCroquiId } = await $fetch<{ jobId: string }>('/api/croqui', {
      method: 'POST',
      body: { matriculaJobId: jobId.value },
    })
    await navigateTo(`/croqui/${novoCroquiId}`)
  } catch (err) {
    erroCroqui.value = mensagemDeErroDeUpload(err).texto
    gerandoCroqui.value = false
  }
}
</script>

<template>
  <div>
    <!-- Barra de ações (fora do documento; some na impressão) -->
    <div class="acoes print-hidden">
      <NuxtLink to="/dashboard" class="ld-btn ld-btn--ghost">← Painel</NuxtLink>
      <NuxtLink
        v-if="job?.status === 'done' && croquiJobId"
        :to="`/croqui/${croquiJobId}`"
        class="ld-btn ld-btn--secondary acoes-croqui"
      >
        Visualizar croqui
      </NuxtLink>
      <button
        v-else-if="job?.status === 'done' && textoOcr"
        class="ld-btn ld-btn--secondary acoes-croqui"
        :disabled="gerandoCroqui"
        @click="gerarCroquiDaMatricula"
      >
        <span v-if="gerandoCroqui" class="ld-spinner" aria-hidden="true" />
        {{ gerandoCroqui ? 'Gerando…' : 'Gerar croqui do terreno' }}
      </button>
      <div v-if="job?.status === 'done' && doc" class="acoes-exportar">
        <button
          v-if="podeExportarDocx"
          class="ld-btn ld-btn--secondary"
          :disabled="gerandoDocx"
          @click="exportarDocx"
        >
          <span v-if="gerandoDocx" class="ld-spinner" aria-hidden="true" />
          {{ gerandoDocx ? 'Gerando…' : 'Exportar DOCX' }}
        </button>
        <button class="ld-btn ld-btn--primary" @click="exportarPdf">Exportar PDF</button>
      </div>
    </div>
    <p v-if="erroCroqui" class="ld-erro acoes-erro print-hidden" role="alert">{{ erroCroqui }}</p>
    <p v-if="erroDocx" class="ld-erro acoes-erro print-hidden" role="alert">{{ erroDocx }}</p>

    <!-- ── Processando: a certidão sendo lida ───────────────────────────── -->
    <!-- Estimativa medida em produção: mediana 2min57s, p90 4min44s -->
    <EstadoProcessando
      v-if="processando"
      :job="job"
      :etapas="STAGES"
      :titulos="TITULOS_ESPERA"
      :mensagens="MENSAGENS_ESPERA"
      :texto="textoOcr"
      estimativa="de 2 a 5 minutos"
      :limite-atraso="420"
      rotulo="Etapas da análise"
    />

    <!-- ── Corretor de leitura: a pausa entre a leitura e a análise ─────── -->
    <!-- Fora da CenaLeitura de propósito: o palco dela é absoluto sobre uma
         folha de altura fixa, e a lista de trechos cresce até oito itens. -->
    <div v-else-if="emRevisao" class="revisao print-hidden">
      <EtapasPipeline
        class="revisao-etapas"
        :etapas="STAGES"
        :indice="0"
        :carimbando="null"
        rotulo="Etapas da análise"
      />
      <CorretorLeitura
        :candidatos="candidatosRevisao"
        :enviando="enviandoRevisao"
        :erro="erroRevisao"
        :prazo-minutos="prazoRevisao"
        @enviar="responderRevisao"
        @pular="responderRevisao([])"
      />
    </div>

    <!-- ── Erro ──────────────────────────────────────────────────────────── -->
    <PranchaFalha
      v-else-if="job.status === 'error'"
      titulo="Não foi possível concluir a análise"
      :mensagem="mensagemFalha"
      retry-to="/matriculas"
      retry-label="enviar a certidão novamente"
    />

    <!-- ── A Prancha: o parecer ──────────────────────────────────────────── -->
    <article v-else-if="doc" id="documento-matricula" class="prancha">
      <!-- Bloco-carimbo -->
      <BlocoCarimbo
        analise="Relatório técnico de matrícula"
        documento-label="Documento"
        :documento="`MAT ${doc.cabecalho.numero_matricula ?? '—'}`"
        :certidao="certidaoLabel"
        :certidao-alerta="certidaoAlerta"
        :emitido="emitidoEm"
      >
        <span class="ld-selo" :class="riscoSeloClass">
          {{ riscoLabel(doc.cabecalho.classificacao_risco) }}
        </span>
      </BlocoCarimbo>

      <!-- Matrícula incompleta: vem antes de tudo. O leitor precisa saber que
           não há parecer antes de ler qualquer dado. -->
      <aside v-if="matriculaIncompleta" class="faixa-incompleta" role="alert">
        <p class="faixa-incompleta-titulo">Matrícula incompleta — relatório técnico não emitido</p>
        <p class="faixa-incompleta-texto">{{ avisoIncompleta }}</p>
        <dl v-if="integridade" class="faixa-incompleta-dados">
          <div v-if="integridade.paginas_declaradas">
            <dt>Páginas</dt>
            <dd>{{ integridade.paginas_lidas ?? '?' }} de {{ integridade.paginas_declaradas }}</dd>
          </div>
          <div v-if="integridade.atos_faltantes?.length">
            <dt>Atos ausentes</dt>
            <dd>{{ integridade.atos_faltantes.join(', ') }}</dd>
          </div>
          <div v-if="integridade.atos_apenas_citados?.length">
            <dt>Citados, não transcritos</dt>
            <dd>{{ integridade.atos_apenas_citados.join(', ') }}</dd>
          </div>
        </dl>
        <p class="faixa-incompleta-acao">
          O que fazer: solicitar ao cartório a certidão de inteiro teor. Não é falha de leitura do
          arquivo — são páginas que não constam do documento enviado, e reprocessá-lo não as traz.
        </p>
      </aside>

      <!-- Título do documento -->
      <div class="prancha-titulo">
        <p v-if="doc.cabecalho.titulo" class="prancha-fonte">{{ doc.cabecalho.titulo }}</p>
        <h1>Matrícula {{ doc.cabecalho.numero_matricula ?? '—' }}</h1>
        <p v-if="doc.cabecalho.cartorio" class="prancha-cartorio">{{ doc.cabecalho.cartorio }}</p>

        <dl class="meta-grid">
          <div v-if="doc.cabecalho.data_abertura">
            <dt>Abertura</dt>
            <dd>{{ doc.cabecalho.data_abertura }}</dd>
          </div>
          <div v-if="doc.cabecalho.livro_folha">
            <dt>Livro / Folha</dt>
            <dd>{{ doc.cabecalho.livro_folha }}</dd>
          </div>
          <div v-if="doc.cabecalho.matricula_anterior">
            <dt>Matrícula anterior</dt>
            <dd class="dd-id">{{ doc.cabecalho.matricula_anterior }}</dd>
          </div>
          <div v-if="doc.cabecalho.sql_iptu">
            <dt>SQL / IPTU</dt>
            <dd class="dd-id">{{ doc.cabecalho.sql_iptu }}</dd>
          </div>
        </dl>
      </div>

      <!-- Imóvel -->
      <section class="secao" aria-labelledby="sec-imovel">
        <h2 id="sec-imovel">Imóvel</h2>
        <p class="prosa">{{ doc.imovel.endereco ?? 'Endereço não identificado no documento.' }}</p>
        <dl class="meta-grid">
          <div v-if="doc.imovel.area_total_display">
            <dt>Área total</dt>
            <dd>{{ doc.imovel.area_total_display }}</dd>
          </div>
          <div v-if="doc.imovel.area_construida_display">
            <dt>Área construída</dt>
            <dd>{{ doc.imovel.area_construida_display }}</dd>
          </div>
          <div v-if="doc.imovel.testada">
            <dt>Testada</dt>
            <dd>{{ doc.imovel.testada }}</dd>
          </div>
          <div>
            <dt>Ônus ativos</dt>
            <dd>{{ doc.imovel.tem_onus_display }}</dd>
          </div>
        </dl>
        <dl v-if="temConfrontantes" class="meta-grid meta-grid--separada">
          <template v-for="(lado, dir) in doc.imovel.confrontantes" :key="dir">
            <div v-if="lado">
              <dt class="dt-capitalize">{{ dir }}</dt>
              <dd>{{ lado }}</dd>
            </div>
          </template>
        </dl>
        <!-- Sem rumo cardeal escrito, a confrontação sai como a matrícula a
             descreve. Traduzir "de um lado" para Norte é inventar o dado. -->
        <dl v-else-if="confrontantesDescricao.length" class="meta-grid meta-grid--separada">
          <div v-for="(c, i) in confrontantesDescricao" :key="i">
            <dt class="dt-capitalize">{{ c.lado }}</dt>
            <dd>{{ c.confrontante }}</dd>
          </div>
        </dl>
        <p v-if="!temConfrontantes && confrontantesDescricao.length" class="secao-nota">
          A matrícula não indica rumo cardeal; as divisas são reproduzidas como constam do documento.
        </p>
      </section>

      <!-- Croqui -->
      <section v-if="doc.croqui?.disponivel" class="secao" aria-labelledby="sec-croqui">
        <div class="secao-cabecalho">
          <h2 id="sec-croqui">Croqui do terreno</h2>
          <span v-if="doc.croqui.precisao" class="secao-nota">Precisão: {{ doc.croqui.precisao }}</span>
        </div>
        <figure class="croqui">
          <img
            v-if="doc.croqui.data_uri"
            :src="doc.croqui.data_uri"
            alt="Croqui do terreno gerado a partir das medidas descritas na matrícula"
            loading="lazy"
          />
          <div v-else class="croqui-svg" v-html="sanitizarSvg(doc.croqui.svg)" />
        </figure>
      </section>

      <!-- Proprietários -->
      <section class="secao" aria-labelledby="sec-prop">
        <h2 id="sec-prop">Proprietários atuais</h2>
        <ol v-if="doc.proprietarios.lista?.length" class="pessoas">
          <li v-for="p in doc.proprietarios.lista" :key="p.ordem" class="pessoa">
            <p class="pessoa-nome">{{ p.ordem }}. {{ p.nome }}</p>
            <p v-if="p.documento_tipo && p.documento_numero" class="pessoa-meta">
              {{ p.documento_tipo }} <span class="dd-id">{{ p.documento_numero }}</span>
            </p>
            <p v-if="p.estado_civil" class="pessoa-meta">
              {{ p.estado_civil }}<template v-if="p.regime_bens"> — {{ p.regime_bens }}</template>
            </p>
            <p v-if="p.ato_aquisitivo" class="pessoa-meta">
              Adquirido em {{ p.ato_aquisitivo }}<template v-if="p.data_aquisicao"> — {{ p.data_aquisicao }}</template>
              <template v-if="p.percentual"> — {{ p.percentual }}</template>
            </p>
            <p v-if="p.endereco_domicilio" class="pessoa-meta">Domicílio: {{ p.endereco_domicilio }}</p>
            <p v-if="p.observacao" class="pessoa-meta">{{ p.observacao }}</p>
          </li>
        </ol>
        <p v-else class="vazio">
          Não foi possível identificar os proprietários automaticamente. Confira o documento original.
        </p>
        <!-- Titular sem título aquisitivo lido é indicação, não afirmação: é
             exatamente o ponto em que o laudo não pode dizer "100%". -->
        <p v-if="doc.proprietarios.titulo_aquisitivo_lido === false" class="secao-nota secao-nota--alerta">
          O ato aquisitivo não consta das páginas analisadas. Os nomes acima são os indicados pelo
          documento recebido, e não confirmam a titularidade do domínio.
        </p>

        <!-- Titulares de direitos registrados que NÃO são donos: promitente
             comprador, cessionário. Separá-los evita confundi-los com o titular. -->
        <div v-if="doc.proprietarios.promissarios?.lista?.length" class="subsecao">
          <h3 class="subsecao-titulo">Promitentes compradores e cessionários</h3>
          <p class="subsecao-nota">
            Titulares de direitos registrados sobre o imóvel — não são os proprietários.
          </p>
          <ol class="pessoas">
            <li v-for="p in doc.proprietarios.promissarios.lista" :key="'pc-' + p.ordem" class="pessoa">
              <p class="pessoa-nome">{{ p.ordem }}. {{ p.nome }}</p>
              <p v-if="p.natureza" class="pessoa-meta">{{ p.natureza }}</p>
              <p v-if="p.documento_tipo && p.documento_numero" class="pessoa-meta">
                {{ p.documento_tipo }} <span class="dd-id">{{ p.documento_numero }}</span>
              </p>
              <p v-if="p.observacao" class="pessoa-meta">{{ p.observacao }}</p>
            </li>
          </ol>
        </div>
      </section>

      <!-- Parecer: a conclusão — o veredito vem antes do detalhamento.
           Em matrícula incompleta não há veredito a dar: o lugar do parecer é
           ocupado pela razão de não haver parecer. -->
      <section class="secao secao--parecer" aria-labelledby="sec-parecer">
        <div class="secao-cabecalho">
          <h2 id="sec-parecer">Conclusão técnica</h2>
          <span
            v-if="!matriculaIncompleta"
            class="ld-carimbo ld-carimbo--grande"
            :class="carimboRiscoClass(doc.parecer.classificacao_risco)"
          >
            {{ riscoLabel(doc.parecer.classificacao_risco) }}
          </span>
        </div>
        <p v-if="matriculaIncompleta" class="parecer-texto">
          Não emitida. A certidão analisada está incompleta, e concluir sobre propriedade, ônus ou
          cadeia dominial exigiria o documento inteiro. As seções seguintes trazem apenas os dados
          que constam das páginas recebidas.
        </p>
        <p v-else-if="doc.parecer.texto" class="parecer-texto">{{ doc.parecer.texto }}</p>
        <p v-else class="vazio">Conclusão não disponível para esta análise.</p>
      </section>

      <!-- Análise jurídica: suprimida em matrícula incompleta, exceto as
           inconsistências, que são justamente o inventário das lacunas -->
      <section class="secao" aria-labelledby="sec-analise">
        <h2 id="sec-analise">{{ matriculaIncompleta ? 'Lacunas do documento' : 'Análise jurídica' }}</h2>
        <div class="analise">
          <div v-if="!matriculaIncompleta && doc.analise_juridica.resumo_executivo">
            <h3>Resumo executivo</h3>
            <p class="prosa">{{ doc.analise_juridica.resumo_executivo }}</p>
          </div>
          <div v-if="!matriculaIncompleta && doc.analise_juridica.riscos_html">
            <h3>Riscos</h3>
            <div class="prosa analise-html" v-html="sanitizar(doc.analise_juridica.riscos_html)" />
          </div>
          <div v-if="doc.analise_juridica.inconsistencias_html">
            <h3>Inconsistências</h3>
            <div class="prosa analise-html" v-html="sanitizar(doc.analise_juridica.inconsistencias_html)" />
          </div>
          <template v-if="!matriculaIncompleta">
            <div v-if="doc.analise_juridica.problemas_html">
              <h3>Possíveis problemas</h3>
              <div class="prosa analise-html" v-html="sanitizar(doc.analise_juridica.problemas_html)" />
            </div>
            <div v-if="doc.analise_juridica.cadeia_dominial_html">
              <h3>Cadeia dominial</h3>
              <div class="prosa analise-html" v-html="sanitizar(doc.analise_juridica.cadeia_dominial_html)" />
            </div>
            <div v-if="doc.analise_juridica.fundamentacao_html">
              <h3>Fundamentação legal</h3>
              <div class="prosa analise-html" v-html="sanitizar(doc.analise_juridica.fundamentacao_html)" />
            </div>
          </template>
        </div>
      </section>

      <!-- Histórico de atos -->
      <section class="secao" aria-labelledby="sec-atos">
        <h2 id="sec-atos">Histórico de atos <span class="contagem">({{ doc.historico_atos.total }})</span></h2>
        <ol v-if="doc.historico_atos.lista?.length" class="atos">
          <li
            v-for="a in doc.historico_atos.lista"
            :key="a.sequencia"
            class="ato"
            :class="{ 'ato--cancelado': a.status === 'cancelado' }"
          >
            <span class="ato-seq">{{ a.sequencia }}</span>
            <div class="ato-corpo">
              <p class="ato-tipo">
                {{ a.tipo_label }}
                <span v-if="a.status === 'cancelado'" class="ld-selo ld-selo--carimbo">Cancelado</span>
              </p>
              <p v-if="a.partes" class="ato-meta">Partes: {{ a.partes }}</p>
              <p v-if="a.cancelado_por" class="ato-meta ato-meta--cancelamento">
                Cancelado por {{ a.cancelado_por }}
              </p>
            </div>
            <!-- Moeda como o documento a escreveu: "Cr$ 12.000.000" de 1966 não
                 é "R$ 120.000,00". Converter inventa um número que não existe em
                 documento nenhum. -->
            <span v-if="valorDoAto(a)" class="ato-valor">{{ valorDoAto(a) }}</span>
            <span v-if="a.data" class="ato-data">{{ a.data }}</span>
          </li>
        </ol>
        <p v-else class="vazio">Nenhum ato registrado.</p>
      </section>

      <!-- Ônus ativos: risco jurídico real — o único vermelho da prancha -->
      <section class="secao" aria-labelledby="sec-onus">
        <h2 id="sec-onus">Ônus e gravames ativos <span class="contagem">({{ doc.onus.total }})</span></h2>
        <p v-if="matriculaIncompleta" class="secao-nota secao-nota--alerta">
          Lista não exaustiva: cobre apenas os atos das páginas recebidas. Gravames registrados nas
          páginas ausentes não aparecem aqui.
        </p>
        <ul v-if="doc.onus.ativos?.length" class="onus-lista">
          <li v-for="o in doc.onus.ativos" :key="o.sequencia" class="onus">
            <div class="onus-linha">
              <span class="onus-seq">{{ o.sequencia }}</span>
              <span class="onus-tipo">{{ o.tipo_label }}</span>
              <span v-if="valorDoAto(o)" class="onus-valor">{{ valorDoAto(o) }}</span>
              <span v-if="o.data" class="onus-data">{{ o.data }}</span>
            </div>
            <p v-if="o.partes" class="onus-partes">Partes: {{ o.partes }}</p>
          </li>
        </ul>
        <!-- "Nenhum ônus" só é notícia boa quando o documento inteiro foi lido.
             Em matrícula incompleta, o que há é ausência de informação. -->
        <p v-else-if="matriculaIncompleta" class="vazio">
          Nenhum ônus nos atos lidos — o que não significa que o imóvel esteja livre.
        </p>
        <p v-else><span class="ld-selo ld-selo--verde">Nenhum ônus ativo identificado</span></p>
      </section>

      <!-- Rodapé de metadados -->
      <footer class="prancha-rodape">
        <div v-if="doc.metadados.validacao?.avisos?.length" class="avisos">
          <p class="avisos-titulo">Avisos da extração</p>
          <ul>
            <li v-for="(av, i) in doc.metadados.validacao.avisos" :key="i">{{ av }}</li>
          </ul>
        </div>
        <p>
          Extraído em {{ doc.metadados.data_extracao
          }}<template v-if="doc.metadados.total_paginas">
            · {{ doc.metadados.total_paginas }} página(s) analisada(s)</template>
        </p>
        <p>
          Documento gerado automaticamente pela Lidimus. É uma ferramenta de apoio e não substitui a
          certidão oficial do cartório nem o parecer de profissional habilitado.
        </p>
      </footer>
    </article>

    <!-- ── Concluído em formato anterior (fallback) ──────────────────────── -->
    <div v-else-if="job.status === 'done'" class="legado">
      <p>Esta análise foi gerada em um formato anterior da plataforma. Dados completos:</p>
      <pre>{{ JSON.stringify(job.result, null, 2) }}</pre>
    </div>

    <!-- Texto OCR completo -->
    <details v-if="textoOcr" class="depuracao print-hidden">
      <summary>Texto completo do documento</summary>
      <pre>{{ textoOcr }}</pre>
    </details>
  </div>
</template>

<style scoped>
/* ── Barra de ações ─────────────────────────────────────── */
.acoes {
  display: flex;
  align-items: center;
  gap: var(--ld-space-md);
  margin-bottom: var(--ld-space-lg);
  flex-wrap: wrap;
}
/* Os botões de ação alinham à direita; o croqui abre a margem.
   Os de exportar vivem num bloco próprio: o DOCX aparece só para quem tem o
   recurso no plano, e com seletor de irmão o alinhamento sumia junto com ele. */
.acoes-croqui {
  margin-left: auto;
}
.acoes-croqui + .acoes-exportar {
  margin-left: 0;
}
.acoes-exportar {
  display: flex;
  align-items: center;
  gap: var(--ld-space-md);
  margin-left: auto;
  flex-wrap: wrap;
}
.acoes-erro {
  margin: calc(-1 * var(--ld-space-sm)) 0 var(--ld-space-lg);
}

/* A tela de espera vive em EstadoProcessando.vue — as quatro ferramentas
   compartilham a mesma, e a régua de etapas não é mais copiada por página. */

/* ── Corretor de leitura ────────────────────────────────── */
/* A régua de etapas continua na tela durante a conferência: o usuário precisa
   ver que não saiu do fluxo, só que o fluxo pediu uma coisa a ele. */
.revisao-etapas {
  margin-bottom: var(--space-md);
}

/* ── A prancha ──────────────────────────────────────────── */
/* A folha do parecer repousa sobre o papel de segurança da página: sombra
   leve para descolar do guilhoché, folha amarelada, dados em azul anil. */
.prancha {
  background: var(--ld-certidao-papel);
  border: 1px solid var(--ld-certidao-filete);
  border-radius: var(--ld-r-md);
  overflow: hidden;
  box-shadow: var(--ld-shadow-flutuante);
}
/* Carimbo de identificação e título ficam sobre a folha amarelada */
.prancha :deep(.carimbo) {
  background: transparent;
}

/* Título do documento */
.prancha-titulo {
  padding: var(--ld-space-xl) var(--ld-space-xl) var(--ld-space-lg);
}
.prancha-fonte {
  margin: 0 0 var(--ld-space-sm);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.prancha-titulo h1 {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.2;
  text-wrap: balance;
}
.prancha-cartorio {
  margin: var(--ld-space-xs) 0 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
}

/* Grades de metadados <dl> */
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
  gap: var(--ld-space-md) var(--ld-space-lg);
  margin: var(--ld-space-lg) 0 0;
}
.meta-grid--separada {
  border-top: 1px solid var(--ld-filete);
  padding-top: var(--ld-space-md);
}
.meta-grid dt {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ld-tinta-suave);
  margin-bottom: 2px;
}
.dt-capitalize {
  text-transform: capitalize;
}
.meta-grid dd {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 500;
}
.dd-id {
  font-family: var(--ld-font-mono);
  font-size: 0.875rem;
  font-weight: 400;
}

/* Seções — o campo de leitura em azul anil suave */
.secao {
  border-top: 1px solid var(--ld-filete);
  padding: var(--ld-space-lg) var(--ld-space-xl) var(--ld-space-xl);
  background: var(--ld-certidao-conteudo);
}
.secao h2 {
  margin: 0 0 var(--ld-space-md);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
}
.secao-cabecalho {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
}
.secao-nota {
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
/* Ressalva que muda o que o leitor pode concluir da seção — não é rodapé */
.secao-nota--alerta {
  margin: var(--ld-space-sm) 0 0;
  padding-left: var(--ld-space-sm);
  border-left: 2px solid var(--ld-ocre);
  color: var(--ld-ocre);
}

/* ── Faixa de matrícula incompleta ───────────────────────────────────────
   Ocupa a largura da folha, acima do título: é a primeira coisa que se lê,
   porque decide se o resto pode embasar alguma decisão. */
.faixa-incompleta {
  border: 2px solid var(--ld-carimbo);
  border-radius: var(--ld-r-sm);
  background: var(--ld-carimbo-selo);
  padding: var(--ld-space-lg);
  margin-bottom: var(--ld-space-xl);
}
.faixa-incompleta-titulo {
  margin: 0 0 var(--ld-space-sm);
  font-family: var(--ld-font-serif);
  font-weight: 700;
  font-size: 1.0625rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ld-carimbo-tinta);
}
.faixa-incompleta-texto {
  margin: 0;
  max-width: 72ch;
  line-height: 1.6;
  text-wrap: pretty;
}
.faixa-incompleta-dados {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ld-space-md) var(--ld-space-xl);
  margin: var(--ld-space-md) 0 0;
}
.faixa-incompleta-dados dt {
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ld-tinta-suave);
}
.faixa-incompleta-dados dd {
  margin: 2px 0 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.faixa-incompleta-acao {
  margin: var(--ld-space-md) 0 0;
  max-width: 72ch;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--ld-tinta-suave);
}
.contagem {
  color: var(--ld-tinta-suave);
  font-weight: 400;
}
.prosa {
  margin: 0;
  max-width: 72ch;
  line-height: 1.6;
  text-wrap: pretty;
  overflow-wrap: break-word;
}
.vazio {
  margin: 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
}

/* Croqui */
.croqui {
  margin: var(--ld-space-md) 0 0;
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  background: var(--ld-folha);
  padding: var(--ld-space-lg);
}
.croqui img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}
.croqui-svg :deep(svg) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

/* Proprietários */
.pessoas {
  list-style: none;
  margin: 0;
  padding: 0;
}
.pessoa {
  padding: var(--ld-space-md) 0;
  border-bottom: 1px solid var(--ld-filete);
}
.pessoa:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.pessoa:first-child {
  padding-top: 0;
}
.pessoa-nome {
  margin: 0;
  font-weight: 600;
  font-size: 0.9375rem;
}
.pessoa-meta {
  margin: 2px 0 0;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.subsecao {
  margin-top: var(--ld-space-lg);
  padding-top: var(--ld-space-md);
  border-top: 1px solid var(--ld-filete);
}
.subsecao-titulo {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}
.subsecao-nota {
  margin: 2px 0 var(--ld-space-md);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}

/* Histórico de atos */
.atos {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ato {
  display: grid;
  grid-template-columns: 64px 1fr auto auto;
  gap: var(--ld-space-xs) var(--ld-space-md);
  align-items: baseline;
  padding: 12px 0;
  border-bottom: 1px solid var(--ld-filete);
  font-size: 0.9375rem;
}
.ato:last-child {
  border-bottom: none;
}
.ato-seq {
  font-family: var(--ld-font-mono);
  font-size: 0.875rem;
  color: var(--ld-verde);
}
.ato-tipo {
  margin: 0;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  flex-wrap: wrap;
}
.ato-meta {
  margin: 2px 0 0;
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.ato-meta--cancelamento {
  color: var(--ld-carimbo-tinta);
}
.ato-valor {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  white-space: nowrap;
}
.ato-data {
  color: var(--ld-tinta-suave);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ato--cancelado .ato-tipo,
.ato--cancelado .ato-seq,
.ato--cancelado .ato-valor {
  color: var(--ld-tinta-suave);
  text-decoration: none;
}

/* Ônus ativos — risco real: o único vermelho da prancha */
.onus-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-sm);
}
.onus {
  border: 1px solid var(--ld-carimbo);
  background: var(--ld-carimbo-selo);
  border-radius: var(--ld-r-sm);
  padding: 12px var(--ld-space-md);
}
.onus-linha {
  display: flex;
  align-items: baseline;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  font-size: 0.9375rem;
}
.onus-seq {
  font-family: var(--ld-font-mono);
  font-size: 0.875rem;
  color: var(--ld-carimbo-tinta);
}
.onus-tipo {
  font-weight: 600;
  color: var(--ld-carimbo-tinta);
}
.onus-valor {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: var(--ld-tinta);
}
.onus-data {
  color: var(--ld-tinta-suave);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}
.onus-partes {
  margin: var(--ld-space-xs) 0 0;
  font-size: 0.8125rem;
  color: var(--ld-tinta);
}

/* Análise jurídica */
.analise {
  display: flex;
  flex-direction: column;
  gap: var(--ld-space-lg);
}
.analise h3 {
  margin: 0 0 var(--ld-space-sm);
  font-size: 0.9375rem;
  font-weight: 600;
}
.analise-html :deep(p) {
  margin: 0 0 var(--ld-space-sm);
}
.analise-html :deep(ul),
.analise-html :deep(ol) {
  margin: 0 0 var(--ld-space-sm);
  padding-left: 1.25rem;
}
.analise-html :deep(li) {
  margin-bottom: var(--ld-space-xs);
}
.analise-html :deep(strong) {
  font-weight: 600;
}

/* Parecer — a folha amarelada e o filete anil destacam a conclusão selada */
.secao--parecer {
  border-top: 3px solid var(--ld-anil);
  background: var(--ld-certidao-papel);
}
.secao--parecer .secao-cabecalho {
  align-items: center;
}
.parecer-texto {
  margin: 0;
  font-family: var(--ld-font-serif);
  font-size: 1.125rem;
  line-height: 1.65;
  max-width: 72ch;
  text-wrap: pretty;
}

/* Rodapé */
.prancha-rodape {
  border-top: 1px solid var(--ld-filete);
  padding: var(--ld-space-md) var(--ld-space-xl) var(--ld-space-lg);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
}
.prancha-rodape p {
  margin: 0 0 var(--ld-space-xs);
  max-width: 90ch;
}
.avisos {
  border: 1px solid var(--ld-ocre);
  background: var(--ld-ocre-selo);
  border-radius: var(--ld-r-sm);
  padding: 12px var(--ld-space-md);
  margin-bottom: var(--ld-space-md);
  color: var(--ld-ocre);
}
.avisos-titulo {
  font-weight: 600;
  margin: 0 0 var(--ld-space-xs);
}
.avisos ul {
  margin: 0;
  padding-left: 1.25rem;
}

/* Fallback legado e depuração */
.legado {
  border: 1px solid var(--ld-filete);
  background: var(--ld-folha);
  border-radius: var(--ld-r-md);
  padding: var(--ld-space-lg);
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}
.legado pre,
.depuracao pre {
  margin-top: var(--ld-space-sm);
  font-family: var(--ld-font-mono);
  font-size: 0.75rem;
  background: var(--ld-bancada);
  border: 1px solid var(--ld-filete);
  border-radius: var(--ld-r-sm);
  padding: var(--ld-space-md);
  overflow: auto;
  max-height: 24rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.depuracao {
  margin-top: var(--ld-space-lg);
}
.depuracao summary {
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
}
.depuracao summary:hover {
  color: var(--ld-tinta);
}


/* Responsivo */
@media (max-width: 640px) {
  .prancha-titulo,
  .secao {
    padding-left: var(--ld-space-md);
    padding-right: var(--ld-space-md);
  }
  .prancha-titulo {
    padding-top: var(--ld-space-lg);
  }
  .ato {
    grid-template-columns: 64px 1fr;
  }
  .ato-valor,
  .ato-data {
    grid-column: 2;
    justify-self: start;
  }
}
</style>

<style>
/* Impressão: a prancha vira o documento A4 (global — atravessa o layout) */
@media print {
  @page {
    size: A4;
    margin: 14mm;
  }

  .print-hidden {
    display: none !important;
  }

  #documento-matricula {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    font-size: 12px;
  }

  #documento-matricula,
  #documento-matricula .secao,
  #documento-matricula .carimbo,
  #documento-matricula .secao--parecer,
  #documento-matricula .ld-selo,
  #documento-matricula .ld-carimbo,
  #documento-matricula .onus,
  #documento-matricula .avisos {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  #documento-matricula .secao,
  #documento-matricula .onus,
  #documento-matricula .pessoa {
    break-inside: avoid;
  }

  #documento-matricula .prancha-titulo h1 {
    font-size: 20px;
  }

  #documento-matricula .parecer-texto {
    font-size: 13px;
  }
}
</style>
