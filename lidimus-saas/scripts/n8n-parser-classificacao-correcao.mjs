// Classificação de atos: o que o ato É, não o que o corpo dele cita.
//
// SOMENTE TRANSFORMAÇÃO — nenhum efeito colateral, nenhuma chamada de rede.
// Separado do n8n-corrigir-parser-classificacao.mjs para que o mesmo texto que
// vai para o ar possa ser medido no corpus de OCR real antes de publicar.
//
// Auditoria de 15/09/2026 sobre as 74 matrículas dos dois bancos, comparando o
// assunto escrito no cabeçalho com o `tipo_ato` que o parser atribuiu. O padrão
// dos erros é um só: a palavra-chave do TÍTULO citado decidia a classe do ATO.
//
//   A. Averbação saindo com classe dominial. "Av.4 - ÓBITO: À vista do formal de
//      partilha, averba-se o falecimento" virava partilha; "Av.04 … À vista da
//      Carta de Adjudicação … Ata da Assembleia" virava adjudicação. Averbação
//      não transmite domínio (Lei 6.015/73, art. 167, I × II).
//   B. Cancelamento escrito no corpo. "Fica cancelada a hipoteca registrada sob
//      o nº 03" virava hipoteca — um ônus ATIVO, o contrário do que o ato diz; o
//      "CANCELAMENTO DE REGISTRO … Fica cancelado o R.14" da 33.032 virava
//      herança porque o R.14 era um arrolamento. E o alvo do cancelamento era
//      procurado numa janela que alcançava o motivo ("em virtude do imóvel ter
//      sido adjudicado, conforme R. 06"), dando por cancelada a adjudicação.
//   C. Classes que não existiam: usucapião (o "R.1 USUCAPIÃO" saía "registro"),
//      arrolamento fiscal da Receita (saía herança) e existência de ação (saía
//      alteração de denominação).
//   D. "PEDIDO DE CANCELAMENTO INCRA" é cancelamento cadastral: não baixa ato.
//   E. Registro escrito pelo verbo — "TRANSMITIRAM por venda", "DOARAM",
//      "hipotecou" — caía em "registro" genérico, porque as classes só
//      conheciam o substantivo.

export function corrigirJsCode(js) {
  function trocar(de, para, rotulo) {
    if (!js.includes(de)) throw new Error('âncora não encontrada em Processar Atos e Coords: ' + rotulo)
    js = js.replace(de, para)
  }

  // ── E. Verbos nas classes existentes ────────────────────────────────
  trocar(
    String.raw`  [/compra\s+e\s+venda|venda\s+e\s+compra/i,'compra_e_venda'],`,
    String.raw`  // O verbo conta como o substantivo: "TRANSMITIRAM por venda feita a",
  // "VENDEU a". Sem ele, registro de venda escrito assim saía "registro".
  [/compra\s+e\s+venda|venda\s+e\s+compra|transmiti\w*\s+por\s+venda|\bvend(?:eu|eram)\b/i,'compra_e_venda'],`,
    'verbo de venda',
  )
  trocar(
    String.raw`  [/hipoteca/i,'hipoteca'],`,
    String.raw`  [/hipoteca|hipotec(?:ou|aram)\b/i,'hipoteca'],`,
    'verbo de hipoteca',
  )
  trocar(
    String.raw`  [/doa[cç][aã]o/i,'doacao'],`,
    String.raw`  [/doa[cç][aã]o|\bdoar(?:am)?\b|\bdoou\b/i,'doacao'],`,
    'verbo de doação',
  )

  // ── C. Usucapião por último: é o assunto do cabeçalho que a identifica ─
  // Palavra do corpo de outro registro ("imóvel havido por usucapião") não pode
  // passar na frente de venda ou doação — por isso a classe entra no fim.
  trocar(
    String.raw`  [/heran[cç]a|invent[áa]rio|arrolamento/i,'heranca'],`,
    String.raw`  [/heran[cç]a|invent[áa]rio|arrolamento/i,'heranca'],
  // Aquisição originária: título de domínio sem transmitente.
  [/usucapi[ãa]o|usucapid[oa]/i,'usucapiao'],`,
    'classe usucapião',
  )

  // ── B, C e D. Regras que valem antes das palavras-chave ─────────────
  trocar(
    "    if(isCancelOnus)return'cancelamento_onus';\n",
    "    if(isCancelOnus)return'cancelamento_onus';\n"
    + String.raw`    // Cancelamento cadastral no INCRA não baixa ato nenhum da matrícula.
    if(/cancelamento[^.\n]{0,40}(?:INCRA|cadastral)|INCRA[^.\n]{0,40}cancelamento/i.test(header))return'averbacao';
    // Cancelamento escrito por extenso ("Fica cancelada a hipoteca registrada
    // sob o nº 03", "fica o mesmo cancelado", "CANCELAMENTO DE REGISTRO"): o
    // ato é a baixa, não o que é baixado. Sem esta regra as palavras do ato
    // cancelado decidiam a classe — a Av.07 da 38.253 saía como a hipoteca que
    // cancelava, e a Av.22 da 33.032 como herança, por citar o arrolamento.
    // Só em averbação: cancelamento é averbação (Lei 6.015/73, art. 167, II, 2).
    if(tipoNorm==='AV'){
      const ini=fullBlock.slice(0,320);
      if(/\bfica(?:m)?\s+(?:[A-Za-zÀ-ÿ.]+\s+){0,3}cancelad[ao]s?\b|\bCANCELAMENTO\s+D[EOA]S?\s+(?:REGISTRO|AVERBA[ÇC][ÃA]O)/i.test(ini)){
        if(/indisponibilidade/i.test(ini))return'cancelamento_indisponibilidade';
        if(/hipoteca|\bpenhora|arresto|compromisso|cess[ãa]o|usufruto|servid[ãa]o|cl[áa]usula|aliena[çc][ãa]o\s+fiduci|[ôo]nus/i.test(ini))return'cancelamento_onus';
        return'cancelamento';
      }
    }
    // Existência de ação (Lei 13.097/2015, art. 54): publicidade de litígio
    // sobre o imóvel. Sem classe, palavras do corpo decidiam — a Av.15 do job
    // 78646f6d saía como alteração de denominação.
    if(/exist[êe]ncia\s+d[ae]\s+a[çc][ãa]o|averba[çc][ãa]o\s+premonit[óo]ria/i.test(fullBlock.slice(0,300)))return'existencia_acao';
    // Arrolamento de bens pela Receita Federal (Lei 9.532/97, art. 64) não é
    // inventário: é restrição administrativa que obriga a comunicar a
    // alienação. A classe 'heranca' casa "arrolamento" sozinha e pegava o R.14
    // da 33.032. O que distingue é a base legal fiscal citada e a ausência da
    // linguagem de sucessão — formal de partilha extraído de "autos de
    // arrolamento" também cita a Receita, pela certidão negativa.
    {
      const corpo=fullBlock.slice(0,1500);
      if(/arrol/i.test(corpo)&&/IN\s*\/\s*SRF|Instru[çc][ãa]o\s+Normativa|9\.532|art(?:igo|\.)\s*64\b/i.test(corpo)&&!/formal\s+de\s+partilha|invent[áa]rio|esp[óo]lio|falecimento/i.test(corpo))return'arrolamento_fiscal';
    }
`,
    'regras antes das palavras-chave',
  )

  // ── A. Averbação não transmite domínio ──────────────────────────────
  trocar(
    "  const tipoAto=(()=>{\n    if(isTransporte)",
    "  const tipoAtoBruto=(()=>{\n    if(isTransporte)",
    'nome do classificador bruto',
  )
  trocar(
    "    return tipoNorm==='AV'?'averbacao':'registro';\n  })();\n",
    "    return tipoNorm==='AV'?'averbacao':'registro';\n  })();\n"
    + String.raw`  // Averbação não transmite domínio (Lei 6.015/73, art. 167, I × II). Quando a
  // classe de uma AV sai dominial, a palavra veio do TÍTULO citado no corpo —
  // "À vista do formal de partilha, averba-se o falecimento", "Pela Carta de
  // Adjudicação, faço constar a incorporação" — e não do ato. No corpus eram
  // óbito, casamento, numeração e cadastro saindo como partilha e adjudicação,
  // e uma delas chegava a ser o "último ato dominial" do parecer.
  const DOMINIO_SO_EM_REGISTRO=new Set(['compra_e_venda','permuta','adjudicacao','arrematacao','partilha','doacao','heranca','dacao_pagamento','integralizacao','usucapiao']);
  const tipoAto=tipoNorm==='AV'&&DOMINIO_SO_EM_REGISTRO.has(tipoAtoBruto)?'averbacao':tipoAtoBruto;
`,
    'averbação não é dominial',
  )

  // ── B. O alvo do cancelamento está antes do motivo ──────────────────
  trocar(
    "    const janelas=[...fullBlock.matchAll(/CANCELAD[AO]S?\\b|cancelamento\\s+d[aeo]s?\\b/gi)]\n      .map(mm=>fullBlock.slice(mm.index,mm.index+500));\n",
    "    const janelas=[...fullBlock.matchAll(/CANCELAD[AO]S?\\b|cancelamento\\s+d[aeo]s?\\b/gi)]\n"
    + String.raw`      .map(mm=>{
        // "Fica cancelada a hipoteca registrada sob o nº 03, em virtude do
        // imóvel ter sido adjudicado ao credor, conforme R. 06" cita o R.06 como
        // MOTIVO, e a janela inteira dava por cancelada a adjudicação que
        // acabava de transmitir o imóvel. O corte é só em "em virtude" e
        // "conforme", que abrem o motivo DEPOIS do alvo. "À vista do" não corta:
        // a 229.216 escreve "à vista do Instrumento de Quitação, para constar
        // que a alienação objeto do R4…", com o alvo depois dele.
        const j=fullBlock.slice(mm.index,mm.index+500);
        const corte=j.search(/,?\s+(?:em\s+virtude|conforme)\b/i);
        return corte>0?j.slice(0,corte):j;
      });
` ,
    'janela do alvo do cancelamento',
  )
  // "hipoteca registrada sob o nº 03" nomeia o alvo sem a letra do ato.
  trocar(
    "        refs.push((r[1].toUpperCase().startsWith('AV')?'AV':'R')+'-'+r[2]);\n      }\n",
    "        refs.push((r[1].toUpperCase().startsWith('AV')?'AV':'R')+'-'+r[2]);\n      }\n"
    + String.raw`      for(const r of janela.matchAll(/\b(registrad|averbad)[ao]s?\s+sob\s+(?:o\s+)?n[º°.o]?\s*(\d{1,3})\b/gi)){
        refs.push((r[1].toLowerCase()==='averbad'?'AV':'R')+'-'+r[2]);
      }
`,
    'alvo por "registrada sob o nº"',
  )

  // ── Consequências das classes novas ─────────────────────────────────
  trocar(
    "const tiposGravame=new Set(['alienacao_fiduciaria',",
    "const tiposGravame=new Set(['arrolamento_fiscal','existencia_acao','alienacao_fiduciaria',",
    'gravames novos',
  )
  trocar(
    "const TIPOS_DOMINIAIS={compra_e_venda:'Compra e Venda',",
    "const TIPOS_DOMINIAIS={usucapiao:'Usucapião',compra_e_venda:'Compra e Venda',",
    'usucapião é dominial',
  )

  return js
}
