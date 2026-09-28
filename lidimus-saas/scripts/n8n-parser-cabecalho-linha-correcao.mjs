// Cabeçalho de linha: o parser passa a ler "R.1 USUCAPIÃO" e "R.e⏎VENDA E COMPRA".
//
// SOMENTE TRANSFORMAÇÃO — nenhum efeito colateral, nenhuma chamada de rede.
// Separado do n8n-corrigir-parser-cabecalho-linha.mjs para que o mesmo texto que
// vai para o ar possa ser medido no corpus de OCR real antes de publicar.
//
// O caso (15/09/2026, execuções 982/983): a matrícula 33.032 do 1º RI de Mogi
// das Cruzes, uma certidão inteira de 12 páginas, saiu recusada com "12 de 130
// páginas" e "faltam os atos 1, 2, 3, 4, 5, 6, 7, 8, 15, 17, 18". Os 22 atos
// estavam no texto do OCR. Três defeitos independentes, e o primeiro desligava a
// rede de segurança que poderia ter salvado os outros dois:
//
//   A. "Lº 275, página 127/130" — folhas 127 a 130 do livro do tabelião, citadas
//      em cinco atos — lido como rodapé "página 127 de 130". A guarda de contexto
//      conhecia "livro" por extenso, não a abreviação.
//   B. O cartório datilografa o cabeçalho sem pontuação depois do número: "R.1
//      USUCAPIÃO", "Av.15 NIRF", ou o assunto na linha de baixo ("Av.2⏎OBITO").
//      O actPattern exige pontuação e não viu dez atos.
//   C. No pé da ficha 02 o OCR leu "R.8" como "R.e". Nenhum padrão alcança um
//      número que não está lá.

export function corrigirJsCode(js) {
  function trocar(de, para, rotulo) {
    if (!js.includes(de)) throw new Error('âncora não encontrada em Processar Atos e Coords: ' + rotulo)
    js = js.replace(de, para)
  }

  // ── A. Livro abreviado não é rodapé ─────────────────────────────────
  trocar(
    String.raw`  if(/livro|fls?\.|tabeli[ãa]o|escritura/i.test(texto.slice(Math.max(0,m.index-40),m.index)))continue;` + '\n',
    String.raw`  // "Lº 275, página 127/130" é a mesma referência a livro de tabelião, com o
  // livro abreviado: na 33.032 ela se repete em cinco atos e fez uma certidão
  // de 12 páginas se declarar com 130. A abreviação só conta colada a um número
  // ("Lº 275"), para não casar a letra L de outra palavra.
  if(/livro|fls?\.|tabeli[ãa]o|escritura|\bL\s*[º°ª]\s*\.?\s*\d/i.test(texto.slice(Math.max(0,m.index-40),m.index)))continue;` + '\n',
    'guarda de contexto do rodapé',
  )

  // ── B e C. Os dois resgates novos, antes do dedupe das âncoras ──────
  // Ficam FORA do `if(matriculaAtual)`: nenhum dos dois depende de saber o
  // número da matrícula, e a 33.032 não cola a matrícula no cabeçalho.
  trocar(
    '}\n// As duas âncoras (letra ilegível e separador perdido) enxergam o mesmo\n',
    '}\n'
    + String.raw`// ─── RESGATE: cabeçalho de linha sem pontuação depois do número ───────
// O 1º RI de Mogi das Cruzes datilografa "R.1 USUCAPIÃO", "Av.15 NIRF" ou o
// assunto na linha de baixo ("Av.2⏎OBITO"). O actPattern exige pontuação
// depois do número e não viu dez dos 22 atos da 33.032, que saiu com "faltam
// os atos 1 a 8, 15, 17, 18" num documento inteiro.
// No lugar da pontuação, o sinal é POSIÇÃO e FORMA: começo de linha e assunto
// em CAIXA ALTA logo depois. Citação no corpo ("objeto da Av.4 retro") não abre
// linha nem vem em caixa alta. Mês por extenso fica de fora porque "AV. 9
// JULHO" abrindo linha é endereço, não ato. O ponto entre letra e número é
// obrigatório: sem ele, o "R5" solto que o carimbo da ONR deixa antes de
// "SOLICITADO POR" virou um R-5 fantasma na 229.216.
{
  const inicioGenerico=new Set([...texto.matchAll(actPattern)].map(m=>m.index));
  const RE_CAB_TITULO=/(?<=^[ \t"']*)\b(R|AV|Av)[ \t]*\.[ \t]*(\d{1,3})(?!\d)(?=[ \t]*\n?[ \t]*(?!(?:JANEIRO|FEVEREIRO|MAR[ÇC]O|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\b)[A-ZÀ-Ü]{4,})/gm;
  for(const a of texto.matchAll(RE_CAB_TITULO)){
    if(a.index>=fimAtos||inicioGenerico.has(a.index))continue;
    const falso=[a[0],a[1],a[2],undefined];
    falso.index=a.index;falso.origem_cabecalho='titulo_sem_pontuacao';
    ancoraExtra.push(falso);
  }
  // ─── RESGATE: cabeçalho cujo NÚMERO o OCR trocou por letra ──────────
  // No pé da ficha 02 da 33.032 o "R.8" saiu "R.e", com VENDA E COMPRA na
  // linha de baixo: a letra e a forma do cabeçalho sobreviveram, o número não.
  // Ele é DEDUZIDO, não adivinhado, e só quando a posição não deixa
  // alternativa: o cabeçalho mutilado está entre dois atos lidos cuja numeração
  // salta exatamente um número, esse número não aparece lido em lugar nenhum e
  // não há outro cabeçalho mutilado no mesmo vão. O ato sai com aviso de
  // conferência, porque a letra decide a natureza dele: R transmite domínio,
  // AV não. Uma letra só depois do ponto: "R. DE MORAES" é rua.
  const RE_CAB_MUTILADO=/(?<=^[ \t"']*)\b(R|AV|Av)[ \t]*\.[ \t]*([A-Za-z])(?![A-Za-zÀ-ÿ\d])(?=[ \t]*\n?[ \t]*[A-ZÀ-Ü]{4,})/gm;
  const lidos=[...texto.matchAll(actPattern),...ancoraExtra]
    .filter(m=>m.index<fimAtos&&!ehReferenciaExterna(m)&&!ehCitacao(m))
    .map(m=>({index:m.index,num:parseInt(m[2],10)}))
    .sort((x,y)=>x.index-y.index);
  const numerosLidos=new Set(lidos.map(l=>l.num));
  const mutilados=[...texto.matchAll(RE_CAB_MUTILADO)].filter(a=>a.index<fimAtos);
  for(const a of mutilados){
    const ant=lidos.filter(l=>l.index<a.index).pop();
    const dep=lidos.find(l=>l.index>a.index);
    if(!ant||!dep||dep.num-ant.num!==2||numerosLidos.has(ant.num+1))continue;
    if(mutilados.filter(b=>b.index>ant.index&&b.index<dep.index).length!==1)continue;
    const falso=[a[0],a[1],String(ant.num+1),undefined];
    falso.index=a.index;falso.origem_cabecalho='numero_deduzido';falso.lido_como=a[0].trim();
    ancoraExtra.push(falso);
  }
}
` + '// As duas âncoras (letra ilegível e separador perdido) enxergam o mesmo\n',
    'resgates de cabeçalho de linha e de número mutilado',
  )

  // ── D. O relatório diz que o número foi deduzido ────────────────────
  trocar(
    '// Causa provável da lacuna, para o relatório não trocar uma pela outra.\n',
    String.raw`// Número deduzido pela posição: o ato está no documento e foi delimitado, mas
// o número dele foi inferido, não lido. O relatório não esconde isso.
for(const m of todosActStarts){
  if(m.origem_cabecalho!=='numero_deduzido')continue;
  const seq=rotuloAto(m);
  if(!atosUnicos.some(a=>a.sequencia===seq))continue;
  avisos_leitura.push('O cabeçalho do ato '+seq+' foi lido como "'+m.lido_como+'". O número foi deduzido pela posição, por ser o único que falta entre o ato anterior e o seguinte, e o ato foi analisado com ele. Confira na imagem, em especial a letra: AV é averbação, R é registro.');
}
` + '// Causa provável da lacuna, para o relatório não trocar uma pela outra.\n',
    'aviso do número deduzido',
  )

  return js
}
