#!/usr/bin/env node
// Aplica o RAG ao workflow lidimus-Juridico (n8n.gvlar.com):
//   1. garante as credenciais httpHeaderAuth (Qdrant + Mistral RAG)
//   2. faz backup do workflow
//   3. insere/atualiza os 4 nós de retrieval e religa as conexões
//   4. patcha o jsonBody do nó "Análise Jurídica" para injetar os fundamentos
//   5. PUT e verificação de publicação
// Uso: node rag/push-workflow-rag.cjs
// Idempotente: rodar de novo atualiza os nós existentes sem duplicar.

const fs = require('node:fs');
const path = require('node:path');

// Alvo: produção por padrão, sobrescrevível por N8N_HOST/N8N_WORKFLOW_ID/
// QDRANT_COLLECTION. Escrever no padrão exige --confirmar-producao — ver
// rag/guarda-producao.cjs.
const { alvoN8n, alvoQdrant, exigirConfirmacao } = require('./guarda-producao.cjs');
const { host: N8N_HOST, workflowId: WORKFLOW_ID } = alvoN8n();
const COLLECTION = alvoQdrant();
const CRED_CACHE = path.join(__dirname, '.credentials-created.json');
const ALLOWED_SETTINGS = ['executionOrder', 'saveManualExecutions', 'saveDataErrorExecution',
  'saveDataSuccessExecution', 'saveExecutionProgress', 'executionTimeout', 'timezone',
  'callerPolicy', 'errorWorkflow'];

function loadEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  for (const k of ['N8N_API_KEY', 'QDRANT_URL', 'QDRANT_API_KEY', 'MISTRAL_API_KEY']) {
    if (!env[k]) throw new Error(`Variável ${k} vazia em lidimus-saas/.env`);
  }
  env.QDRANT_URL = env.QDRANT_URL.replace(/\/+$/, '');
  env.SCORE_THRESHOLD = parseFloat(env.SCORE_THRESHOLD || '0.55');
  return env;
}

async function n8n(env, metodo, caminho, body) {
  const resp = await fetch(`${N8N_HOST}/api/v1${caminho}`, {
    method: metodo,
    headers: {
      'X-N8N-API-KEY': env.N8N_API_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'curl/8.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await resp.text();
  if (!resp.ok) throw new Error(`${metodo} ${caminho} → ${resp.status}: ${texto.slice(0, 500)}`);
  return texto ? JSON.parse(texto) : {};
}

async function garantirCredenciais(env) {
  let cache = {};
  if (fs.existsSync(CRED_CACHE)) cache = JSON.parse(fs.readFileSync(CRED_CACHE, 'utf8'));
  if (!cache.qdrant) {
    const c = await n8n(env, 'POST', '/credentials', {
      name: 'Qdrant API - lidimus (RAG)',
      type: 'httpHeaderAuth',
      data: { name: 'api-key', value: env.QDRANT_API_KEY },
    });
    cache.qdrant = { id: c.id, name: c.name };
    console.log(`Credencial Qdrant criada: ${c.id}`);
  }
  if (!cache.mistral) {
    const c = await n8n(env, 'POST', '/credentials', {
      name: 'Mistral API - RAG (header)',
      type: 'httpHeaderAuth',
      data: { name: 'Authorization', value: `Bearer ${env.MISTRAL_API_KEY}` },
    });
    cache.mistral = { id: c.id, name: c.name };
    console.log(`Credencial Mistral RAG criada: ${c.id}`);
  }
  fs.writeFileSync(CRED_CACHE, JSON.stringify(cache, null, 2));
  return cache;
}

// ─── Código dos nós Code ────────────────────────────────────────────────────
const CODIGO_CONSULTAS = [
  "const dados = $('Gerar Croqui SVG').first().json;",
  'const atos = dados.atos || [];',
  'const onus = dados.onus_ativos || [];',
  'const MAPA = {',
  "  hipoteca: ['hipoteca constituição requisitos extinção e cancelamento do registro'],",
  "  transporte_onus_hipoteca: ['hipoteca constituição requisitos extinção e cancelamento do registro'],",
  "  penhora: ['penhora arresto constrição judicial averbação e efeitos perante terceiros'],",
  "  arresto: ['penhora arresto constrição judicial averbação e efeitos perante terceiros'],",
  "  transporte_onus_penhora: ['penhora transportada de matrícula anterior cancelamento', 'fraude à execução penhora averbada presunção contra terceiro adquirente'],",
  "  transporte_onus_arresto: ['penhora arresto constrição judicial averbação e efeitos perante terceiros'],",
  "  transporte_onus: ['ônus transportados abertura de matrícula continuidade registral'],",
  "  cancelamento_onus: ['cancelamento de ônus e de registros requisitos e formalidades'],",
  "  cancelamento: ['cancelamento de ônus e de registros requisitos e formalidades'],",
  "  adjudicacao: ['carta de adjudicação título judicial efeitos sobre gravames anteriores'],",
  "  arrematacao: ['carta de arrematação hasta pública aquisição efeitos sobre penhoras'],",
  "  destacamento: ['desapropriação destacamento de área abertura de matrícula área remanescente'],",
  "  retificacao: ['retificação de registro erro procedimento'],",
  "  compra_e_venda: ['compra e venda registro qualificação do título'],",
  "  alienacao_fiduciaria: ['alienação fiduciária consolidação da propriedade mora'],",
  "  usufruto: ['usufruto uso e habitação constituição e extinção'],",
  "  doacao: ['doação cláusulas de inalienabilidade e reversão'],",
  "  heranca: ['inventário arrolamento partilha registro do formal'],",
  "  partilha: ['inventário arrolamento partilha registro do formal'],",
  '};',
  'const consultas = [];',
  'for (const a of atos) { for (const q of (MAPA[a.tipo_ato] || [])) { if (!consultas.includes(q)) consultas.push(q); } }',
  "if (onus.length > 0) { const q = 'fraude à execução penhora inscrita presunção absoluta perante terceiros'; if (!consultas.includes(q)) consultas.push(q); }",
  "if (consultas.length === 0) consultas.push('princípios do registro de imóveis qualificação continuidade');",
  'return [{ json: { consultas: consultas.slice(0, 6) } }];',
].join('\n');

const CODIGO_CONSOLIDAR = [
  'let hits = [];',
  'try {',
  '  const resp = $input.first().json || {};',
  '  for (const grupo of (resp.result || [])) { for (const h of (grupo || [])) { if (h && h.payload) hits.push(h); } }',
  '} catch (e) {}',
  'const porId = new Map();',
  'for (const h of hits) { const k = String(h.id); if (!porId.has(k) || porId.get(k).score < h.score) porId.set(k, h); }',
  'const top = [...porId.values()].sort((a, b) => b.score - a.score).slice(0, 8);',
  "let fundamentos_rag = '';",
  'if (top.length) {',
  '  let total = 0; const partes = [];',
  '  top.forEach((h, i) => {',
  "    const p = h.payload; const texto = String(p.texto || '');",
  '    if (total + texto.length > 12000) return;',
  '    total += texto.length;',
  "    const refs = (p.artigos_citados || []).slice(0, 8).join('; ');",
  "    partes.push('[' + (i + 1) + '] ' + p.capitulo + ' — ' + p.titulo_capitulo + ' > ' + p.titulo_secao + ' (score ' + h.score.toFixed(2) + ')\\n' + texto + (refs ? '\\nReferências citadas: ' + refs : ''));",
  '  });',
  '  if (partes.length) {',
  "    fundamentos_rag = '=== FUNDAMENTOS RECUPERADOS (Manual Prático do Registro de Imóveis) ===\\n'",
  "      + partes.join('\\n---\\n')",
  "      + '\\n=== FIM DOS FUNDAMENTOS ===\\n'",
  "      + 'INSTRUÇÃO: fundamente cada apontamento prioritariamente nos FUNDAMENTOS RECUPERADOS acima, citando capítulo/seção; não invente artigos que não constem dos fundamentos nem da skill. Se o bloco estiver vazio, proceda normalmente.\\n\\n';",
  '  }',
  '}',
  'return [{ json: { fundamentos_rag } }];',
].join('\n');

function montarNos(env, creds) {
  return [
    {
      id: 'node-rag-consultas',
      name: 'Montar Consultas RAG',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2420, 80],
      parameters: { jsCode: CODIGO_CONSULTAS },
    },
    {
      id: 'node-rag-embed',
      name: 'Embeddings Consultas',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.4,
      position: [2560, 80],
      onError: 'continueRegularOutput',
      parameters: {
        method: 'POST',
        url: 'https://api.mistral.ai/v1/embeddings',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ model: 'mistral-embed', input: $json.consultas || [] }) }}",
        options: {},
      },
      credentials: { httpHeaderAuth: { id: creds.mistral.id, name: creds.mistral.name } },
    },
    {
      id: 'node-rag-qdrant',
      name: 'Buscar Qdrant',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.4,
      position: [2700, 80],
      onError: 'continueRegularOutput',
      parameters: {
        method: 'POST',
        url: `${env.QDRANT_URL}/collections/${COLLECTION}/points/search/batch`,
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ searches: (($json.data) || []).map(d => ({ vector: d.embedding, limit: 4, score_threshold: ${env.SCORE_THRESHOLD}, with_payload: true })) }) }}`,
        options: {},
      },
      credentials: { httpHeaderAuth: { id: creds.qdrant.id, name: creds.qdrant.name } },
    },
    {
      id: 'node-rag-consolidar',
      name: 'Consolidar Fundamentos',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2840, 80],
      parameters: { jsCode: CODIGO_CONSOLIDAR },
    },
  ];
}

// Patch do jsonBody do nó "Análise Jurídica"
const ALVO_JSONBODY = "content: 'Analise a matrícula abaixo e retorne JSON completo.\\n\\nATOS DETECTADOS:\\n'";
const NOVO_JSONBODY = "content: 'Analise a matrícula abaixo e retorne JSON completo.\\n\\n' + String($('Consolidar Fundamentos').first()?.json?.fundamentos_rag || '') + 'ATOS DETECTADOS:\\n'";

async function main() {
  const env = loadEnv();

  // Antes de qualquer escrita: criar credenciais já altera o n8n.
  exigirConfirmacao('credenciais + nós de RAG no workflow lidimus-Juridico',
    { host: N8N_HOST, workflowId: WORKFLOW_ID, collection: COLLECTION });

  // 1. Credenciais
  const creds = await garantirCredenciais(env);

  // 2. GET + backup
  const wf = await n8n(env, 'GET', `/workflows/${WORKFLOW_ID}`);
  const dataStr = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(__dirname, `backup-workflow-juridico-${dataStr}.json`);
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, JSON.stringify(wf, null, 2));
    console.log(`Backup salvo em ${backupPath}`);
  }

  // 3. Nós (substitui se já existirem — idempotente)
  const nomesRag = ['Montar Consultas RAG', 'Embeddings Consultas', 'Buscar Qdrant', 'Consolidar Fundamentos'];
  const nodes = wf.nodes.filter(n => !nomesRag.includes(n.name));
  nodes.push(...montarNos(env, creds));

  // 4. Patch do jsonBody
  const analise = nodes.find(n => n.name === 'Análise Jurídica');
  if (!analise) throw new Error('Nó "Análise Jurídica" não encontrado no workflow');
  if (analise.parameters.jsonBody.includes('Consolidar Fundamentos')) {
    console.log('jsonBody já patchado — mantendo.');
  } else if (analise.parameters.jsonBody.includes(ALVO_JSONBODY)) {
    analise.parameters.jsonBody = analise.parameters.jsonBody.replace(ALVO_JSONBODY, NOVO_JSONBODY);
    console.log('jsonBody do nó "Análise Jurídica" patchado com os fundamentos.');
  } else {
    throw new Error('Padrão do jsonBody não encontrado — o nó "Análise Jurídica" mudou; ajuste ALVO_JSONBODY.');
  }

  // 5. Conexões: Carregar Skill → [4 nós RAG] → Análise Jurídica
  const connections = { ...wf.connections };
  connections['Carregar Skill Analise Juridica'] = {
    main: [[{ node: 'Montar Consultas RAG', type: 'main', index: 0 }]],
  };
  connections['Montar Consultas RAG'] = { main: [[{ node: 'Embeddings Consultas', type: 'main', index: 0 }]] };
  connections['Embeddings Consultas'] = { main: [[{ node: 'Buscar Qdrant', type: 'main', index: 0 }]] };
  connections['Buscar Qdrant'] = { main: [[{ node: 'Consolidar Fundamentos', type: 'main', index: 0 }]] };
  connections['Consolidar Fundamentos'] = { main: [[{ node: 'Análise Jurídica', type: 'main', index: 0 }]] };

  // 6. PUT
  const settings = Object.fromEntries(
    Object.entries(wf.settings || {}).filter(([k]) => ALLOWED_SETTINGS.includes(k)));
  const salvo = await n8n(env, 'PUT', `/workflows/${WORKFLOW_ID}`, {
    name: wf.name, nodes, connections, settings,
  });
  console.log(`PUT ok — ${salvo.nodes.length} nós no workflow.`);

  // 7. Verificação de publicação (neste n8n o PUT publica direto; conferir)
  const depois = await n8n(env, 'GET', `/workflows/${WORKFLOW_ID}`);
  if (depois.versionId && depois.activeVersionId && depois.versionId !== depois.activeVersionId) {
    console.log('versionId difere de activeVersionId — republicando (deactivate/activate)...');
    await n8n(env, 'POST', `/workflows/${WORKFLOW_ID}/deactivate`);
    await n8n(env, 'POST', `/workflows/${WORKFLOW_ID}/activate`);
    console.log('Workflow republicado.');
  } else {
    console.log('Versão publicada confere. Pronto.');
  }
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
