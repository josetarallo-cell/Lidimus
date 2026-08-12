---
name: tradutor-matriculas-analise-juridica
description: "Analisa matrículas imobiliárias do workflow n8n tradutor-matriculas com verificação de integridade do documento, parser temporal, classificador jurídico, motor de estado, regras determinísticas em Python, RAG legal, detector de riscos e saída JSON estruturada."
category: analysis
risk: safe
source: local
user-invocable: true
date_added: "2026-05-29"
tags: "[n8n, matriculas, analise juridica, RAG, Python]"
---

# Análise Jurídica de Matrículas

Use esta skill quando o workflow `tradutor-matriculas` precisar transformar OCR e atos registrais em análise jurídica estruturada.

## Objetivo

Converter o texto da matrícula em uma leitura jurídica confiável com:

- verificação de integridade do documento **antes de qualquer conclusão**;
- linha do tempo dos atos;
- classes jurídicas padronizadas e classes adicionais detectadas;
- estado atual do imóvel;
- regras determinísticas em Python;
- fundamentação legal com RAG;
- detector de riscos e inconsistências;
- JSON final completo e compatível com os nós seguintes do n8n.

---

## 0. Portão de integridade — executar ANTES de tudo

Uma matrícula lida pela metade não sustenta parecer. O erro mais grave que esta
skill pode cometer não é errar um artigo de lei: é opinar com segurança sobre um
documento que não foi lido inteiro — afirmar quem é o proprietário sem ter lido o
título aquisitivo, ou dizer que a cadeia dominial está íntegra quando faltam atos.

O workflow entrega o bloco `INTEGRIDADE DO DOCUMENTO (DETERMINÍSTICO)`. Ele é
**fonte de verdade** e não se discute — nos dois sentidos: quando disser
`completo: false`, a matrícula está incompleta, ponto final; quando disser
`completo: true`, ela está completa, ainda que você estranhe alguma numeração.
Salto de numeração que o bloco já explicou em `cabecalhos_ilegiveis` não é
lacuna, e reabri-lo por conta própria suprime relatório de documento inteiro.

Na ausência desse bloco, verifique você mesmo os quatro sinais:

| Sinal | Como aparece no texto | O que significa |
|---|---|---|
| Paginação declarada | `Pág. 4 de 6`, `Pag. 5/6`, `Folha 2 de 3` | O total declarado é maior do que o número de páginas presentes |
| Continuação sem destino | `continua no verso`, `continua na ficha 02` sem a ficha seguinte | Falta a face ou a ficha citada |
| Salto na numeração dos atos | `R-02` seguido direto de `AV-08` | Faltam os atos 03 a 07 — **desde que** a corrente de fichas esteja quebrada. Com as fichas todas presentes e o ato citado no corpo de outro, o mais provável é cabeçalho ilegível, não página ausente |
| Ficha iniciando no meio | a primeira linha da página já é `AV-08`, sem cabeçalho de ficha | Falta a frente da ficha |

### Diagnóstico correto da causa

Página que nunca chegou e cabeçalho que o OCR destruiu têm ações corretivas
**opostas**: a primeira só se resolve pedindo as páginas ao cartório, a segunda
se resolve reprocessando o arquivo. Trocar uma pela outra manda o cliente gastar
com uma certidão que não resolveria nada. Diga qual é o caso — e quem decide isso
não é você: é o campo `integridade.causa_provavel` do bloco determinístico.

| `causa_provavel` | O que houve | O que recomendar |
|---|---|---|
| `paginas_ausentes` | Faces do documento não chegaram ao arquivo | Solicitar ao cartório a certidão de inteiro teor |
| `falha_de_leitura` | As faces chegaram; o OCR destruiu rótulos de ato | **Reprocessar o arquivo** — não pedir nada ao cartório |
| `null` | Sem lacuna | Nada a recomendar |

O bloco determinístico separa as duas listas, e elas não significam a mesma coisa:

- `atos_faltantes` — números sem nenhuma evidência de que a face tenha chegado.
  São lacuna real e reprovam o documento.
- `cabecalhos_ilegiveis` — números cuja face **está** no arquivo (corrente de
  fichas fechada, contagem de páginas batendo e atos lidos dos dois lados da
  lacuna), mas cujo rótulo o OCR corrompeu. O texto desses atos foi entregue a
  você dentro do OCR: ele está lá, apenas sem fronteira marcada, e por isso pode
  aparecer somado ao bloco do ato anterior.

**`cabecalhos_ilegiveis` NÃO torna a matrícula incompleta.** Com
`integridade.completo: true`, emita o relatório normalmente, mesmo havendo
cabeçalho ilegível. O que se exige nesse caso é registrar o fato em
`inconsistencias`, reproduzindo o texto de `integridade.avisos_leitura`, e
apontar a diligência de reprocessamento. Suprimir o relatório aqui repete o erro
que esta regra existe para evitar: recusar documento que está inteiro.

Fora desses campos, só afirme falha de OCR com evidência positiva — trecho
truncado no meio de uma frase, sequência de caracteres corrompida —, e ainda
assim descreva o trecho afetado.

### Modo obrigatório quando a matrícula está incompleta

Com `completo: false`, você entra em **modo de organização de dados**. Nesse modo:

**PROIBIDO:**

- emitir conclusão técnica, juízo jurídico ou recomendação de negócio;
- classificar risco — `classificacao_risco` é sempre `"nao_aplicavel"`;
- afirmar quem é o proprietário atual quando o ato aquisitivo não foi lido;
- afirmar que a cadeia dominial está íntegra, regular ou quebrada;
- dizer que o imóvel está livre de ônus (os ônus podem estar nas páginas ausentes);
- preencher `riscos` com risco jurídico do imóvel.

**OBRIGATÓRIO:**

- `aviso_matricula_incompleta` no nível raiz, com o texto exato do aviso, as
  páginas lidas e declaradas e a lista de atos faltantes;
- `modo_analise: "dados_organizados"`;
- organizar e devolver **apenas o que consta** do documento: identificação da
  matrícula, imóvel, atos legíveis com data, tipo, partes e valor, e ônus
  visíveis nos atos lidos;
- `parecer_geral` limitado ao aviso e ao inventário do que foi lido — sem juízo
  de valor sobre o imóvel;
- `estado_atual.cadeia_dominial_status: "indeterminada_documento_incompleto"`;
- `inconsistencias` traz as lacunas documentais (páginas e atos faltantes) — é
  onde elas entram, e não em `riscos`.

Texto-padrão do aviso (adapte apenas os números):

> **MATRÍCULA INCOMPLETA — relatório técnico não emitido.** Foram analisadas N de M
> páginas declaradas na própria certidão, e faltam os atos X, Y e Z. Os dados
> abaixo são apenas a organização do que consta das páginas recebidas. Qualquer
> conclusão sobre propriedade, ônus ou cadeia dominial exigiria o documento
> completo. Solicite ao cartório a certidão de inteiro teor.

Se houver ônus ou restrição visíveis nas páginas lidas, registre-os como fato
extraído e diga que a lista **não é exaustiva** — sem classificá-los em nível de
risco.

### Datação por limite inferior

Mesmo sem data de expedição, o último ato registrado data a certidão por baixo:
se o último ato é de 21/03/2024, a certidão é **necessariamente posterior a
21/03/2024**. Registre isso em `documento.certidao_posterior_a` em vez de
devolver "não identificada" e parar aí.

---

## 0.1 Cadeia anterior ≠ documento incompleto

Documento incompleto e cadeia anterior em outra matrícula são estados
**diferentes, com ações corretivas diferentes**. Um se resolve pedindo as páginas
que faltam ao cartório e impede o parecer; o outro se resolve com a certidão da
matrícula de origem e apenas **delimita o alcance** do parecer. Tratar o segundo
como se fosse o primeiro manda o cliente pedir páginas que já estão nas mãos
dele.

### Como se lê `R.18/126.092`

Nessa notação o número **depois da barra é a matrícula**, e o de antes é o ato
dentro dela. Portanto:

| O que você vê | Se a matrícula em análise é… | Leitura |
|---|---|---|
| `R.14/82.662` | a 82.662 | cabeçalho de ato **desta** matrícula (formato de ficha moderna) |
| `R.18/126.092` | a 229.216 | ato de **outra** matrícula — referência, não ato desta |

Referência a outra matrícula **nunca** é ato desta, **nunca** entra na
`linha_tempo`, **nunca** conta como "ato citado e não transcrito" e **nunca**
gera ato faltante. Um `R.18` de outra matrícula não significa que esta tenha 18
atos nem que faltem os dezessete primeiros.

### `REGISTRO ANTERIOR` é ponteiro de origem

A matrícula aberta por destaque, desmembramento ou transporte indica de onde veio
em `REGISTRO ANTERIOR: R.18/126.092`. Isso é o **elo de continuidade** exigido
pelo art. 195 da LRP, não uma lacuna. O que ele diz é: *o título que investiu o
titular atual está registrado sob o nº 18 da matrícula 126.092*.

### O que NÃO é sinal de incompletude

Espelho da tabela da seção 0 — nenhum destes autoriza o modo de dados
organizados:

| Sinal | Por que não é incompletude |
|---|---|
| Registro anterior com número alto (`R.18`) | conta os atos da matrícula **de origem**, não desta |
| Matrícula recente com poucos atos | matrícula aberta em 2015 tem mesmo poucos atos |
| Primeiro ato ser `Av.1` de abertura de matrícula | é o marco inicial correto desta matrícula |
| Não haver histórico anterior à abertura | ele está na matrícula de origem, por definição |

### Modo obrigatório quando há origem não examinada

O oposto do modo da seção 0. Com o documento íntegro e uma matrícula de origem
apontada:

**PROIBIDO:**

- usar `modo_analise: "dados_organizados"` por causa da origem;
- usar `classificacao_risco: "nao_aplicavel"` por causa da origem;
- preencher `aviso_matricula_incompleta`;
- dizer que faltam páginas ou atos;
- dizer que a cadeia dominial está **quebrada** — ela não está: está **fora do
  documento**, que é outra coisa.

**OBRIGATÓRIO:**

- `modo_analise: "completa"`, com classificação de risco real sobre o que foi
  lido;
- `estado_atual.cadeia_dominial_status: "atual_integra_origem_nao_examinada"`;
- bloco `escopo_e_limites` preenchido (`periodo_examinado`, `base_documental`,
  `fora_do_escopo`);
- `diligencias_recomendadas` abrindo com a certidão de inteiro teor da matrícula
  de origem, **nomeando matrícula, ato e cartório**;
- bloco `origem` refletindo o que o workflow entregou.

Texto-padrão da ressalva (adapte apenas os dados):

> Esta análise cobre a matrícula desde DD/MM/AAAA. O histórico anterior está na
> matrícula de origem indicada como registro anterior (o R.NN da matrícula
> MMM.MMM, de DD/MM/AAAA), e não nesta peça: os atos anteriores não foram
> cancelados nem suprimidos. Para fechar o período usual de análise e confirmar
> que nenhum ônus vigente deixou de ser transportado na abertura, solicite a
> certidão de inteiro teor da matrícula MMM.MMM.

### Por que a diligência é recomendável e não dispensável

A concentração dos atos na matrícula (Lei 13.097/2015, art. 54) protege o
adquirente de boa-fé e dispensa exigir certidões além das legalmente previstas.
Mas a própria matrícula **dá notícia da origem** no registro anterior, e três
riscos concretos permanecem: ônus vigente que não foi transportado na abertura
por erro; cobertura temporal insuficiente quando a matrícula é recente; e as
ressalvas expressas do próprio art. 54 (arts. 129 e 130 da Lei 11.101/2005 e as
aquisições que independem de registro). Diga isso na recomendação — sem
transformá-lo em impedimento.

---

## Ordem de Execução

1. **Parser temporal**
   - Identifique atos em ordem cronológica.
   - Extraia data, tipo de ato, sequência, partes, valor, cancelamentos e referências cruzadas.
   - Produza uma `linha_tempo` com a evolução registral do imóvel.
   - A `linha_tempo` DEVE conter TODOS os atos do documento (ou todos os itens do array `ATOS DETECTADOS` quando o workflow o fornecer), na mesma ordem e quantidade. É proibido omitir ou amostrar atos.
   - **Ato citado não é ato lido.** Um número de ato que aparece dentro do corpo
     de outro ato ("o executado, já qualificado no R.05", "conforme a Av-3") é
     referência cruzada, não ato transcrito. Nunca crie entrada de `linha_tempo`
     a partir de citação, e nunca atribua propriedade, valor ou partes a um ato
     que você só conhece por citação. Registre a referência em `observacoes` e,
     se o ato citado não constar do documento, liste-o entre os atos faltantes.
   - **Exceção: ato de outra matrícula não é nem ato nem citação.** `R.18/126.092`
     numa análise da matrícula 229.216 é ato da 126.092. Vai para `origem`, não
     para `linha_tempo` nem para os atos faltantes — ver a seção 0.1.

2. **Datas: a da averbação, não a do título**
   - A data que vale para o registro é a **data do ato registral** (a averbação
     ou o registro em si), não a data do documento que o originou.
   - Uma certidão expedida pelo juízo em 04/10/2021, prenotada em 05/10/2021 e
     averbada em 28/10/2021 gera um ato com `data: "28/10/2021"`. As outras duas
     vão para `data_titulo` e `data_prenotacao`.
   - Sinal de que você pegou a data errada: um ato sai em `dd/mm/aaaa` enquanto
     os vizinhos saem por extenso, ou vice-versa. Os atos de uma mesma ficha
     costumam ser grafados do mesmo jeito — divergência de formato é indício de
     que a data veio de outro trecho.
   - Quando não der para separar as três datas, use a mais tardia compatível com
     o ato registral e diga em `observacoes` de onde ela veio.

3. **Classificador jurídico**
   - Classifique os atos nas classes base:
     - Compra e Venda -> `TRANSFERENCIA`
     - Alienação Fiduciária -> `GARANTIA`
     - Penhora -> `RESTRICAO`
     - Usufruto -> `DIREITO_REAL`
     - Cancelamento -> `EXTINCAO`
   - Detecte e reporte outras classes quando existirem, por exemplo:
     - `AVERBACAO`
     - `HIPOTECA`
     - `INDISPONIBILIDADE`
     - `RETIFICACAO`
     - `UNIFICACAO`
     - `DESMEMBRAMENTO`
     - `PARTILHA`
     - `DOACAO`
     - `INSTITUICAO_CONDOMINIO`
   - Nunca force um ato para uma classe incorreta. Se houver dúvida, registre em `outras_classes_detectadas`.

   **Tabela de mapeamento obrigatório:**

   | Tipo de Ato                                    | Classe        |
   |------------------------------------------------|---------------|
   | Compra e Venda, Adjudicação, Arrematação       | TRANSFERENCIA |
   | Hipoteca, Alienação Fiduciária                 | GARANTIA      |
   | Penhora, Arresto, Indisponibilidade            | RESTRICAO     |
   | Usufruto, Servidão, Direito de Superfície      | DIREITO_REAL  |
   | Cancelamento de Ônus                           | EXTINCAO      |
   | Averbação, Abertura, Retificação, Destacamento | AVERBACAO     |

   Nunca use `ONUS` como valor de `classe` — esse valor não pertence ao schema.

   - **Compromisso de venda e compra não é transferência.** Averbação ou registro
     de compromisso, promessa ou cessão de direitos gera direito obrigacional (ou
     real de aquisição), nunca domínio. Classificar compromisso como adjudicação
     ou compra e venda troca o dono do imóvel — é o erro mais caro desta etapa.

4. **Motor de estado**
   - Determine o estado atual do imóvel com base na linha do tempo.
   - Considere apenas atos ativos, cancelados, extintos ou substituídos.
   - Reflita o estado final em campos como `estado_atual`, `onus_ativos`, `restricoes_ativas`, `direitos_reais_ativos` e `cadeia_dominial_status`.
   - Transporte de ônus (ex.: "TRANSPORTE DE ÔNUS PENHORA") mantém o ônus ATIVO na nova matrícula até cancelamento expresso.
   - Cancelamento parcial (ex.: "fica CANCELADA a hipoteca indicada na Av-1 e a penhora indicada na Av-3 e Av-4") extingue SOMENTE os atos citados nominalmente; todos os demais gravames permanecem ativos.
   - Quando o workflow fornecer a lista `ÔNUS ATIVOS (DETERMINÍSTICO)`, ela é a fonte de verdade: `estado_atual.onus_ativos` deve conter exatamente essas sequências.
   - Adjudicação e arrematação são atos de TRANSFERENCIA dominial; o proprietário atual decorre do último ato de transferência, nunca da última averbação.
   - Com documento incompleto, `cadeia_dominial_status` é
     `indeterminada_documento_incompleto` — nunca `ok` e nunca `quebrada`. Uma
     lacuna de páginas não prova quebra de cadeia; prova que não dá para afirmar.
   - Com documento íntegro e origem em outra matrícula,
     `cadeia_dominial_status` é `atual_integra_origem_nao_examinada` — a cadeia
     desta matrícula está encadeada; o que não foi examinado é o que a antecede.

5. **Regras determinísticas em Python**
   - Use Python apenas para regras objetivas e repetíveis.
   - Prefira a biblioteca padrão.
   - Exemplos de regra:

```python
hipoteca_ativa = bool(hipoteca and not cancelamento_hipoteca)
alienacao_fiduciaria_ativa = bool(alienacao_fiduciaria and not cancelamento_fiduciaria)
penhora_ativa = bool(penhora and not cancelamento_penhora)
```

   - Se a regra for inequívoca, grave o resultado em um campo booleano ou estruturado.
   - Se a regra depender de interpretação, deixe a decisão para o classificador e apenas normalize a saída.

   **Nomeação de booleanos — regra rígida.** O nome do campo deve descrever
   exatamente a proposição que fica verdadeira quando `resultado: true`. É
   proibido:

   - nome negado ou com `not` embutido (`alienacao_posterior_penhora_eficaz =
     not penhora_inscrita_antes_alienacao`) — o leitor lê o rótulo, não a
     fórmula, e conclui o oposto do parecer;
   - rótulo em desacordo com a fórmula;
   - dupla negação de qualquer espécie.

   Escreva a proposição na forma afirmativa que você quer afirmar. No exemplo
   acima, o correto é `penhora_inscrita_antes_da_alienacao: true`, com
   `condicao` explicando a consequência ("alienação posterior é ineficaz perante
   o exequente"). Antes de emitir cada regra, releia o par rótulo/resultado e
   pergunte: *um leitor apressado que só olhe o nome e o "Sim/Não" chega à mesma
   conclusão do parecer?* Se não chegar, o rótulo está errado.

   - Inclua sempre a verificação aritmética da área quando o documento trouxer as
     medidas: `area_confere = abs(testada * profundidade - area_declarada) < 0.5`.
     É barata e pega erro de digitação e de OCR.

6. **RAG jurídico**
   - Consulte fontes legais nesta ordem de prioridade:
     1. Lei n. 6.015/1973 - Registros Públicos
     2. Lei n. 13.097/2015, art. 54 - concentração dos atos na matrícula
     3. Lei n. 4.591/1964 - Incorporações Imobiliárias
     4. Lei n. 9.514/1997 - Alienação Fiduciária
     5. CPC/2015 - penhora, fraude à execução e averbação premonitória
     6. Código Nacional de Normas do Foro Extrajudicial (CNN/CN/CNJ-Extra) - CNIB
     7. Lei n. 10.267/2001 - Georreferenciamento Rural, quando o imóvel for rural
     8. Normas da Corregedoria Geral da Justiça de São Paulo
   - Sempre que possível, cite artigo, inciso, item ou subitem.
   - Se a fonte não estiver confirmada, marque como `fundamentacao_pendente` em vez de inferir.

   **Vigência — confira antes de citar.** Norma revogada em parecer de hoje é erro
   material, mesmo quando a averbação original a citava corretamente na época.

   | Não cite como vigente | Cite | Observação |
   |---|---|---|
   | Provimento CNJ 39/2014 | CNN/CN/CNJ-Extra, arts. 320 e ss. (redação do Prov. CNJ 188/2024) | O Prov. 188/2024 revogou o 39/2014 e levou a disciplina da CNIB para o Código Nacional de Normas (Prov. 149/2023), agora como CNIB 2.0 |
   | CPC, art. 831, para fundamentar penhora averbada | CPC, art. 844 (averbação da penhora), art. 792, §1º (ineficácia perante o exequente) e art. 799, IX | O art. 831 trata da extensão da penhora sobre bens suficientes — pouco pertinente |

   Quando o texto da averbação citar a norma da época, isso é fato do documento:
   transcreva em `evidencia` e traga a norma vigente em `referencia`, explicando a
   sucessão normativa. Não corrija o documento — atualize a fundamentação.

   **REsp 956.943/PR (Corte Especial, repetitivo) — precisão obrigatória.** O
   precedente estabelece que a averbação da penhora gera **presunção absoluta de
   ciência do terceiro adquirente**, afastando a discussão de boa-fé (Súmula
   375/STJ). Ele **não** diz que há "presunção absoluta de fraude": a fraude à
   execução continua exigindo os demais requisitos — citação válida do executado
   e insolvência ou risco de insolvência. Escrever "presunção absoluta de fraude"
   é erro que derruba o parecer em contraditório.

   **Lei 13.097/2015, art. 54 — norma-âncora.** Em parecer de matrícula, cite-a
   sempre que houver conclusão sobre oponibilidade: o que não está averbado na
   matrícula não é oponível ao adquirente de boa-fé, o que é exatamente o motivo
   de o parecer existir.

7. **Detector de riscos**
   - Detecte e sinalize, no mínimo:
     - cadeia dominial quebrada
     - área inconsistente
     - averbações contraditórias
     - indisponibilidade
     - penhora ativa
     - múltiplos CPF/CNPJ divergentes
     - ausência de cancelamento formal
     - ônus transportados de matrícula anterior sem cancelamento formal
     - destacamento/desapropriação de área sem atualização da área total
     - unificação irregular
     - matrícula mãe sem baixa
     - possíveis fraudes documentais
     - duplicidade de descrição
     - inconsistência geográfica
   - Para cada risco, inclua `tipo`, `severidade`, `evidencia` e `base_legal_ou_tecnica` quando houver.
   - Estruture cada risco em **impacto / evidência na matrícula / recomendação**,
     sempre com a referência ao ato específico (`AV-08`, `R-05`). Risco sem ato de
     ancoragem não é auditável.
   - **Regra obrigatória:** quando `onus_ativos.length > 0`, o array `riscos` nunca pode ser vazio. Crie pelo menos uma entrada por tipo de gravame ativo (ex.: `penhora_ativa`, `arresto_ativo`, `hipoteca_ativa`). Quando `areas_destacadas` não for vazio, adicione risco `destacamento_sem_area_atualizada`.
   - Distinga penhora de indisponibilidade: a **indisponibilidade impede a
     alienação**; a **penhora não impede, mas torna a alienação ineficaz perante
     o exequente**. Confundi-las muda a recomendação.
   - Quando houver penhora e/ou indisponibilidades ativas, aponte o **caminho
     viável** além do "não transacione": a via realista costuma ser a
     **arrematação em hasta pública**, em que a aquisição é originária e os
     gravames se resolvem no produto da arrematação. Recomende também consulta
     direta à **CNIB** e certidões dos distribuidores competentes (Justiça do
     Trabalho, cível e fiscal), nomeando as centrais.
   - Este bloco é para risco jurídico do imóvel. Lacuna documental (páginas ou
     atos faltantes) vai em `inconsistencias`, não aqui.

8. **Coerência entre classificação e texto — gate final**

   Antes de devolver o JSON, releia `classificacao_risco` ao lado de
   `parecer_geral`, `resumo_executivo.conclusao` e das severidades de `riscos`.
   Eles precisam contar a mesma história. Um parecer que diz "situação jurídica
   crítica e impeditiva de qualquer negócio imobiliário" com classificação
   `medio` é contradição interna e não pode sair.

   Piso obrigatório de classificação:

   | Situação | `classificacao_risco` mínimo |
   |---|---|
   | Qualquer indisponibilidade ativa | `critico` |
   | Penhora ou arresto ativo | `alto` |
   | Algum risco com severidade `critica` | `critico` |
   | Algum risco com severidade `alta` | `alto` |
   | Palavras "impeditiv", "crítica", "inviabiliza" no parecer | `critico` |
   | Documento incompleto (portão 0) | `nao_aplicavel` |

   `nao_aplicavel` é exclusivo do portão 0. Origem não examinada (seção 0.1)
   **não** rebaixa a classificação: o risco é o dos atos lidos, e a limitação vai
   para `escopo_e_limites` e `diligencias_recomendadas`. Se você devolver
   `nao_aplicavel` com o documento íntegro, o workflow eleva para `indeterminado`
   e registra a coerção.

   Na dúvida entre dois níveis, suba — subestimar risco causa dano; superestimar
   causa uma verificação a mais.

9. **Gerador estruturado**
   - Entregue toda a análise em JSON válido.
   - Use nomes de campos estáveis e previsíveis.
   - Mantenha a saída pronta para consumo por outros nós do n8n.

---

## Higiene do texto entregue ao cliente

O parecer é lido por advogado, corretor e investidor. Vocabulário de engenharia
de prompt no corpo do texto destrói a credibilidade do produto inteiro.

**Nunca escreva na saída** — em nenhum campo de texto:

- nomes de arquivos, seções ou capítulos de material interno: "Manual Prático RI,
  Cap. 16", "cheatsheet", "patterns", "anti-patterns", "key concepts",
  "frameworks", "skill", "prompt", "RAG", "workflow", "parser", "pipeline";
- referências ao bloco `FUNDAMENTOS RECUPERADOS` ou a scores de similaridade;
- meta-comentário sobre o próprio processo ("conforme a instrução recebida",
  "segundo a base fornecida").

O material interno serve para você **chegar** à fundamentação; o que sai é a
**norma**: lei, artigo, provimento, súmula, precedente. Se um fundamento só
existe no material interno e você não consegue ancorá-lo em norma citável,
marque `fundamentacao_pendente` e siga.

**Acentuação e ortografia.** Todo texto sai em português correto e acentuado:
"RISCO CRÍTICO", "CERTIDÃO NÃO IDENTIFICADA", "indisponibilidade", "penhora".
Nunca devolva rótulos sem acento nem o enum cru do pipeline (`medio`, `critico`)
como texto de leitura humana.

**Erros de OCR não se propagam.** Quando o texto trouxer corrupção evidente de
caractere, corrija no campo estruturado e registre o par em `inconsistencias`:

| OCR | Correto |
|---|---|
| `109 SUBDISTRITO` | `10º Subdistrito` |
| `livro 4-2` | `livro 4-Z` |
| `10 NE MIRANDA` | `IONE MIRANDA` |
| `Oficial Maier` | `Oficial Maior` |

Corrija apenas o que a evidência do próprio documento sustenta. Na dúvida,
mantenha o original e registre a dúvida.

---

## Valores monetários — nunca converter

Matrículas antigas trazem moedas extintas. **Converter cruzeiro de 1966 em real é
pior do que não converter**: introduz um número que não existe em documento
nenhum, com ordem de grandeza arbitrária, e o leitor não tem como perceber.

Regras:

1. **Preserve a moeda como está escrita no documento**, com o símbolo original:
   `Cr$`, `CR$`, `NCz$`, `Cz$`, `Cr$ (cruzeiro novo)`, `Rs`, `réis`, `US$`, `R$`.
2. **Preserve o numeral como está escrito.** `Cr$ 12.000.000` não vira
   `12.000.000,00` nem `120.000,00`. Se o documento não escreveu centavos, você
   também não escreve.
3. **Registre o ano do ato junto do valor** quando a moeda não for o real
   corrente: `"Cr$ 12.000.000 — 1966"`.
4. **Nunca** calcule equivalente em reais, correção monetária, INPC, IGP-M,
   salários mínimos ou "valor aproximado hoje". Se o cliente precisar, é outro
   serviço, com data-base e índice declarados.
5. Cuidado com o falso positivo de `R$` dentro de `CR$` — o símbolo é `CR$` e o
   valor é em cruzeiros.
6. Quando algarismo e extenso divergirem, **o extenso prevalece** (é a regra do
   registro) — e registre a divergência em `inconsistencias`.
7. Nunca use emolumentos, selos, custas ou taxas do rodapé da certidão como valor
   de um ato.

Formato dos campos de valor:

```json
{ "valor": "12.000.000", "moeda": "Cr$", "ano_valor": 1966, "valor_display": "Cr$ 12.000.000 (1966)" }
```

Para valores em real corrente, `moeda: "R$"` e o formato brasileiro usual
(`594.562,08`).

---

## Confrontações — nunca inferir rumo cardeal

Se a matrícula diz "de um lado", "de outro lado", "nos fundos", "à frente", é
**isso** que sai. Traduzir para Norte/Sul/Leste/Oeste é inventar informação: a
matrícula não diz para que lado o lote está virado, e confrontação cardeal
fabricada vira retificação e georreferenciamento errados.

- Só preencha `confrontantes.norte|sul|leste|oeste` quando o documento **escrever
  o rumo cardeal** ("confronta ao Norte com…", rumos em graus com direção NE/SW).
- Caso contrário, use `confrontantes_descricao`, um array que preserva a
  literalidade: `[{ "lado": "um lado", "confrontante": "Irmãos Ghigonetto" },
  { "lado": "outro lado", "confrontante": "Luiz Ceretti" },
  { "lado": "fundos", "confrontante": "Marcelino Ceretti" }]`.
- Com apenas `confrontantes_descricao` preenchido, os quatro campos cardeais
  ficam `null`. Não "distribua" os lados pelos pontos cardeais.

A mesma regra vale para qualquer dado geográfico: rumo, azimute e coordenada só
aparecem se estiverem escritos.

---

## Formato de Saída Esperado

Retorne um objeto JSON único com as chaves abaixo. A resposta deve ser rica o bastante para alimentar o resumo jurídico, o template HTML e eventuais integrações futuras.

### Estrutura mínima obrigatória

- `documento`
- `integridade`
- `modo_analise`
- `linha_tempo`
- `classes_juridicas`
- `outras_classes_detectadas`
- `estado_atual`
- `regras_deterministicas`
- `fundamentacao_legal`
- `riscos`
- `resumo_executivo`
- `legacy_compatibility`
- `json_final`

Quando `integridade.completo` for `false`, acrescente `aviso_matricula_incompleta`.

### Definição dos blocos

- `documento`: metadados do arquivo analisado, como matrícula, cartório, endereço, datas e fonte OCR.
- `integridade`: `{completo, paginas_lidas, paginas_declaradas, atos_faltantes, cabecalhos_ilegiveis, causa_provavel, fichas_faltantes, motivos}` — o diagnóstico do portão 0. `atos_faltantes` reprova o documento; `cabecalhos_ilegiveis` não reprova e vai para `inconsistencias`.
- `modo_analise`: `"completa"` ou `"dados_organizados"`.
- `linha_tempo`: lista cronológica dos atos com sequencia, data, tipo, classe, partes, valor, status e observações.
- `classes_juridicas`: lista estruturada das classes identificadas, preferencialmente com tipo, subtipo, evidência e confiança.
- `outras_classes_detectadas`: classes adicionais que não se encaixam nas categorias principais.
- `estado_atual`: leitura consolidada do imóvel no momento da análise, incluindo propriedade, ônus, restrições, direitos reais e continuidade registral.
- `regras_deterministicas`: regras objetivas aplicadas em Python, com condição, evidência e resultado.
- `fundamentacao_legal`: fontes jurídicas e normativas citadas, com referência precisa e aplicação prática.
- `riscos`: riscos e inconsistências em formato estruturado, com severidade, impacto, evidência e recomendação.
- `resumo_executivo`: síntese para leitura humana com risco, conclusões e próximos passos.
- `legacy_compatibility`: espelho simplificado dos campos antigos usados pelo workflow atual.
- `json_final`: objeto final consolidado, pronto para consumo posterior sem nova transformação.

### Campos compatíveis com o workflow atual

Para não quebrar o pipeline existente, inclua também estes campos legados no nível raiz, quando fizer sentido:

- `cadeia_dominial`
- `proprietarios_atuais`
- `riscos_texto`
- `inconsistencias`
- `onus`
- `gravames`
- `possiveis_problemas`
- `classificacao_risco`
- `parecer_geral`

Os campos `onus` e `gravames` devem ser arrays de OBJETOS no formato `{tipo, ato_referencia, credor, valor, moeda, data, situacao}` — nunca strings soltas como `"penhora"`, que empobrecem o relatório final.

### Proprietário atual (campo obrigatório)

`proprietarios_atuais` é um array de OBJETOS no formato `{nome, documento_tipo, documento_numero, qualificacao, estado_civil, regime_bens, endereco_domicilio, ato_aquisitivo, data_aquisicao, percentual, observacao}`. Use `null` no que não constar do documento.

Proprietário atual é o **titular do domínio** segundo o **último ato dominial registrado** — compra e venda (grafada também como "venda e compra"), permuta, adjudicação, arrematação, dação em pagamento, integralização de capital, partilha ou herança — já atualizado pelas averbações posteriores de alteração de denominação, incorporação, cisão ou transformação societária que renomeiem esse titular. Quando houver renomeação, use a denominação atual e registre a anterior em `observacao`.

Não confunda o proprietário atual com nenhum destes:

- o proprietário original do cabeçalho da matrícula (é o dono da abertura, não o de hoje);
- promitente comprador de compromisso de venda e compra, e cessionário de direitos — têm direito obrigacional registrado, não domínio;
- credor hipotecário ou fiduciário, exequente de penhora, usufrutuário, locatário ou confrontante.

Promitentes compradores e cessionários com registro ativo vão em `promissarios_cessionarios`, no mesmo formato, com a chave adicional `natureza` (ex.: "Cessionária dos direitos do compromisso, R-33").

**Quando o ato aquisitivo não foi lido** — porque está em página ausente ou só
aparece citado —, `proprietarios_atuais` fica vazio e a informação vai para
`proprietario_indicado`, com `fonte: "citação em <ato>"` e
`titulo_aquisitivo_lido: false`. Não afirme domínio, e jamais atribua percentual
("100%") a titular cujo título não foi lido. O que dá para dizer com segurança,
diga: se o AV-08 de 28/10/2021 qualifica o executado como já titular pelo R-05, a
aquisição é **anterior a 28/10/2021** e posterior ao ato dominial lido mais
recente — registre esse intervalo em `observacao`.

### Exemplo resumido

```json
{
   "documento": {
      "numero_matricula": "15.727",
      "cartorio": "1º CRI de São Paulo",
      "endereco": "..."
   },
   "integridade": {
      "completo": true,
      "paginas_lidas": 6,
      "paginas_declaradas": 6,
      "atos_faltantes": [],
      "fichas_faltantes": [],
      "motivos": []
   },
   "modo_analise": "completa",
   "linha_tempo": [
      {
         "sequencia": "R-1",
         "data": "12/03/1985",
         "data_titulo": "28/02/1985",
         "tipo": "Compra e Venda",
         "classe": "TRANSFERENCIA",
         "valor": "1.500.000",
         "moeda": "Cr$",
         "valor_display": "Cr$ 1.500.000 (1985)",
         "status": "ativo"
      }
   ],
   "classes_juridicas": [
      {
         "classe": "TRANSFERENCIA",
         "tipo": "Compra e Venda",
         "evidencia": "R-1/15.727",
         "confianca": "alta"
      }
   ],
   "outras_classes_detectadas": ["AVERBACAO"],
   "estado_atual": {
      "propriedade": "transferida",
      "cadeia_dominial_status": "ok",
      "onus_ativos": [],
      "restricoes_ativas": [],
      "direitos_reais_ativos": []
   },
   "regras_deterministicas": [
      {
         "regra": "hipoteca_ativa",
         "condicao": "hipoteca registrada e sem cancelamento posterior",
         "resultado": false
      }
   ],
   "fundamentacao_legal": [
      {
         "fonte": "Lei 6.015/1973",
         "referencia": "art. 176",
         "aplicacao": "continuidade registral"
      }
   ],
   "riscos": [
      {
         "tipo": "penhora_ativa",
         "severidade": "alta",
         "impacto": "alienação posterior é ineficaz perante o exequente",
         "evidencia": "AV-08, penhora averbada em 28/10/2021",
         "recomendacao": "verificar o processo antes de qualquer negócio"
      }
   ],
   "resumo_executivo": {
      "classificacao_risco": "alto",
      "conclusao": "Imóvel com penhora ativa averbada.",
      "recomendacao": "Consultar certidão atualizada antes da transação."
   },
   "legacy_compatibility": {
      "cadeia_dominial": [],
      "proprietarios_atuais": [],
      "inconsistencias": [],
      "onus": [],
      "gravames": [],
      "possiveis_problemas": [],
      "classificacao_risco": "alto",
      "parecer_geral": "..."
   },
   "json_final": {}
}
```

### Exemplo — matrícula incompleta

```json
{
   "integridade": {
      "completo": false,
      "paginas_lidas": 3,
      "paginas_declaradas": 6,
      "atos_faltantes": ["R-03", "AV-04", "R-05", "AV-06", "AV-07"],
      "fichas_faltantes": ["ficha 01 verso", "ficha 02 frente"],
      "motivos": ["rodapé declara 'Pag. 4 de 6'", "salto de R-02 para AV-08"]
   },
   "modo_analise": "dados_organizados",
   "aviso_matricula_incompleta": "MATRÍCULA INCOMPLETA — relatório técnico não emitido. Foram analisadas 3 das 6 páginas declaradas na própria certidão, e faltam os atos 03 a 07. Os dados abaixo são apenas a organização do que consta das páginas recebidas. Solicite ao cartório a certidão de inteiro teor.",
   "proprietarios_atuais": [],
   "proprietario_indicado": {
      "nome": "Motel Pousada do Cowboy Ltda",
      "documento_tipo": "CNPJ",
      "documento_numero": "59.883.579/0001-20",
      "fonte": "citação em AV-08",
      "titulo_aquisitivo_lido": false,
      "observacao": "Qualificado no R-05, que não consta das páginas recebidas; aquisição anterior a 28/10/2021."
   },
   "estado_atual": { "cadeia_dominial_status": "indeterminada_documento_incompleto" },
   "riscos": [],
   "inconsistencias": [
      "Faltam 3 das 6 páginas declaradas na certidão.",
      "Salto de R-02 (1989) para AV-08 (2021): atos 03 a 07 ausentes.",
      "Ficha 01 termina em 'continua no verso' e o verso não consta."
   ],
   "legacy_compatibility": {
      "classificacao_risco": "nao_aplicavel",
      "parecer_geral": "MATRÍCULA INCOMPLETA — relatório técnico não emitido. ..."
   }
}
```

### Exemplo — matrícula íntegra com cabeçalho ilegível

Caso real (matrícula 7.529 do 1º RI de São Bernardo do Campo): certidão inteira
de 7 faces, atos 1 a 14, mas o OCR destruiu o rótulo da Av.10 — que sobrevive
citada dentro de AV-11, R-12 e AV-13. A corrente de fichas fecha e há atos lidos
dos dois lados da lacuna, então a face chegou: é falha de leitura, não página
ausente. **Relatório emitido normalmente**, com a ressalva em `inconsistencias`.

```json
{
   "integridade": {
      "completo": true,
      "paginas_lidas": 7,
      "atos_faltantes": [],
      "cabecalhos_ilegiveis": ["AV-10"],
      "causa_provavel": "falha_de_leitura",
      "motivos": []
   },
   "modo_analise": "completa",
   "aviso_matricula_incompleta": null,
   "inconsistencias": [
      "Cabeçalho do ato 10 ilegível no OCR. O texto do ato está no arquivo e foi analisado, mas sem fronteira marcada pode aparecer somado ao bloco do ato anterior."
   ],
   "diligencias_recomendadas": [
      "Reprocessar o arquivo para recuperar o cabeçalho da Av.10 — não é caso de pedir certidão ao cartório."
   ]
}
```

### Exemplo — matrícula íntegra com origem não examinada

Caso real (matrícula 229.216 do 18º RI de São Paulo): sete faces, atos Av.1 a
R.6 sem lacuna, registro anterior apontando o R.18 da matrícula 126.092. Parecer
emitido, com ressalva de escopo.

```json
{
   "integridade": {
      "completo": true,
      "paginas_lidas": 7,
      "atos_faltantes": [],
      "motivos": [],
      "cadeia_anterior_nao_examinada": true
   },
   "origem": {
      "matricula_anterior": "126.092",
      "ato_anterior": "R.18",
      "data_registro_anterior": "05/08/2013",
      "cobertura_desde": "05/02/2015",
      "examinada": false
   },
   "modo_analise": "completa",
   "aviso_matricula_incompleta": null,
   "estado_atual": {
      "cadeia_dominial_status": "atual_integra_origem_nao_examinada",
      "propriedade": "LIBBS HOLDING LTDA (R.6, 17/10/2016)",
      "onus_ativos": []
   },
   "escopo_e_limites": {
      "periodo_examinado": "05/02/2015 a 17/10/2016 (abertura da matrícula ao último ato registrado)",
      "base_documental": "visualização da matrícula 229.216 — não é certidão",
      "fora_do_escopo": [
         "Atos anteriores a 05/08/2013, registrados na matrícula 126.092.",
         "Confirmação de que os ônus vigentes foram integralmente transportados na abertura."
      ]
   },
   "diligencias_recomendadas": [
      {
         "item": "Certidão de inteiro teor da matrícula 126.092 do 18º Registro de Imóveis de São Paulo",
         "motivo": "Origem indicada no registro anterior (R.18); fecha o período de análise e revela ônus não transportados.",
         "prioridade": "alta"
      }
   ],
   "legacy_compatibility": {
      "classificacao_risco": "baixo",
      "parecer_geral": "Matrícula íntegra e sem ônus vigentes. A análise cobre desde a abertura em 05/02/2015; o histórico anterior está na matrícula 126.092. ..."
   }
}
```

---

## Regras de Qualidade

- **Não opine sobre documento incompleto.** É a regra que vence todas as outras.
- **Mas cadeia anterior em outra matrícula não é documento incompleto** e não
  suspende o parecer: é ressalva de escopo com diligência nomeada (seção 0.1).
- Priorize determinismo quando a evidência documental for objetiva.
- Nunca converta moeda; preserve o símbolo original e o ano.
- Nunca use emolumentos, selos ou custas do rodapé da certidão como valor de um ato.
- Valores em real corrente no formato brasileiro (1.234.567,89); valores em moeda extinta, como escritos no documento.
- Nunca infira confrontação cardeal.
- Nunca cite norma revogada como vigente.
- Nunca deixe vocabulário interno (manual, cheatsheet, patterns, prompt, RAG) sair no texto.
- O campo `documento.endereco` é o endereço do IMÓVEL objeto da matrícula, nunca o endereço do cartório.
- Separe fato extraído, inferência e conclusão jurídica — e rotule qual é qual.
- Não invente dados ausentes. Ausência é informação: registre-a.
- Se houver conflito entre atos, reporte o conflito explicitamente.
- Se o documento for rural, reavalie georreferenciamento e consistência territorial.
- Se a análise encontrar incerteza alta, mantenha o risco visível no resultado final.
- Prefira arrays de objetos em vez de strings soltas quando a informação puder ser estruturada.
- Mantenha o bloco `legacy_compatibility` preenchido para integração com workflows antigos.
- Datas e horários de referência sempre em `America/Sao_Paulo`.
