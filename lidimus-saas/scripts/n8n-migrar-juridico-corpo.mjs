// Corpo da requisição à Anthropic e código do nó "Parsear Campos" do
// lidimus-Juridico — a migração da `Extração de Campos` de Mistral para
// Anthropic, feita em 04/09/2026 depois que a conta Mistral caiu para o tier
// gratuito e o `mistral-medium` passou a responder 429 (execução 879).
//
// SOMENTE DADOS — nenhum efeito colateral, nenhuma chamada de rede. Está
// separado do n8n-migrar-juridico.mjs de propósito: assim dá para exercitar
// este corpo contra a API real sem que o arquivo executado contenha um PUT em
// produção, e o que se testa e o que vai para o ar são o mesmo texto.

// As descrições vêm literalmente dos `attributes` do nó antigo: são elas que
// ensinaram o modelo a achar cada campo, e trocar o provedor não é motivo para
// reescrevê-las. Viram `description` de cada propriedade do JSON Schema.
export const CAMPOS = [
  ['numero_matricula', "Número da matrícula imobiliária. Ex: 15.727 ou 123456. Geralmente aparece após a palavra 'matrícula' ou 'MATRICULA'."],
  ['cartorio', 'Nome completo do Cartório de Registro de Imóveis onde a matrícula está registrada.'],
  ['data_abertura', 'Data de abertura ou instituição da matrícula no formato DD/MM/AAAA.'],
  ['livro_folha', "Referência do livro e folha da matrícula. Ex: 'Livro 2, Folha 157'."],
  ['matricula_anterior', 'Número da matrícula ou transcrição anterior de onde este imóvel se originou.'],
  ['endereco', 'Endereço completo do imóvel conforme descrito na matrícula, incluindo logradouro, número, bairro, cidade e CEP se disponíveis.'],
  ['sql_iptu', 'Número SQL ou código IPTU do imóvel. Formato típico: xxx.xxx.xxxx.x (10 dígitos separados por pontos).'],
  ['area_total_m2', 'Área total do terreno ou imóvel em metros quadrados, exatamente como consta no documento.'],
  ['area_construida_m2', 'Área construída, edificada ou de construção em metros quadrados.'],
  ['testada', 'Medida da testada ou frente do lote em metros lineares.'],
  ['confrontante_norte', 'Descrição do confrontante ao Norte do imóvel (quem faz divisa ao norte).'],
  ['confrontante_sul', 'Descrição do confrontante ao Sul do imóvel (quem faz divisa ao sul).'],
  ['confrontante_leste', 'Descrição do confrontante ao Leste do imóvel (quem faz divisa ao leste).'],
  ['confrontante_oeste', 'Descrição do confrontante ao Oeste do imóvel (quem faz divisa ao oeste).'],
  ['endereco_curto', 'Endereço RESUMIDO do imóvel para exibição e geocodificação: logradouro ou rodovia (com número ou km), bairro, cidade e UF. Ex: "Rodovia Raposo Tavares, Km 64,5, Bairro Marmeleiro, Mairinque - SP". NÃO incluir descrição de divisas, rumos, medidas ou confrontações.'],
]

// O prompt de sistema é o mesmo do nó antigo MENOS o bloco "FORMATO DA
// RESPOSTA" e o {format_instructions}: pedir JSON puro por texto era necessário
// com o Information Extractor; aqui quem garante a forma é output_config.format,
// e instrução redundante só compete com o schema.
export const SISTEMA = [
  'Você é um especialista em matrículas imobiliárias brasileiras. Extraia com precisão os campos solicitados do texto de matrícula fornecido. Se um campo não estiver presente no documento, retorne null. Mantenha os valores exatamente como aparecem no documento, preservando formatação original, pontuação e acentos.',
  '',
  'REGRA DAS CONFRONTAÇÕES: preencha confrontante_norte, confrontante_sul, confrontante_leste e confrontante_oeste SOMENTE quando a matrícula escrever o rumo cardeal (norte/sul/leste/oeste, ou N/S/E/O, Nascente/Poente). Quando o documento disser apenas "de um lado", "de outro lado", "nos fundos" ou "à frente", retorne null nos quatro: traduzir lado para ponto cardeal inventa informação que não está no documento e produz georreferenciamento errado.',
].join('\n')

const propriedades = CAMPOS.map(
  ([nome, desc]) => `          ${nome}: { anyOf: [{ type: 'string' }, { type: 'null' }], description: ${JSON.stringify(desc)} }`,
).join(',\n')

const obrigatorios = CAMPOS.map(([n]) => `'${n}'`).join(', ')

// Um único JSON.stringify no corpo, como já é o padrão do nó "Análise
// Jurídica". Todos os 15 campos são `required` e aceitam null: assim a resposta
// tem sempre as 15 chaves, exatamente como o Information Extractor entregava.
export const jsonBody = `={{ JSON.stringify({
  model: 'claude-sonnet-5',
  max_tokens: 16000,
  thinking: { type: 'adaptive' },
  output_config: {
    effort: 'high',
    format: {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: {
${propriedades}
        },
        required: [${obrigatorios}],
        additionalProperties: false
      }
    }
  },
  system: ${JSON.stringify(SISTEMA)},
  messages: [{ role: 'user', content: 'Texto da Matrícula:\\n\\n' + $('Preparar Input').first().json.texto_ocr }]
}) }}`

export const jsParsear = [
  '// ─── PARSEAR CAMPOS ──────────────────────────────────────────────────',
  '// A extração é feita pela Anthropic num nó HTTP; antes era o Information',
  '// Extractor do langchain, que já devolvia o objeto pronto. O contrato com o',
  '// resto do workflow não mudou — "Processar Atos e Coords" lê',
  '// $input.first().json.output — então é aqui que a resposta da API vira',
  '// { output: {…15 campos} }.',
  'const resp = $input.first().json || {};',
  '',
  '// Com thinking adaptativo o primeiro bloco do content é o raciocínio (texto',
  "// vazio, porque display é 'omitted' por padrão). O JSON está nos blocos de",
  "// tipo 'text', e é por tipo que eles têm de ser escolhidos: content[0]",
  '// devolveria o bloco de thinking.',
  'const blocos = Array.isArray(resp.content) ? resp.content : [];',
  "const texto = blocos.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('').trim();",
  '',
  'if (!texto) {',
  "  throw new Error('Resposta da Anthropic sem bloco de texto (stop_reason=' + (resp.stop_reason || '?') + ')');",
  '}',
  '',
  '// output_config.format garante JSON válido no caminho feliz. A cerca de',
  '// markdown só apareceria numa recusa, em que o schema não vale — e aí é',
  '// melhor estourar no JSON.parse, com a mensagem à vista, do que seguir com',
  '// 15 campos nulos como se a matrícula não tivesse nada.',
  'function limpar(t) {',
  '  const m = String(t).match(/```(?:json)?\\s*([\\s\\S]*?)```/);',
  '  return (m ? m[1] : t).trim();',
  '}',
  '',
  'let campos;',
  'try {',
  '  campos = JSON.parse(limpar(texto));',
  '} catch (e) {',
  "  throw new Error('JSON inválido na extração de campos: ' + e.message);",
  '}',
  '',
  '// usage segue adiante para o "Montar Callback" contabilizar a margem com o',
  '// consumo real, no lugar da estimativa que existia enquanto o nó era langchain.',
  'return [{ json: { output: campos, usage: resp.usage || {} } }];',
].join('\n')
