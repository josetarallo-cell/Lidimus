// Trava contra disparo acidental dos scripts de manutenção contra produção.
//
// Estes scripts nasceram quando o único ambiente era produção: o host do n8n e
// o id do workflow vinham hardcoded, e rodar o arquivo "só para ver" fazia PUT
// no workflow ao vivo ou reindexava a coleção Qdrant que o lidimus-Juridico
// consulta. Agora que existe sandbox (docs/15-sandbox.md), o alvo continua
// sendo produção — mas precisa ser dito em voz alta.
//
// Como liberar a escrita, em ordem de preferência:
//   node rag/<script>.cjs --confirmar-producao
//   LIDIMUS_ENV=producao node rag/<script>.cjs
//
// Como apontar para outro alvo (n8n próprio, coleção de teste):
//   N8N_HOST=http://localhost:5678 N8N_WORKFLOW_ID=abc123 node rag/<script>.cjs
//   QDRANT_COLLECTION=manual_teste node rag/index-manual.cjs
// Alvo diferente do padrão dispensa a confirmação — a trava é para o padrão.

const N8N_HOST_PADRAO = 'https://n8n.gvlar.com';
const WORKFLOW_ID_PADRAO = 'XakDkY7aCjCYkyqt';
const COLLECTION_PADRAO = 'manual_registro_imoveis';

const alvoN8n = () => ({
  host: (process.env.N8N_HOST || N8N_HOST_PADRAO).replace(/\/+$/, ''),
  workflowId: process.env.N8N_WORKFLOW_ID || WORKFLOW_ID_PADRAO,
});

const alvoQdrant = () => process.env.QDRANT_COLLECTION || COLLECTION_PADRAO;

function ehProducao(alvo) {
  return alvo.host === N8N_HOST_PADRAO || alvo.workflowId === WORKFLOW_ID_PADRAO;
}

function confirmado() {
  return process.argv.includes('--confirmar-producao') || process.env.LIDIMUS_ENV === 'producao';
}

// Chamar ANTES da primeira escrita. `descricao` aparece no aviso.
function exigirConfirmacao(descricao, alvo) {
  if (!ehProducao(alvo) || confirmado()) return;
  console.error(
    `\nEste script vai ESCREVER em produção: ${descricao}\n` +
    `  n8n:      ${alvo.host}\n` +
    (alvo.workflowId ? `  workflow: ${alvo.workflowId}\n` : '') +
    (alvo.collection ? `  coleção:  ${alvo.collection}\n` : '') +
    `\nO workflow é compartilhado com o site no ar — a alteração vale na hora,\n` +
    `inclusive para os jobs dos clientes.\n` +
    `\nSe é isso mesmo, repita com --confirmar-producao.\n`,
  );
  process.exit(1);
}

// Idem para o Qdrant. Separado porque o alvo é a coleção, não o workflow — e
// a reindexação apaga e recria a coleção que o lidimus-Juridico consulta em
// produção, então o estrago é imediato mesmo sem tocar no n8n.
function exigirConfirmacaoQdrant(descricao, collection) {
  if (collection !== COLLECTION_PADRAO || confirmado()) return;
  console.error(
    `\nEste script vai APAGAR E RECRIAR a coleção Qdrant de produção: ${descricao}\n` +
    `  coleção: ${collection}\n` +
    `\nÉ a mesma que o workflow lidimus-Juridico consulta — durante a reindexação\n` +
    `as buscas dos clientes voltam vazias, e embeddings Mistral são cobrados.\n` +
    `\nSe é isso mesmo, repita com --confirmar-producao.\n` +
    `Para um alvo de teste: QDRANT_COLLECTION=manual_teste node rag/index-manual.cjs\n`,
  );
  process.exit(1);
}

module.exports = {
  alvoN8n, alvoQdrant, ehProducao, exigirConfirmacao, exigirConfirmacaoQdrant,
  N8N_HOST_PADRAO, COLLECTION_PADRAO,
};
