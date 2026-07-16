#!/usr/bin/env node
// Fase 1 da arquitetura v2 no workflow lidimus-Juridico:
//   A. Instrui o nó "Análise Jurídica" a produzir JSON ENXUTO (omitir
//      linha_tempo e json_final — montados por código), destravando o teto
//      de 16000 tokens que fazia o parecer chegar "indeterminado" ao app.
//   B. Substitui o nó "Resumo Jurídico" por resumo-juridico-v2.js: reparo de
//      JSON, derivação de risco/parecer quando trunca, parecer degradado
//      nunca-mudo e flag `degraded` no callback.
// Uso (a partir de lidimus-saas/): node rag/fix-analise-v2.cjs
// Idempotente. Faz backup antes do PUT.

const fs = require('node:fs');
const path = require('node:path');

const N8N_HOST = 'https://n8n.gvlar.com';
const WORKFLOW_ID = 'XakDkY7aCjCYkyqt';
const ALLOWED_SETTINGS = ['executionOrder', 'saveManualExecutions', 'saveDataErrorExecution',
  'saveDataSuccessExecution', 'saveExecutionProgress', 'executionTimeout', 'timezone',
  'callerPolicy', 'errorWorkflow'];

const INSTRUCAO_ENXUTA =
  'IMPORTANTE — LIMITE DE TOKENS: produza um JSON ENXUTO. NAO gere os campos '
  + '"linha_tempo" nem "json_final" (sao redundantes e montados por codigo a partir '
  + 'dos ATOS DETECTADOS abaixo). GERE OBRIGATORIAMENTE o bloco "legacy_compatibility" '
  + 'completo (classificacao_risco, parecer_geral, riscos, inconsistencias, onus, gravames, '
  + 'possiveis_problemas, cadeia_dominial) e tambem estado_atual, classes_juridicas, '
  + 'fundamentacao_legal, riscos e resumo_executivo. Conclua primeiro legacy_compatibility '
  + 'e resumo_executivo. Nao repita a lista completa de atos.\\n\\n';

const ALVO = "'Analise a matrícula abaixo e retorne JSON completo.\\n\\n'";
const NOVO = "'Analise a matrícula abaixo e retorne JSON completo.\\n\\n' + '" + INSTRUCAO_ENXUTA + "'";

function loadEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  if (!env.N8N_API_KEY) throw new Error('N8N_API_KEY vazia em lidimus-saas/.env');
  return env;
}

async function n8n(env, metodo, caminho, body) {
  const resp = await fetch(`${N8N_HOST}/api/v1${caminho}`, {
    method: metodo,
    headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await resp.text();
  if (!resp.ok) throw new Error(`${metodo} ${caminho} → ${resp.status}: ${texto.slice(0, 500)}`);
  return texto ? JSON.parse(texto) : {};
}

async function main() {
  const env = loadEnv();
  const wf = await n8n(env, 'GET', `/workflows/${WORKFLOW_ID}`);

  // Backup
  const backupPath = path.join(__dirname, `backup-workflow-juridico-v2-${new Date().toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(backupPath)) { fs.writeFileSync(backupPath, JSON.stringify(wf, null, 2)); console.log(`Backup: ${backupPath}`); }

  // A. Patch do jsonBody
  const analise = wf.nodes.find(n => n.name === 'Análise Jurídica');
  if (!analise) throw new Error('Nó "Análise Jurídica" não encontrado');
  if (analise.parameters.jsonBody.includes('LIMITE DE TOKENS')) {
    console.log('jsonBody já contém a instrução enxuta — mantendo.');
  } else if (analise.parameters.jsonBody.includes(ALVO)) {
    analise.parameters.jsonBody = analise.parameters.jsonBody.replace(ALVO, NOVO);
    console.log('A. jsonBody patchado com a instrução de saída enxuta.');
  } else {
    throw new Error('Padrão ALVO não encontrado no jsonBody — verifique se o RAG foi aplicado antes.');
  }

  // B. Substituição do jsCode do Resumo Jurídico
  const resumo = wf.nodes.find(n => n.name === 'Resumo Jurídico');
  if (!resumo) throw new Error('Nó "Resumo Jurídico" não encontrado');
  resumo.parameters.jsCode = fs.readFileSync(path.join(__dirname, 'resumo-juridico-v2.js'), 'utf8');
  console.log('B. jsCode do "Resumo Jurídico" substituído pela versão v2 (reparo + degradado).');

  // PUT
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => ALLOWED_SETTINGS.includes(k)));
  const salvo = await n8n(env, 'PUT', `/workflows/${WORKFLOW_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections, settings,
  });
  console.log(`PUT ok — ${salvo.nodes.length} nós.`);

  const depois = await n8n(env, 'GET', `/workflows/${WORKFLOW_ID}`);
  if (depois.versionId && depois.activeVersionId && depois.versionId !== depois.activeVersionId) {
    await n8n(env, 'POST', `/workflows/${WORKFLOW_ID}/deactivate`);
    await n8n(env, 'POST', `/workflows/${WORKFLOW_ID}/activate`);
    console.log('Republicado.');
  } else {
    console.log('Versão publicada confere. Pronto.');
  }
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
