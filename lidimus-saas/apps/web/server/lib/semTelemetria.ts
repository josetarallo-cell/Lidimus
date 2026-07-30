// Remove telemetria interna de qualquer payload de job antes de ele sair para o
// cliente — painel, API pública ou SSE.
//
// O que está em jogo não é privacidade do cliente: é sigilo nosso. Os workflows
// do n8n gravam em `result.usage` e `stage_data._usage` o custo em dólar por
// análise e o nome de cada modelo usado em cada etapa. Isso é duas coisas que o
// cliente não pode ver:
//
//   • a margem — quanto a análise nos custou de verdade, ao lado do que ele paga;
//   • a composição do produto — quais fornecedores e modelos estão por trás de
//     cada etapa, que é justamente o que um concorrente precisaria para copiar.
//
// O usuário enxerga custo em créditos do Lidimus, e mais nada.
//
// Aplicado no acesso ao job (getJobForUser/getJobForOrg) em vez de em cada rota:
// falha fechada. Rota nova que leia um job já nasce limpa, sem depender de
// alguém lembrar de filtrar. Quem precisa do dado bruto é o painel de custos do
// admin, que consulta a tabela direto e é protegido por requirePlatformAdmin.

// Chaves removidas em qualquer profundidade. `usage`/`_usage` são os contêineres
// de telemetria; as demais entram por segurança, para o caso de um workflow
// passar a gravar custo ou modelo fora deles.
const CHAVES_PROIBIDAS = new Set([
  'usage',
  '_usage',
  'costUsd',
  'model',
  'workflow',
  'totalTokens',
  'promptTokens',
  'completionTokens',
  // Corpo da requisição que mandamos ao modelo: carrega o nome dele e, pior, o
  // nosso prompt de detecção inteiro.
  'openAIRequestBody',
])

// Nomes que não podem sair daqui: fornecedores e modelos.
export const FORNECEDORES =
  /\b(gpt-|claude|anthropic|openai|mistral|document[-_ ]?ai|gemini|vertex|bedrock)/i

// Além das chaves de telemetria, os workflows gravam legendas internas que
// nomeiam o fornecedor — "OpenAI Vision OCR" em `imageAnalysis.note`, "OpenAI
// metadata injection analysis" em `metadataAnalysis.note`. Foram duas ocorrências
// em lugares diferentes, então a regra não pode ser por caminho fixo.
//
// Duas condições, em união, e nenhuma delas sozinha varre texto livre:
//   1. chaves que sabidamente carregam rótulo, não conteúdo (`note`, `label`…);
//   2. qualquer string curta que nomeie fornecedor — legenda nossa tem essa
//      cara, e o conteúdo do documento do cliente não cabe em 60 caracteres.
//
// O que deliberadamente NÃO se faz: procurar nome de fornecedor em texto longo.
// `fullText` é o documento do próprio cliente e pode citar qualquer empresa;
// mutilá-lo seria corromper o dado dele para proteger o nosso.
const CHAVES_DE_ROTULO = new Set(['note', 'nota', 'label', 'rotulo', 'descricao', 'description'])
const LIMITE_ROTULO = 60

function ehRotuloDeFornecedor(chave: string, valor: unknown): boolean {
  if (typeof valor !== 'string' || !FORNECEDORES.test(valor)) return false
  return CHAVES_DE_ROTULO.has(chave) || valor.length <= LIMITE_ROTULO
}

// Devolve uma cópia sem as chaves proibidas. Não altera o original — o objeto
// pode vir do cache do drizzle e ser usado em outro lugar.
export function limparTelemetria<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map((item) => limparTelemetria(item)) as unknown as T
  }

  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    const saida: Record<string, unknown> = {}
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      if (CHAVES_PROIBIDAS.has(chave)) continue
      if (ehRotuloDeFornecedor(chave, item)) continue
      saida[chave] = limparTelemetria(item)
    }
    return saida as unknown as T
  }

  return valor
}

// Mensagem de erro que o usuário pode ler.
//
// O worker grava em `jobs.error_message` o que a etapa devolveu — e quando quem
// falha é o fornecedor, isso chega cru: `[juridico] 400 - {"type":"error",...,
// "message":"Your credit balance is too low"}`. Repassar isso conta ao cliente
// qual é o fornecedor, pelo formato do erro, e ainda expõe o estado da nossa
// conta com ele. Também não ajuda ninguém: é erro nosso, não dele.
//
// A etapa entre colchetes é preservada — ela diz em que ponto parou, que é a
// única parte útil para quem está do outro lado.
const GENERICA =
  'Falha ao processar esta etapa. Tente novamente; se o erro persistir, fale com o suporte.'

// Cara de payload de API: JSON cru, escapado, ou "404 - " no começo.
const PAYLOAD_CRU = /\{\s*"|\\"|^\s*\d{3}\s*-\s/

export function limparErro(mensagem: string | null | undefined): string | null {
  if (!mensagem) return mensagem ?? null

  const comEtapa = mensagem.match(/^\s*(\[[a-zà-ú]+\])\s*(.*)$/is)
  const etapa = comEtapa?.[1] ?? ''
  const corpo = comEtapa?.[2] ?? mensagem

  if (FORNECEDORES.test(corpo) || PAYLOAD_CRU.test(corpo)) {
    return etapa ? `${etapa} ${GENERICA}` : GENERICA
  }

  return mensagem
}

// Aplica a limpeza nos campos de um job que carregam payload dos workflows:
// `result` e `stageData` (JSONB do n8n) e `errorMessage` (texto do fornecedor).
// O resto da linha é dado nosso, estruturado.
export function limparJob<T extends { result?: unknown; stageData?: unknown; errorMessage?: string | null }>(
  job: T,
): T {
  return {
    ...job,
    ...('result' in job && { result: limparTelemetria(job.result) }),
    ...('stageData' in job && { stageData: limparTelemetria(job.stageData) }),
    ...('errorMessage' in job && { errorMessage: limparErro(job.errorMessage) }),
  }
}
