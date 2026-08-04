<script setup lang="ts">
import type { JobListado } from '~/composables/useJobApresentacao'

// Acompanhamento de um envio em lote: só os jobs daquele envio, com status ao
// vivo. O `useJobPoller` é por job único — abrir dez EventSource seria pior que
// uma consulta a cada cinco segundos.

const route = useRoute()
const loteId = computed(() => String(route.params.id))

useHead({ title: 'Lote de matrículas — Lidimus' })

const { data, refresh } = await useFetch('/api/jobs', {
  query: computed(() => ({ type: 'matricula', loteId: loteId.value, limit: 100 })),
})

const jobs = computed<JobListado[]>(() => (data.value?.items ?? []) as JobListado[])
const total = computed(() => jobs.value.length)
const concluidos = computed(() => jobs.value.filter((j) => !jobEmAndamento(j)).length)
const comFalha = computed(() => jobs.value.filter((j) => j.status === 'error').length)
const terminou = computed(() => total.value > 0 && concluidos.value === total.value)

// O envio é o mesmo para todos, então a data do primeiro job serve de data do lote
const enviadoEm = computed(() => (jobs.value.length ? dataFmt(jobs.value[0].createdAt) : null))

const resumo = computed(() => {
  if (!total.value) return ''
  if (!terminou.value) return `${concluidos.value} de ${total.value} concluídas`
  if (comFalha.value === 0) return `${total.value} análises concluídas`
  return `${total.value - comFalha.value} de ${total.value} concluídas · ${comFalha.value} com falha`
})

// Um arquivo só com todos os pareceres do envio: capa, índice e um parecer por
// página. Quem abre um lote de dez matrículas quer o dossiê, não dez downloads.
const { gerando: gerandoDocx, erro: erroDocx, exportar } = useExportarDocx('lote-matriculas.docx')
const exportarDocx = () => exportar(`/api/matriculas/lote/${loteId.value}/docx`)

// Recurso do Profissional para cima — esconder o botão evita oferecer o que
// levaria 403. A rota é quem barra de fato.
const { data: acesso } = useAcesso()
const podeExportarDocx = computed(
  () => acesso.value?.docx === true && terminou.value && concluidos.value > comFalha.value,
)

onMounted(() => {
  // Para de consultar quando não há mais o que mudar — o lote é uma tela que fica
  // aberta enquanto o escritório toca outra coisa, e não vale bater no servidor
  // para sempre.
  const timer = setInterval(() => {
    if (terminou.value) {
      clearInterval(timer)
      return
    }
    refresh()
  }, 5000)
  onUnmounted(() => clearInterval(timer))
})
</script>

<template>
  <div>
    <header class="pagina-cabecalho">
      <NuxtLink to="/dashboard" class="voltar">← Painel</NuxtLink>
      <h1>Lote de matrículas</h1>
      <p v-if="total">
        {{ resumo }}<template v-if="enviadoEm"> · enviado em {{ enviadoEm }}</template>.
        <template v-if="!terminou">
          Cada análise percorre leitura, parecer jurídico e montagem — pode levar alguns minutos.
          Esta página se atualiza sozinha.
        </template>
      </p>
    </header>

    <section v-if="!total" class="ld-painel vazio">
      <p class="vazio-titulo">Lote não encontrado</p>
      <p class="vazio-texto">
        Este envio não existe ou pertence a outra organização.
        <NuxtLink to="/matriculas">Enviar matrículas</NuxtLink>.
      </p>
    </section>

    <section v-else class="ld-painel">
      <div class="progresso-faixa" aria-hidden="true">
        <span
          class="progresso-preenchida"
          :style="{ transform: `scaleX(${total ? concluidos / total : 0})` }"
        />
      </div>

      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th scope="col">Arquivo</th>
              <th scope="col">Nº da matrícula</th>
              <th scope="col">Status</th>
              <th scope="col">Risco</th>
              <th scope="col"><span class="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in jobs" :key="job.id" class="linha" @click="navigateTo(rotaDoJob(job))">
              <td class="celula-arquivo">
                <span class="arquivo-nome" :title="arquivoNome(job)">{{ arquivoNome(job) }}</span>
              </td>
              <td class="celula-numero">
                <span v-if="numeroDocumento(job)" class="numero-doc">{{ numeroDocumento(job) }}</span>
                <span v-else class="celula-na">—</span>
              </td>
              <td class="celula-status">
                <span class="ld-selo" :class="statusSelo(job).classe">{{ statusSelo(job).texto }}</span>
              </td>
              <td class="celula-risco">
                <span v-if="riscoInfo(job)" class="ld-selo" :class="riscoInfo(job)!.classe">
                  {{ riscoInfo(job)!.texto }}
                </span>
                <span v-else class="celula-na">—</span>
              </td>
              <td class="celula-acao">
                <NuxtLink :to="rotaDoJob(job)" class="ld-btn ld-btn--ghost ld-btn--sm" @click.stop>
                  Ver
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer v-if="terminou" class="lote-rodape">
        <p v-if="comFalha" class="lote-aviso">
          As análises que falharam tiveram os créditos estornados — reenvie só esses arquivos.
        </p>
        <p v-if="erroDocx" class="ld-erro lote-aviso" role="alert">{{ erroDocx }}</p>
        <div class="lote-acoes">
          <!-- Num lote terminado, levar o dossiê embora é a ação principal —
               "enviar outro lote" é o que se faz depois, não em vez disso. -->
          <button
            v-if="podeExportarDocx"
            class="ld-btn ld-btn--primary"
            :disabled="gerandoDocx"
            @click="exportarDocx"
          >
            <span v-if="gerandoDocx" class="ld-spinner" aria-hidden="true" />
            {{ gerandoDocx ? 'Montando…' : 'Exportar DOCX do lote' }}
          </button>
          <NuxtLink to="/matriculas" class="ld-btn ld-btn--secondary">Enviar outro lote</NuxtLink>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.pagina-cabecalho {
  margin-bottom: var(--ld-space-lg);
}
.voltar {
  display: inline-block;
  margin-bottom: var(--ld-space-xs);
  font-size: 0.8125rem;
  color: var(--ld-tinta-suave);
  text-decoration: none;
}
.voltar:hover {
  color: var(--ld-verde);
}
.pagina-cabecalho h1 {
  margin: 0 0 var(--ld-space-xs);
  font-family: var(--ld-font-serif);
  font-weight: 600;
  font-size: 1.75rem;
  line-height: 1.2;
}
.pagina-cabecalho p {
  margin: 0;
  color: var(--ld-tinta-suave);
  font-size: 0.9375rem;
  max-width: 64ch;
  text-wrap: pretty;
}

/* Avanço do lote como um todo. scaleX e não width: o valor muda a cada consulta
   e animar largura recalcularia layout da tabela inteira. */
.progresso-faixa {
  height: 3px;
  background: var(--ld-bancada);
  border-radius: var(--ld-r-sm) var(--ld-r-sm) 0 0;
  overflow: hidden;
}
.progresso-preenchida {
  display: block;
  height: 100%;
  width: 100%;
  transform-origin: left center;
  background: var(--ld-verde);
  transition: transform 320ms var(--ld-ease);
}

.vazio {
  padding: var(--ld-space-2xl) var(--ld-space-lg);
  text-align: center;
}
.vazio-titulo {
  margin: 0 0 var(--ld-space-xs);
  font-weight: 600;
}
.vazio-texto {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ld-tinta-suave);
}
.vazio-texto a {
  color: var(--ld-verde);
  font-weight: 500;
}

.tabela-rolagem {
  overflow-x: auto;
}
.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
}
.tabela th {
  text-align: left;
  background: var(--ld-bancada);
  color: var(--ld-tinta-suave);
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 10px var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  white-space: nowrap;
}
.tabela td {
  padding: 12px var(--ld-space-lg);
  border-bottom: 1px solid var(--ld-filete);
  vertical-align: middle;
}
.tabela tbody tr:last-child td {
  border-bottom: none;
}
.tabela tbody tr {
  cursor: pointer;
  transition: background var(--ld-dur-estado) var(--ld-ease);
}
.tabela tbody tr:hover {
  background: var(--ld-papel);
}
.celula-arquivo {
  max-width: 26ch;
  color: var(--ld-tinta-suave);
}
.arquivo-nome {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
}
.celula-numero {
  white-space: nowrap;
}
.numero-doc {
  font-family: var(--ld-font-mono);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}
.celula-acao {
  text-align: right;
  white-space: nowrap;
}
.celula-na {
  color: var(--ld-tinta-suave);
  font-size: 0.875rem;
}

.lote-rodape {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ld-space-md);
  flex-wrap: wrap;
  border-top: 1px solid var(--ld-filete);
  padding: var(--ld-space-md) var(--ld-space-lg);
}
.lote-aviso {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ld-tinta-suave);
  max-width: 56ch;
}
/* O bloco de ações encosta na direita; os botões dentro dele ficam lado a lado
   (o `margin-left: auto` era do botão único e separaria os dois). */
.lote-acoes {
  display: flex;
  align-items: center;
  gap: var(--ld-space-sm);
  margin-left: auto;
  flex-wrap: wrap;
}

/* Mesmo tratamento do painel: no celular a tabela vira cards empilhados */
@media (max-width: 640px) {
  .tabela thead {
    display: none;
  }
  .tabela,
  .tabela tbody {
    display: block;
  }
  .tabela tbody tr {
    display: grid;
    grid-template-columns: 1fr auto;
    row-gap: 6px;
    column-gap: var(--ld-space-md);
    padding: var(--ld-space-md);
    border-bottom: 1px solid var(--ld-filete);
  }
  .tabela tbody tr:last-child {
    border-bottom: none;
  }
  .tabela td {
    display: block;
    padding: 0;
    border: none;
  }
  .celula-arquivo,
  .celula-numero,
  .celula-status,
  .celula-risco {
    grid-column: 1;
  }
  .celula-acao {
    grid-column: 2;
    grid-row: 1 / span 4;
    align-self: center;
  }
  .celula-arquivo {
    max-width: none;
  }
}
</style>
