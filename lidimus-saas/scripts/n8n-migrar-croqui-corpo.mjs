// Corpo da requisição à Anthropic e código dos nós "Validar JSON" e "Montar
// Callback" do lidimus-croqui — a migração da `Extracao Croqui` de Mistral para
// Anthropic, feita em 04/09/2026 pelo mesmo motivo do lidimus-Juridico: a conta
// Mistral caiu para o tier gratuito e o `mistral-medium` passou a responder 429.
//
// SOMENTE DADOS — nenhum efeito colateral, nenhuma chamada de rede. Separado do
// n8n-migrar-croqui.mjs para que dê para exercitar este corpo contra a API real
// sem que o arquivo executado contenha um PUT em produção.
//
// Os textos dos prompts são os mesmos que já estavam no ar — trocar de provedor
// não é motivo para reescrever prompt em produção. Sem acento nos trechos que
// viram código de nó, como o resto deste workflow.

// Prompt de sistema de reserva, usado quando o endpoint da skill não responde.
// Copiado literalmente do nó antigo.
const SISTEMA_RESERVA =
  'Voce e um especialista em levantamentos topograficos e registros imobiliarios brasileiros. Interprete a descricao do perimetro do terreno (matricula, certidao ou memorial descritivo) e retorne EXCLUSIVAMENTE um JSON valido com os campos: formato (retangular|retangular_4lados|deflexao|azimute|rumo|utm|confrontantes|irregular|nao_identificado), croqui_viavel (boolean), precisao (exata|aproximada|esquematica|null), sentido_descricao, rua_frente, testada, profundidade, area_descrita_m2, area_calculada_m2, segmentos (array com de, ate, tipo, distancia, confrontante, azimute_raw, rumo_raw, angulo_interno_raw, deflexao_lado, raio_m, desenvolvimento_m), vertices_utm, observacoes. Nao converta angulos: copie-os como escritos nos campos *_raw. Distancias em metros.'

const PEDIDO =
  'Interprete a descricao do perimetro do imovel no documento abaixo — pode ser uma matricula, uma certidao de matricula ou um memorial descritivo de topografo (texto extraido por OCR, pode conter artefatos). A ausencia de campos tipicos de matricula (cartorio, livro, cadeia de atos) NAO e motivo para recusar: interprete a geometria assim mesmo. Retorne SOMENTE o JSON no formato especificado, sem texto adicional.\\n\\nTEXTO DO DOCUMENTO:\\n'

// Três diferenças em relação ao corpo antigo, e o motivo de cada uma:
//
//  • `temperature: 0` some. O Sonnet 5 rejeita parâmetros de amostragem com
//    400 — não é opcional deixar.
//  • `response_format: json_object` vira instrução de prompt. O contrato do
//    JSON do croqui mora na skill (apps/web/server/assets/skills/croqui-
//    matricula.md, 24 KB), não aqui; escrever um json_schema neste nó
//    duplicaria esse contrato e ele silenciosamente envelheceria quando a skill
//    mudasse. O "Validar JSON" já tira cerca de markdown e fatia por chaves.
//  • `cache_control` na skill. Ela tem ~8k tokens, é idêntica em toda execução
//    e vai inteira em todo pedido — é o mesmo padrão que o nó "Análise
//    Jurídica" do lidimus-Juridico já usa.
//
// max_tokens sobe de 4000 para 16000 porque agora os tokens de thinking contam
// no mesmo teto, e estourar o teto trunca o JSON no meio.
export const jsonBody = `={{ JSON.stringify({
  model: 'claude-sonnet-5',
  max_tokens: 16000,
  thinking: { type: 'adaptive' },
  output_config: { effort: 'high' },
  system: [{ type: 'text', text: ($('Carregar Skill Croqui').first()?.json?.data || ${JSON.stringify(SISTEMA_RESERVA)}), cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: ${JSON.stringify(PEDIDO)} + String($('Recortar Perimetro').first().json.recorte || '') }]
}) }}`

// "Validar JSON": muda só de onde o texto bruto sai. Todo o resto — cerca de
// markdown, fatiamento por chaves, defaults de formato/segmentos — fica igual,
// porque continua sendo a mesma tolerancia a modelo que fala demais.
export const jsValidar = [
  '// Valida e normaliza a resposta do modelo — o desenho em si e feito no app',
  'const resp = $input.first().json;',
  "// Resposta da Anthropic: 'content' e um array de blocos. Com thinking",
  '// adaptativo o primeiro deles e o raciocinio (texto vazio, porque display e',
  "// 'omitted' por padrao), entao os blocos tem de ser escolhidos por tipo:",
  '// content[0].text devolveria vazio.',
  'const blocos = Array.isArray(resp?.content) ? resp.content : [];',
  "const bruto = blocos.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('');",
  "if (!bruto.trim()) throw new Error('Extracao sem resposta do modelo (stop_reason=' + (resp?.stop_reason || '?') + ')');",
  'let texto = String(bruto).trim();',
  "texto = texto.replace(/^```(?:json)?\\s*/i, '').replace(/\\s*```$/, '');",
  'let dados = null;',
  'try { dados = JSON.parse(texto); } catch (e) {',
  "  const ini = texto.indexOf('{');",
  "  const fim = texto.lastIndexOf('}');",
  '  if (ini >= 0 && fim > ini) {',
  '    try { dados = JSON.parse(texto.slice(ini, fim + 1)); } catch (e2) {}',
  '  }',
  '}',
  'if (!dados || typeof dados !== \'object\' || Array.isArray(dados)) {',
  "  throw new Error('Extracao nao retornou JSON valido: ' + texto.slice(0, 200));",
  '}',
  "if (!dados.formato) { dados.formato = 'nao_identificado'; dados.croqui_viavel = false; }",
  'if (!Array.isArray(dados.segmentos)) dados.segmentos = [];',
  'return [{ json: { extracao: dados } }];',
].join('\n')

// "Montar Callback": o painel Admin > Custos passa a receber os nomes de campo
// da Anthropic. Cache entra na conta com o preco que tem de fato — leitura de
// cache custa 0,1x o input e escrita 1,25x, e como a skill inteira vai cacheada
// somar tudo a preco cheio exageraria a linha de custo em quase 10x.
export const trechoTelemetria = [
  '// Uso real do modelo para telemetria de margem (painel Admin > Custos)',
  'const _u = ($(\'Extracao Croqui\').first().json || {}).usage || {};',
  'const _inNovo = Number(_u.input_tokens) || 0;',
  'const _inCacheW = Number(_u.cache_creation_input_tokens) || 0;',
  'const _inCacheR = Number(_u.cache_read_input_tokens) || 0;',
  'const _in = _inNovo + _inCacheW + _inCacheR;',
  'const _out = Number(_u.output_tokens) || 0;',
  '// Precos claude-sonnet-5: US$2/1M input, US$10/1M output; cache a 1,25x na',
  '// escrita e 0,1x na leitura.',
  'const _cost = Number(((_inNovo * 2 + _inCacheW * 2.5 + _inCacheR * 0.2 + _out * 10) / 1e6).toFixed(6));',
  "const usage = { models: [{ workflow: 'lidimus-croqui', model: 'claude-sonnet-5', promptTokens: _in, completionTokens: _out, totalTokens: _in + _out, costUsd: _cost }] };",
].join('\n')
