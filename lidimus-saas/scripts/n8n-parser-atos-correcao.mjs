// Correção do nó "Processar Atos e Coords" do lidimus-Juridico (04/09/2026).
//
// SOMENTE TRANSFORMAÇÃO — nenhum efeito colateral, nenhuma chamada de rede.
// Separado do n8n-corrigir-parser-atos.mjs para que o mesmo texto que vai para
// o ar possa ser exercitado contra o corpus de OCR real antes de publicar.
//
// O defeito: a matrícula 119.908 (15º RI de São Paulo) saiu do sandbox com UM
// ato lido de dez, e o laudo declarou "faltam os atos 1, 2, 3" — num documento
// completo, mandando o cliente comprar uma certidão de inteiro teor que traria
// exatamente o mesmo arquivo.

export function corrigirJsCode(js) {
  function trocar(de, para, rotulo) {
    if (!js.includes(de)) throw new Error('âncora não encontrada em Processar Atos e Coords: ' + rotulo)
    js = js.replace(de, para)
  }

  // ── A. Truncamento da PRÓPRIA matrícula não é referência a outra ────
  trocar(
    '  const alvo=soDigitos(m[3]);\n  if(!alvo)return false;\n',
    '  const alvo=soDigitos(m[3]);\n  if(!alvo)return false;\n'
    + '  // O quantificador de [\\d.] no actPattern recua até achar a pontuação que\n'
    + '  // o terminador exige: "Av.7 - 119.908\\n(José" sai com m[3]="119" e o ponto\n'
    + '  // de "119.908" servindo de terminador. Como 119 != 119908, o ato virava\n'
    + '  // referência a outra ficha e sumia — e ainda semeava\n'
    + '  // origem.matricula_anterior com uma "matrícula 119" que não existe,\n'
    + '  // fazendo o laudo recomendar certidão de uma matrícula inexistente.\n'
    + '  //\n'
    + '  // O discriminador NÃO pode ser o tamanho do número: "R.18/126." é o mesmo\n'
    + '  // recuo acontecendo sobre uma referência LEGÍTIMA a outra matrícula (a\n'
    + '  // 126.092, na 229.216), e descartá-la é justamente o que impede a 229.216\n'
    + '  // de declarar dezoito atos. O que separa os dois casos é de quem o número\n'
    + '  // é prefixo: 119 começa 119908; 126 não começa 229216.\n'
    + '  if(alvo.length<matriculaAtual.length&&matriculaAtual.startsWith(alvo))return false;\n',
    'ehReferenciaExterna: prefixo da própria matrícula',
  )

  // ── B. Cabeçalho cujo SEPARADOR o OCR comeu ────────────────────────
  trocar(
    '  const jaCoberto=new Set([...texto.matchAll(actPattern)].map(m=>m.index+m[0].length));\n',
    '  const jaCoberto=new Set([...texto.matchAll(actPattern)].map(m=>m.index+m[0].length));\n'
    + '  // ─── RESGATE: cabeçalho cujo SEPARADOR o OCR comeu ──────────────────\n'
    + '  // O 15º RI de São Paulo escreve "Av.01 - 119.908 - São Paulo, 27 de abril\n'
    + '  // de 1.990." Quando o OCR perde o hífen — e na 119.908 perdeu em sete dos\n'
    + '  // dez atos — sobra "Av.01 119.908", que o actPattern não reconhece: ele\n'
    + '  // exige pontuação ou " em <data>" logo depois do número, e ali vem espaço.\n'
    + '  // Resultado: UM ato lido (o Av.04, o único cujo hífen sobreviveu) e\n'
    + '  // "faltam os atos 1, 2, 3" num documento inteiro.\n'
    + '  // A âncora é o par letra+número seguido da PRÓPRIA matrícula, e é por ser\n'
    + '  // forte que dispensa o terminador: "Av.01 119.908" numa certidão da\n'
    + '  // 119.908 é cabeçalho de ato, não coincidência.\n'
    + '  //\n'
    + '  // O separador é OBRIGATÓRIO — ou pontuação, ou espaço. Deixá-lo opcional\n'
    + '  // parece inofensivo e não é: em "Av. 417529" (a barra de "4/7529" lida\n'
    + '  // como 1, na 7.529) os dígitos correm juntos, e sem exigir separador o\n'
    + '  // número do ato sai como 41. Isso estoura o teto de numeração crescente e\n'
    + '  // derruba TODOS os atos seguintes — 13 atos viram 6.\n'
    + "  const RE_CABECALHO=new RegExp('\\\\b(R|AV|Av|r|av)\\\\s*[-.]?\\\\s*(\\\\d{1,3})(?:\\\\s*[-–—/1|]\\\\s*|\\\\s+)'+padraoMat+'\\\\b','g');\n"
    + '  const inicioGenerico=new Set([...texto.matchAll(actPattern)].map(m=>m.index));\n'
    + '  for(const a of texto.matchAll(RE_CABECALHO)){\n'
    + '    if(a.index>=fimAtos)continue;\n'
    + '    // Onde o padrão genérico já achou, ele manda: o m[0] dele delimita o\n'
    + '    // bloco do ato, e trocar o recorte moveria as fronteiras.\n'
    + '    if(inicioGenerico.has(a.index))continue;\n'
    + '    const falso=[a[0],a[1],a[2],undefined];\n'
    + "    falso.index=a.index;falso.origem_cabecalho='separador_perdido';\n"
    + '    ancoraExtra.push(falso);\n'
    + '  }\n',
    'âncora de separador perdido',
  )

  // ── C. Um resgate por ato ──────────────────────────────────────────
  trocar(
    'const todosActStarts=[...texto.matchAll(actPattern),...ancoraExtra]\n',
    '// As duas âncoras (letra ilegível e separador perdido) enxergam o mesmo\n'
    + '// cabeçalho em "Av. 417529": uma casa a partir do espaço antes do número, a\n'
    + '// outra a partir do "Av". Sem dedupe o mesmo ato entra duas vezes, em\n'
    + '// índices diferentes, e o segundo só é descartado adiante pelo teto de\n'
    + '// numeração — depois de já ter servido de fronteira do bloco anterior.\n'
    + 'const ancoraPorRotulo=new Map();\n'
    + 'for(const a of ancoraExtra.sort((x,y)=>x.index-y.index)){\n'
    + "  const r=(a[1].toUpperCase().startsWith('AV')?'AV':'R')+'-'+a[2];\n"
    + '  if(!ancoraPorRotulo.has(r))ancoraPorRotulo.set(r,a);\n'
    + '}\n'
    + 'const todosActStarts=[...texto.matchAll(actPattern),...ancoraPorRotulo.values()]\n',
    'dedupe das âncoras por rótulo',
  )

  return js
}
