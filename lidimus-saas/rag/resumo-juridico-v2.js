// ─── RESUMO JURÍDICO v2 ───────────────────────────────────────────────
// Corrige a fase 1 da arquitetura v2: reparo de JSON quando a IA trunca
// (stop_reason=max_tokens), parecer degradado determinístico nunca-mudo e
// flag `degraded` no callback. Mantém 100% dos HTMLs de saída do nó original.
const analiseNode = $('Análise Jurídica').first().json;
const croquiDados = $('Gerar Croqui SVG').first().json;
const stopReason = analiseNode.stop_reason
  || (analiseNode.choices && analiseNode.choices[0] && analiseNode.choices[0].finish_reason) || null;

// Reparador de JSON: parse direto; se falhar (truncamento), corta no último
// fechamento seguro fora de string e rebalanceia { } [ ] pendentes.
function repararJson(raw) {
  let s = String(raw || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const ini = s.indexOf('{');
  if (ini === -1) return null;
  s = s.slice(ini);
  try { return JSON.parse(s); } catch (e) { /* trunca — repara abaixo */ }
  let inStr = false, escp = false, lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (escp) escp = false; else if (c === '\\') escp = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '}' || c === ']' || c === '"') lastSafe = i;
  }
  if (lastSafe === -1) return null;
  let t = s.slice(0, lastSafe + 1).replace(/,\s*$/, '');
  const st = []; inStr = false; escp = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (escp) escp = false; else if (c === '\\') escp = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') st.push('}'); else if (c === '[') st.push(']');
    else if (c === '}' || c === ']') st.pop();
  }
  while (st.length) t += st.pop();
  try { return JSON.parse(t); } catch (e) { return null; }
}

let analise = repararJson((analiseNode.content || []).find(b => b.type === 'text')?.text
  || ((analiseNode.choices || [])[0] || {}).message?.content || '');
if (analise && analise.analise_matricula) analise = analise.analise_matricula;

let degraded = (stopReason === 'max_tokens' || stopReason === 'length');
if (!analise || typeof analise !== 'object') {
  // Parecer degradado determinístico — NUNCA "indeterminado" mudo.
  degraded = true;
  const oa = croquiDados.onus_ativos || [];
  analise = { legacy_compatibility: {
    classificacao_risco: oa.length > 0 ? 'alto' : 'indeterminado',
    parecer_geral: 'Análise detalhada indisponível (resposta da IA não pôde ser interpretada). '
      + 'Detecção determinística: ' + oa.length + ' ônus ativos sobre o imóvel'
      + (oa.length > 0 ? ' — risco ALTO até verificação individual dos gravames. Reprocessamento recomendado.' : '.'),
    riscos: oa.map(o => ({ tipo: 'onus_ativo', severidade: 'alta',
      descricao: (o.tipo_ato || 'ônus') + ' ' + (o.sequencia || '') + (o.partes ? ' — ' + o.partes : '') + (o.valor ? ' — R$ ' + o.valor : '') })),
  } };
}

const legacy = analise.legacy_compatibility || analise;
// Se a IA truncou antes de gerar classificação/parecer (resumo_executivo e
// legacy_compatibility ficam de fora), deriva ambos dos riscos já parseados.
(function derivar(){
  const temClassif = legacy.classificacao_risco || legacy.nivel_risco
    || (analise.resumo_executivo && analise.resumo_executivo.classificacao_risco);
  if (temClassif) return;
  const riscos = (Array.isArray(legacy.riscos) ? legacy.riscos : (analise.riscos || []));
  const sevs = riscos.map(r => String((r && (r.severidade || r.gravidade || r.nivel)) || '').toLowerCase());
  const nivel = sevs.some(s => s.includes('crit')) ? 'crítico'
    : sevs.some(s => s.includes('alt')) ? 'alto'
    : riscos.length ? 'medio' : 'indeterminado';
  legacy.classificacao_risco = nivel;
  if (!legacy.parecer_geral && !analise.parecer_geral) {
    legacy.parecer_geral = 'Parecer resumido gerado automaticamente (a análise detalhada da IA foi truncada): '
      + riscos.length + ' risco(s) identificado(s) e ' + (croquiDados.onus_ativos || []).length
      + ' ônus ativos sobre o imóvel. Classificação de risco estimada: ' + nivel
      + '. Recomenda-se reprocessamento para o parecer completo.';
  }
  degraded = true;
})();
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function asArray(v){if(Array.isArray(v))return v;if(v==null||v==='')return[];return[v];}
function itemToText(item){if(item==null)return'';if(typeof item==='string'||typeof item==='number')return esc(item);if(typeof item==='object'){const titulo=item.titulo||item.tipo||item.tipo_ato||item.nome||item.sequencia||'';const sev=item.severidade||item.gravidade||item.nivel||item.classificacao||item.risco||'';const desc=item.descricao||item.detalhe||item.texto||item.observacao||item.recomendacao||item.parecer||'';const parts=[];if(titulo)parts.push('<strong>'+esc(titulo)+'</strong>');if(sev)parts.push('<em style="color:#b45309">('+esc(sev)+')</em>');if(desc)parts.push(esc(desc));if(parts.length)return parts.join(' ');const vals=Object.values(item).filter(x=>typeof x==='string'||typeof x==='number').map(x=>esc(x));return vals.join(' — ')||esc(JSON.stringify(item));}return esc(item);}
function listHtml(arr,vazio){const items=asArray(arr).map(itemToText).filter(t=>t&&t.trim());if(!items.length)return'<p style="color:#888;font-size:13px;">'+esc(vazio)+'</p>';return'<ul style="margin:0;padding-left:18px;line-height:1.7">'+items.map(t=>'<li>'+t+'</li>').join('')+'</ul>';}
function listOrEmpty(arr){const items=asArray(arr).map(itemToText).filter(t=>t&&t.trim());if(!items.length)return'';return'<ul style="margin:0;padding-left:18px;line-height:1.7">'+items.map(t=>'<li>'+t+'</li>').join('')+'</ul>';}
const risco=String(legacy.classificacao_risco||legacy.nivel_risco||'indeterminado').toLowerCase().trim();
const RISCO_COR={'baixo':'#16a34a','baixíssimo':'#16a34a','medio':'#d97706','médio':'#d97706','moderado':'#d97706','alto':'#dc2626','crítico':'#991b1b','critico':'#991b1b','critica':'#991b1b','crítica':'#991b1b','altíssimo':'#991b1b','altissimo':'#991b1b','indeterminado':'#6b7280'};
const cor=RISCO_COR[risco]||'#6b7280';
const badge_risco_html='<span style="display:inline-block;background:'+cor+';color:#fff;font-weight:600;font-size:13px;padding:4px 14px;border-radius:14px;text-transform:capitalize">'+esc(legacy.classificacao_risco||legacy.nivel_risco||'Indeterminado')+'</span>';
const parecer=legacy.parecer_geral||legacy.parecer||analise.parecer_geral||(analise.resumo_executivo&&(analise.resumo_executivo.conclusao||analise.resumo_executivo.texto_resumo))||'';
const parecer_juridico_html=parecer?'<p style="line-height:1.7;margin:0">'+esc(parecer)+'</p>':'<p style="color:#888;font-size:13px;">Parecer não disponível.</p>';
const riscos_html=listHtml(legacy.riscos||analise.riscos||analise.alertas,'Nenhum risco identificado.');
const inconsistencias_html=listHtml(legacy.inconsistencias||analise.inconsistencias,'Nenhuma inconsistência identificada.');
const problemas_html=listHtml(legacy.possiveis_problemas||legacy.problemas||analise.possiveis_problemas,'Nenhum problema identificado.');
const onus_juridico_html=listHtml(legacy.onus||analise.onus||(analise.onus_restricoes&&analise.onus_restricoes.onus_ativos),'Nenhum ônus identificado na análise jurídica.');
const gravames_juridico_html=listHtml(legacy.gravames||analise.gravames,'Nenhum gravame identificado.');
const cadeia_dominial_html=listHtml(legacy.cadeia_dominial||(analise.cadeia_dominial&&analise.cadeia_dominial.historico)||analise.cadeia_dominial,'Cadeia dominial não detalhada.');
const total_riscos=asArray(legacy.riscos||analise.riscos||analise.alertas).length;
// linha_tempo montada por CÓDIGO a partir dos atos do parser (não mais pela IA)
const linha_tempo=(croquiDados.atos||[]).map(a=>({sequencia:a.sequencia,data:a.data,tipo:a.tipo_ato,classe:a.classe||null,partes:a.partes||null,valor:a.valor||null,status:a.status,cancelado_por:a.cancelado_por||null}));
return[{json:{...croquiDados,analise_juridica:analise,linha_tempo,resumo_juridico:{classificacao_risco:legacy.classificacao_risco||legacy.nivel_risco||'indeterminado',parecer_geral:parecer,total_riscos,total_onus_ativos:(croquiDados.onus_ativos||[]).length,degraded,stop_reason:stopReason},badge_risco_html,cadeia_dominial_html,riscos_html,inconsistencias_html,problemas_html,onus_juridico_html,gravames_juridico_html,parecer_juridico_html,analise_fundamentacao_html:listOrEmpty(analise.fundamentacao||analise.fundamentacao_legal),analise_classes_juridicas_html:listOrEmpty(analise.classes_juridicas),analise_regras_html:listOrEmpty(analise.regras||analise.regras_aplicadas),analise_resumo_executivo:(typeof analise.resumo_executivo==='string'?analise.resumo_executivo:(analise.resumo_executivo&&(analise.resumo_executivo.conclusao||analise.resumo_executivo.texto_resumo)))||parecer}}];
