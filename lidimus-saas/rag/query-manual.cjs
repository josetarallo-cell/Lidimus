#!/usr/bin/env node
// Busca de calibração no índice do manual. Uso:
//   node rag/query-manual.cjs "penhora transportada de matrícula anterior cancelamento"

const fs = require('node:fs');
const path = require('node:path');

const COLLECTION = 'manual_registro_imoveis';

function loadEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  env.QDRANT_URL = (env.QDRANT_URL || '').replace(/\/+$/, '');
  return env;
}

async function main() {
  const consulta = process.argv.slice(2).join(' ').trim();
  if (!consulta) { console.error('Uso: node rag/query-manual.cjs "<consulta>"'); process.exit(1); }
  const env = loadEnv();

  const emb = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'mistral-embed', input: [consulta] }),
  }).then(r => r.json());
  if (!emb.data) { console.error('Falha no embedding:', JSON.stringify(emb).slice(0, 300)); process.exit(1); }

  const busca = await fetch(`${env.QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'api-key': env.QDRANT_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector: emb.data[0].embedding, limit: 5, with_payload: true }),
  }).then(r => r.json());
  if (!busca.result) { console.error('Falha na busca:', JSON.stringify(busca).slice(0, 300)); process.exit(1); }

  console.log(`Consulta: "${consulta}"\n`);
  for (const hit of busca.result) {
    const p = hit.payload;
    console.log(`score ${hit.score.toFixed(3)} | [${p.capitulo}] ${p.titulo_capitulo} > ${p.titulo_secao}`);
    console.log(`  ${String(p.texto).replace(/\s+/g, ' ').slice(0, 200)}...\n`);
  }
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
