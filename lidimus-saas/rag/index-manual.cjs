#!/usr/bin/env node
// Indexa o Manual Prático do Registro de Imóveis no Qdrant (RAG do lidimus-Juridico).
// Uso (a partir de lidimus-saas/): node rag/index-manual.cjs            → indexação completa
//                                  node rag/index-manual.cjs --dry-run  → só chunking (sem APIs)
// Lê MISTRAL_API_KEY, QDRANT_URL, QDRANT_API_KEY de lidimus-saas/.env (exceto --dry-run).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RAG_DIR = __dirname;
const SKILL_DIR = path.join(RAG_DIR, '..', '..', '.claude', 'skills', 'manual-pratico-registro-imoveis');
const COLLECTION = 'manual_registro_imoveis';
const VECTOR_SIZE = 1024;
const EMBED_MODEL = 'mistral-embed';
const EMBED_BATCH = 32;
const UPSERT_BATCH = 64;
const MAX_SECAO = 6000;   // chars — acima disso subdivide por ###
const MIN_SECAO = 200;    // chars — abaixo disso funde com a próxima
const NAMESPACE_UUID = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'; // fixo → ids determinísticos

// Temas por capítulo — usados como metadado de filtro/inspeção
const CAP_TEMAS = {
  ch01: ['hipoteca', 'garantia real'],
  ch02: ['alienacao fiduciaria', 'consolidacao', 'mora'],
  ch03: ['locacao', 'clausula de vigencia'],
  ch04: ['penhor', 'maquinas'],
  ch05: ['servidao'],
  ch06: ['usufruto', 'uso', 'habitacao'],
  ch07: ['compromisso de compra e venda'],
  ch08: ['anticrese'],
  ch09: ['compra e venda'],
  ch10: ['permuta'],
  ch11: ['dacao em pagamento'],
  ch12: ['doacao'],
  ch13: ['enfiteuse'],
  ch14: ['titulos judiciais', 'adjudicacao'],
  ch15: ['arrematacao', 'adjudicacao', 'hasta publica'],
  ch16: ['penhora', 'arresto', 'indisponibilidade', 'constricao judicial'],
  ch17: ['averbacao premonitoria', 'fraude a execucao'],
  ch18: ['citacao', 'acoes reais'],
  ch19: ['inventario', 'arrolamento', 'partilha'],
  ch20: ['usucapiao'],
  ch21: ['imissao provisoria na posse', 'desapropriacao'],
  ch22: ['reserva legal', 'app', 'ambiental'],
  ch23: ['tombamento'],
  ch24: ['cedulas de credito'],
  ch25: ['penhor rural'],
  ch26: ['incorporacao', 'condominio'],
  ch27: ['parcelamento do solo', 'loteamento'],
  ch28: ['procedimento de duvida', 'qualificacao'],
  skill: ['principios', 'indice', 'jurisprudencia', 'legislacao'],
  cheatsheet: ['resumo', 'consulta rapida'],
  glossary: ['glossario', 'terminologia'],
  patterns: ['padroes', 'antipadroes'],
};

function loadEnv() {
  const envPath = path.join(RAG_DIR, '..', '.env');
  if (!fs.existsSync(envPath)) throw new Error('lidimus-saas/.env não encontrado');
  const env = {};
  for (const linha of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  for (const k of ['MISTRAL_API_KEY', 'QDRANT_URL', 'QDRANT_API_KEY']) {
    if (!env[k]) throw new Error(`Variável ${k} vazia em lidimus-saas/.env`);
  }
  env.QDRANT_URL = env.QDRANT_URL.replace(/\/+$/, '');
  return env;
}

// UUIDv5 (SHA-1) determinístico
function uuidv5(name, namespace) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // versão 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function extrairArtigos(texto) {
  const achados = new Set();
  const padroes = [
    /\bart(?:igo)?s?\.?\s*[\d]+(?:[\.\-][\dA-Za-z]+)*(?:\s*,?\s*§+\s*[\dº°]+)?(?:\s*,?\s*(?:da|do)\s+(?:Lei\s*n?[ºo°]?\s*[\d\.]+\/\d{2,4}|CC|CPC|CF(?:\/88)?|CTN|LRP))?/gi,
    /\bLei\s*n?[ºo°]?\s*[\d\.]+\/\d{2,4}/gi,
    /\bDecreto[- ]Lei\s*n?[ºo°]?\s*[\d\.]+/gi,
    /\bS[úu]mula\s*(?:Vinculante\s*)?\d+(?:\s*(?:do\s+)?STJ|\s*(?:do\s+)?STF)?/gi,
    /\bREsp\s*[\d\.\/A-Z\-]+/gi,
  ];
  for (const re of padroes) {
    for (const m of texto.matchAll(re)) {
      const v = m[0].replace(/\s+/g, ' ').trim();
      if (v.length >= 6) achados.add(v);
    }
  }
  return [...achados].slice(0, 20);
}

function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'secao';
}

function dividirPorHeading(texto, nivel) {
  // Divide preservando o heading em cada parte; a parte antes do 1º heading vem com titulo null
  const re = new RegExp(`^${'#'.repeat(nivel)}\\s+(.+)$`, 'gm');
  const partes = [];
  let ultimoIdx = 0, ultimoTitulo = null, m;
  while ((m = re.exec(texto)) !== null) {
    const corpo = texto.slice(ultimoIdx, m.index).trim();
    if (corpo) partes.push({ titulo: ultimoTitulo, texto: corpo });
    ultimoTitulo = m[1].trim();
    ultimoIdx = m.index + m[0].length;
  }
  const resto = texto.slice(ultimoIdx).trim();
  if (resto || ultimoTitulo) partes.push({ titulo: ultimoTitulo, texto: resto });
  return partes;
}

function chunkearArquivo(relPath, conteudo) {
  const base = path.basename(relPath, '.md');
  const capMatch = base.match(/^(ch\d{2})/);
  const capitulo = capMatch ? capMatch[1] : base.toLowerCase().replace('skill', 'skill');
  const capKey = capMatch ? capMatch[1] : (base === 'SKILL' ? 'skill' : base.toLowerCase());
  const tituloDoc = (conteudo.match(/^#\s+(.+)$/m) || [null, base])[1].replace(/^Cap[íi]tulo\s+\d+\s*[—-]\s*/i, '').trim();

  const secoes = [];
  for (const sec of dividirPorHeading(conteudo, 2)) {
    const titulo = sec.titulo || 'Introdução';
    if (sec.texto.length > MAX_SECAO) {
      const subs = dividirPorHeading(sec.texto, 3);
      if (subs.length > 1) {
        for (const sub of subs) {
          if (sub.texto) secoes.push({ titulo: sub.titulo ? `${titulo} > ${sub.titulo}` : titulo, texto: sub.texto });
        }
        continue;
      }
    }
    if (sec.texto) secoes.push({ titulo, texto: sec.texto });
  }

  // Funde seções minúsculas com a seguinte
  const fundidas = [];
  for (const s of secoes) {
    const anterior = fundidas[fundidas.length - 1];
    if (anterior && anterior.texto.length < MIN_SECAO) {
      anterior.titulo = `${anterior.titulo} / ${s.titulo}`;
      anterior.texto = `${anterior.texto}\n\n${s.texto}`;
    } else {
      fundidas.push({ ...s });
    }
  }

  return fundidas.map((s, ordem) => ({
    id: uuidv5(`${relPath}#${slug(s.titulo)}#${ordem}`, NAMESPACE_UUID),
    textoEmbed: `${tituloDoc} > ${s.titulo}\n\n${s.texto}`,
    payload: {
      fonte: relPath.replace(/\\/g, '/'),
      capitulo: capKey,
      titulo_capitulo: tituloDoc,
      titulo_secao: s.titulo,
      ordem,
      temas: CAP_TEMAS[capKey] || [],
      artigos_citados: extrairArtigos(s.texto),
      texto: s.texto,
    },
  }));
}

async function reqJson(url, options, tentativas = 3) {
  for (let i = 1; ; i++) {
    const resp = await fetch(url, options);
    if (resp.status === 429 || resp.status >= 500) {
      if (i >= tentativas) throw new Error(`${options.method || 'GET'} ${url} → ${resp.status}: ${await resp.text()}`);
      await new Promise(r => setTimeout(r, 1500 * i));
      continue;
    }
    const body = await resp.text();
    if (!resp.ok) throw new Error(`${options.method || 'GET'} ${url} → ${resp.status}: ${body.slice(0, 400)}`);
    return body ? JSON.parse(body) : {};
  }
}

async function embedLote(env, textos) {
  const resp = await reqJson('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: textos }),
  });
  return resp.data.map(d => d.embedding);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // 1. Coleta e chunking
  const arquivos = ['SKILL.md', 'cheatsheet.md', 'glossary.md', 'patterns.md',
    ...fs.readdirSync(path.join(SKILL_DIR, 'chapters')).filter(f => f.endsWith('.md')).map(f => path.join('chapters', f))];
  let chunks = [];
  for (const rel of arquivos) {
    const conteudo = fs.readFileSync(path.join(SKILL_DIR, rel), 'utf8');
    chunks = chunks.concat(chunkearArquivo(rel, conteudo));
  }
  console.log(`Arquivos lidos: ${arquivos.length} | Chunks gerados: ${chunks.length}`);

  if (dryRun) {
    const tamanhos = chunks.map(c => c.payload.texto.length).sort((a, b) => a - b);
    const soma = tamanhos.reduce((a, b) => a + b, 0);
    console.log(`Tamanho dos chunks (chars): min ${tamanhos[0]} | mediana ${tamanhos[Math.floor(tamanhos.length / 2)]} | max ${tamanhos[tamanhos.length - 1]} | média ${Math.round(soma / tamanhos.length)}`);
    const comRefs = chunks.filter(c => c.payload.artigos_citados.length > 0).length;
    console.log(`Chunks com referências legais extraídas: ${comRefs}/${chunks.length}`);
    console.log('\nAmostra de 5 chunks:');
    for (const c of [chunks[0], chunks[10] || chunks[1], chunks[Math.floor(chunks.length / 2)], chunks[chunks.length - 10] || chunks[2], chunks[chunks.length - 1]]) {
      console.log(`- [${c.payload.capitulo}] ${c.payload.titulo_capitulo} > ${c.payload.titulo_secao}`
        + ` | ${c.payload.texto.length} chars | refs: ${c.payload.artigos_citados.slice(0, 3).join('; ') || '(nenhuma)'}`);
    }
    return;
  }

  const env = loadEnv();
  const qdrant = (p, opt = {}) => reqJson(`${env.QDRANT_URL}${p}`, {
    ...opt,
    headers: { 'api-key': env.QDRANT_API_KEY, 'Content-Type': 'application/json', ...(opt.headers || {}) },
  });

  // 2. Recria a collection (limpa — evita chunks órfãos após reestruturações)
  try { await qdrant(`/collections/${COLLECTION}`, { method: 'DELETE' }); } catch { /* não existia */ }
  await qdrant(`/collections/${COLLECTION}`, {
    method: 'PUT',
    body: JSON.stringify({ vectors: { size: VECTOR_SIZE, distance: 'Cosine' } }),
  });
  console.log(`Collection "${COLLECTION}" recriada (size=${VECTOR_SIZE}, Cosine).`);

  // 3. Embeddings em lotes
  const vetores = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const lote = chunks.slice(i, i + EMBED_BATCH);
    const embs = await embedLote(env, lote.map(c => c.textoEmbed));
    vetores.push(...embs);
    process.stdout.write(`\rEmbeddings: ${Math.min(i + EMBED_BATCH, chunks.length)}/${chunks.length}`);
    await new Promise(r => setTimeout(r, 300)); // gentileza com rate limit
  }
  console.log('');

  // 4. Upsert
  for (let i = 0; i < chunks.length; i += UPSERT_BATCH) {
    const pontos = chunks.slice(i, i + UPSERT_BATCH).map((c, j) => ({
      id: c.id, vector: vetores[i + j], payload: c.payload,
    }));
    await qdrant(`/collections/${COLLECTION}/points?wait=true`, {
      method: 'PUT', body: JSON.stringify({ points: pontos }),
    });
    process.stdout.write(`\rUpsert: ${Math.min(i + UPSERT_BATCH, chunks.length)}/${chunks.length}`);
  }
  console.log('');

  // 5. Confirmação + amostra
  const info = await qdrant(`/collections/${COLLECTION}`);
  console.log(`points_count no Qdrant: ${info.result.points_count}`);
  console.log('\nAmostra de 3 payloads:');
  for (const c of [chunks[0], chunks[Math.floor(chunks.length / 2)], chunks[chunks.length - 1]]) {
    console.log(`- [${c.payload.capitulo}] ${c.payload.titulo_capitulo} > ${c.payload.titulo_secao}`
      + ` | ${c.payload.texto.length} chars | refs: ${c.payload.artigos_citados.slice(0, 3).join('; ') || '(nenhuma)'}`);
  }
}

main().catch(e => { console.error('\nERRO:', e.message); process.exit(1); });
