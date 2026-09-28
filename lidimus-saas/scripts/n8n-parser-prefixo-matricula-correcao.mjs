// Prefixo "M." no cabeçalho: o parser passa a ler "R.01 M.15.847" e "R.05 1.15.847".
//
// SOMENTE TRANSFORMAÇÃO — nenhum efeito colateral, nenhuma chamada de rede.
// Separado do n8n-corrigir-parser-prefixo-matricula.mjs para que o mesmo texto
// que vai para o ar possa ser medido no corpus de OCR real antes de publicar.
//
// O caso (26/09/2026, execuções 1072/1073): a matrícula 15.847 do 7º RI de São
// Paulo, uma certidão inteira de 4 páginas, saiu "incompleta" com "falta o ato
// 1" e "cabeçalho ilegível para o ato 5". Os dois atos estavam no texto do OCR.
// O cartório escreve o cabeçalho "R.02 - M.15.847 , em 8 de Janeiro de 1.979",
// com a matrícula PRECEDIDA de "M.", e o OCR estragou dois deles:
//
//   R.01 M.15.847 , em 8 de Janeiro de 1.979.     ← comeu o hífen
//   R.05 1.15.847, em 13 de SETEMBRO de 1.984.     ← comeu o hífen e leu "M." como "1."
//
// O actPattern exige pontuação logo depois do número do ato, e o resgate do
// separador perdido (RE_CABECALHO) só aceitava a matrícula COLADA ao número
// ("Av.01 119.908"). Com o "M." no meio, nenhum dos dois casava. Sem o R.01, a
// 15.847 perdeu a venda para a FOPASA; sem o R.05, perdeu a venda para VICENTE
// BENEDICTO VISCOME, que é o título dos alienantes do R.08.

export function corrigirJsCode(js) {
  function trocar(de, para, rotulo) {
    if (!js.includes(de)) throw new Error('âncora não encontrada em Processar Atos e Coords: ' + rotulo)
    js = js.replace(de, para)
  }

  trocar(
    String.raw`  const RE_CABECALHO=new RegExp('\\b(R|AV|Av|r|av)\\s*[-.]?\\s*(\\d{1,3})(?:\\s*[-–—/1|]\\s*|\\s+)'+padraoMat+'\\b','g');` + '\n',
    String.raw`  //
  // O 7º RI de São Paulo põe "M." antes da matrícula: "R.02 - M.15.847 , em".
  // Na 15.847 o OCR comeu o hífen de dois cabeçalhos ("R.01 M.15.847 , em") e,
  // num deles, ainda leu o "M." como "1." ("R.05 1.15.847, em"). Sem aceitar o
  // prefixo, os dois atos sumiram e a certidão inteira saiu incompleta. O
  // prefixo é opcional e vem ANTES da matrícula, então a âncora continua sendo
  // a própria matrícula. "M" aceita o ponto perdido ("M 15.847"); as leituras
  // erradas do M ("1", "I", "l", "|") exigem o ponto, que é o que as distingue
  // de um dígito solto.
  const PREFIXO_MAT='(?:(?:M(?:at(?:r[íi]cula)?)?\\s*[.:º°]?|[1Il|]\\s*\\.)\\s*)?';
  const RE_CABECALHO=new RegExp('\\b(R|AV|Av|r|av)\\s*[-.]?\\s*(\\d{1,3})(?:\\s*[-–—/1|]\\s*|\\s+)'+PREFIXO_MAT+padraoMat+'\\b','g');` + '\n',
    'RE_CABECALHO do separador perdido',
  )

  return js
}
