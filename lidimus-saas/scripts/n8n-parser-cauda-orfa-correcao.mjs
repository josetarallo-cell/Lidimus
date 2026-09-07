// Cauda órfã: o parser passa a reconhecer o cabeçalho que a tarja encobriu.
//
// SOMENTE TRANSFORMAÇÃO — nenhum efeito colateral, nenhuma chamada de rede.
// Separado do n8n-corrigir-parser-cauda-orfa.mjs para que o mesmo texto que vai
// para o ar possa ser medido no corpus de OCR real antes de publicar.
//
// O caso: a tarja diagonal da certidão eletrônica ("PARA SIMPLES CONSULTA")
// passa por cima do texto e o Document AI não lê o que está embaixo. Na
// matrícula 119.908 o cabeçalho "AV. 06 - 119.908 - São" não existe no texto
// extraído — nem no bruto. Sobrou "Paulo, 18 de setembro de 1990." e o corpo
// inteiro da averbação depois dela.
//
// Hoje o parser vê salto de numeração, classifica como página ausente e suprime
// o relatório, mandando o cliente comprar do cartório o mesmo arquivo que já
// está na mão dele. A tarja é padrão do ONR: o caso se repete em certidão
// eletrônica de todo o país.
//
// A cauda é evidência POSITIVA de que a face chegou — é um pedaço da própria
// linha do cabeçalho ausente. Prova mais que a citação, que hoje é o único
// jeito de um número ser rebaixado a `cabecalhos_ilegiveis`: a citação diz que
// o ato existe em algum lugar; a cauda diz que ele está NESTE arquivo.

export function corrigirJsCode(js) {
  function trocar(de, para, rotulo) {
    if (!js.includes(de)) throw new Error('âncora não encontrada em Processar Atos e Coords: ' + rotulo)
    js = js.replace(de, para)
  }

  // ── A. O reconhecedor da cauda ──────────────────────────────────────
  trocar(
    'const lidosNum=new Set(numeros);\n',
    'const lidosNum=new Set(numeros);\n'
    + '// ─── CAUDA ÓRFÃ: a linha do cabeçalho que a tarja cortou pela metade ──\n'
    + '// "Cidade, data." sozinha numa linha é a cauda de um cabeçalho de ato — e\n'
    + '// só dele: matrícula cita "escritura lavrada em São Paulo, 18 de setembro\n'
    + '// de 1990, no 5º Tabelião" o tempo todo, mas nunca com a data terminando a\n'
    + '// linha. A âncora de linha inteira é o que segura isto; medido no corpus,\n'
    + '// sem ela um único documento acende 33 vezes.\n'
    + 'const RE_CAUDA=/^[ \\t]*([^\\n,]{1,40}),[ \\t]*(\\d{1,2})[ \\t]+de[ \\t]+([A-Za-zÀ-ÿ]{3,12})[ \\t]+de[ \\t]+(\\d{1,2}\\.?\\d{3})[ \\t]*\\.?[ \\t]*$/gm;\n'
    + '// O topo de cada ficha repete "Cidade, data" logo abaixo de "LIVRO N° 2 /\n'
    + '// matrícula / ficha" — foi o único falso positivo do corpus (82.662), e só\n'
    + '// a vizinhança o distingue de uma cauda de verdade.\n'
    + 'const RE_BLOCO_FICHA=/LIVRO\\s*N|matr[íi]cula\\s*\\n|\\bficha\\b|CNM:|Oficial:|REGISTRO\\s*\\n?\\s*GERAL/i;\n'
    + 'const RE_CAUDA_RUIDO=/Prenota|Livro|ficha|CERTIFICO|Protocolo|SOLICITADO/i;\n'
    + '// Cópia sem /g: actPattern carrega lastIndex, e testá-lo aqui corromperia\n'
    + '// as varreduras que dependem dele.\n'
    + "const RE_CAB_LINHA=new RegExp(actPattern.source,'i');\n"
    + "const MESES_CAUDA=['janeiro','fevereiro','março','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];\n"
    + "function anoDoTrecho(t){const m=String(t||'').match(/\\b(1[89]\\d{2}|20\\d{2}|[12]\\.\\d{3})\\b/);return m?Number(m[1].replace('.','')):null;}\n"
    + 'const posPorNumero=new Map();\n'
    + 'for(const m of actStartsValidos){\n'
    + '  const num=parseInt(m[2],10);\n'
    + '  if(!posPorNumero.has(num))posPorNumero.set(num,{inicio:m.index,fim:m.index+m[0].length});\n'
    + '}\n'
    + 'function caudasNoVao(ini,fim,anoPiso,anoTeto){\n'
    + '  const achadas=[];\n'
    + '  for(const m of texto.slice(ini,fim).matchAll(RE_CAUDA)){\n'
    + '    const abs=ini+m.index;\n'
    + '    if(RE_CAUDA_RUIDO.test(m[1]))continue;\n'
    + '    if(!MESES_CAUDA.includes(String(m[3]).toLowerCase()))continue;\n'
    + '    if(RE_BLOCO_FICHA.test(texto.slice(Math.max(0,abs-260),abs)))continue;\n'
    + '    // Cauda de um cabeçalho que FOI lido, ou linha colada a um: nos dois\n'
    + '    // casos não falta rótulo nenhum.\n'
    + "    const antes=texto.slice(0,abs).split('\\n').filter(l=>l.trim()).slice(-2);\n"
    + "    const depois=(texto.slice(abs+m[0].length).split('\\n').find(l=>l.trim())||'');\n"
    + '    if(antes.some(l=>RE_CAB_LINHA.test(l))||RE_CAB_LINHA.test(depois))continue;\n'
    + '    const ano=anoDoTrecho(m[0]);\n'
    + '    if(ano===null)continue;\n'
    + '    // Registro feito hoje de escritura antiga é rotina: data fora da janela\n'
    + '    // dos vizinhos não prova ato nenhum, e a direção segura é o silêncio.\n'
    + '    if(anoPiso!==null&&ano<anoPiso)continue;\n'
    + '    if(anoTeto!==null&&ano>anoTeto)continue;\n'
    + '    achadas.push(abs);\n'
    + '  }\n'
    + '  return achadas;\n'
    + '}\n'
    + 'function caudaOrfaExplica(n){\n'
    + '  const chaves=[...posPorNumero.keys()];\n'
    + '  const ant=chaves.filter(x=>x<n).sort((a,b)=>b-a)[0];\n'
    + '  const dep=chaves.filter(x=>x>n).sort((a,b)=>a-b)[0];\n'
    + '  if(ant===undefined||dep===undefined)return false;\n'
    + '  const a=posPorNumero.get(ant),d=posPorNumero.get(dep);\n'
    + '  const ausentes=[];for(let i=ant+1;i<dep;i++)if(!lidosNum.has(i))ausentes.push(i);\n'
    + '  const caudas=caudasNoVao(a.fim,d.inicio,anoDoTrecho(texto.slice(a.fim,a.fim+300)),anoDoTrecho(texto.slice(d.fim,d.fim+300)));\n'
    + '  // Contagem casada: uma cauda justifica UM ato, não seis. Sem isto, uma\n'
    + '  // linha solta explicaria um bloco inteiro de páginas que nunca chegaram —\n'
    + '  // que é exatamente o caso da matrícula 54.204.\n'
    + '  return caudas.length>0&&caudas.length===ausentes.length;\n'
    + '}\n',
    'reconhecedor da cauda órfã',
  )

  // ── B. A cauda entra como disjunção, nunca substituindo a conjunção ──
  // `podeSerLeitura` continua governando tudo: com página faltando no rodapé ou
  // continuação pendente, nenhuma cauda rebaixa coisa alguma. Foi por tentar
  // SUBSTITUIR um conjunto que a tentativa anterior ("corrente de fichas
  // fechada") reprovou na 54.204.
  trocar(
    '  if(podeSerLeitura&&cercado&&citadosNum.has(n))cabecalhos_ilegiveis.push(n);\n  else atos_faltantes.push(n);',
    '  const porCauda=podeSerLeitura&&cercado&&!citadosNum.has(n)&&caudaOrfaExplica(n);\n'
    + '  if(podeSerLeitura&&cercado&&(citadosNum.has(n)||porCauda)){\n'
    + '    cabecalhos_ilegiveis.push(n);\n'
    + '    if(porCauda)explicadosPorCauda.push(n);\n'
    + '  }\n'
    + '  else atos_faltantes.push(n);',
    'disjunção no rebaixamento',
  )

  trocar(
    'const cabecalhos_ilegiveis=[],atos_faltantes=[];',
    'const cabecalhos_ilegiveis=[],atos_faltantes=[],explicadosPorCauda=[];',
    'lista dos explicados pela cauda',
  )

  // ── C. A ação corretiva certa ───────────────────────────────────────
  // "Reprocessar o arquivo" é o conselho certo para rótulo corrompido, e o
  // errado para este caso: reprocessar o mesmo PDF no mesmo OCR encontra a mesma
  // tarja e produz o mesmo resultado. O que resolve é a conferência humana da
  // leitura, onde o cabeçalho pode ser digitado.
  trocar(
    "const avisos_leitura=cabecalhos_ilegiveis.length\n  ? ['Cabeçalho ilegível para o ato '+cabecalhos_ilegiveis.join(', ')+'. O texto está no arquivo e foi entregue à análise, mas não foi possível delimitar o bloco desse ato — o conteúdo pode aparecer somado ao ato anterior. Ação corretiva: reprocessar o arquivo, não pedir certidão ao cartório.']\n  : [];",
    'const avisos_leitura=[];\n'
    + 'const soRotuloPerdido=cabecalhos_ilegiveis.filter(n=>!explicadosPorCauda.includes(n));\n'
    + 'if(soRotuloPerdido.length){\n'
    + "  avisos_leitura.push('Cabeçalho ilegível para o ato '+soRotuloPerdido.join(', ')+'. O texto está no arquivo e foi entregue à análise, mas não foi possível delimitar o bloco desse ato — o conteúdo pode aparecer somado ao ato anterior. Ação corretiva: reprocessar o arquivo, não pedir certidão ao cartório.');\n"
    + '}\n'
    + 'if(explicadosPorCauda.length){\n'
    + "  avisos_leitura.push('A tarja da certidão eletrônica encobriu o cabeçalho do ato '+explicadosPorCauda.join(', ')+'. O restante da linha e o corpo do ato estão no arquivo, o que confirma que a página foi recebida — o que não foi lido é o rótulo. Ação corretiva: reenviar o documento e completar o cabeçalho na conferência da leitura. Reprocessar sem corrigir encontra a mesma tarja e produz o mesmo resultado, e o cartório entregaria este mesmo arquivo.');\n"
    + '}',
    'aviso próprio da cauda órfã',
  )

  return js
}
