# Capítulo 30: Retificação de Registro e Erro Material do Cartório

## Core Idea
Nem todo defeito numa certidão é do documento ou da leitura: às vezes o que está impresso está errado porque o cartório errou ao lançar o ato. Erro material no registro não é lacuna nem vício de validade — é hipótese de **retificação administrativa**, feita pelo próprio Oficial a requerimento do interessado (art. 212, caput, LRP, redação da Lei 10.931/2004), sem ação judicial e sem necessidade de nova certidão.

## Key Concepts

- **Retificação** (art. 212 LRP, caput, redação da Lei 10.931/2004): registro ou averbação **omisso, impreciso ou que não exprima a verdade** é retificado pelo Oficial do Registro de Imóveis competente, a requerimento do interessado, pelo procedimento administrativo do art. 213 — facultado ao interessado optar pela via judicial.
- **A via administrativa não fecha a judicial** (art. 212, parágrafo único): optar pelo procedimento do art. 213 não exclui a prestação jurisdicional, a requerimento da parte prejudicada.
- **Retificação de ofício** (art. 213, I): o Oficial corrige **de ofício ou a requerimento**, sem anuência de terceiros, nas hipóteses das alíneas — entre elas a alínea **"a", omissão ou erro cometido na transposição de qualquer elemento do título**, que é onde cabe o erro material de digitação.
- **Demais alíneas do art. 213, I**: "b" indicação ou atualização de confrontação; "c" alteração de denominação de logradouro público; "d" indicação de rumos, ângulos de deflexão ou inserção de coordenadas georreferenciadas; "e" alteração ou inserção que resulte de mero cálculo matemático feito a partir das medidas perimetrais constantes do registro; "f" reprodução de descrição de linha divisória de imóvel confrontante já retificado; "g" inserção ou modificação de dados de qualificação pessoal das partes, comprovada por documentos oficiais.
- **Retificação com anuência** (art. 213, II): inserção ou alteração de medida perimetral de que resulte área diferente da registrada — exige requerimento do interessado instruído com planta e memorial assinados por profissional habilitado e **anuência dos confrontantes**.
- **Legitimidade para requerer**: o interessado — quem porta o documento e é afetado pelo erro (proprietário, adquirente, credor). Não é o sistema, nem o analista: a recomendação é sempre dirigida ao portador.
- **Erro material evidente**: divergência que o próprio documento desmente. Número de matrícula num cabeçalho de ato diferente do que consta em todos os outros atos e no cabeçalho das fichas é o caso mais limpo — a certidão prova o erro contra si mesma.
- **Cancelamento não é retificação** (art. 214 LRP): nulidade de pleno direito leva a cancelamento do registro, por processo próprio, e desconstitui o ato. Retificação preserva o ato e conserta o que nele foi mal expresso.
- **Retificação não reabre qualificação**: corrigir o cabeçalho não reexamina o título nem altera a eficácia do ato registrado, que continua produzindo efeitos enquanto não cancelado (art. 252 LRP).

## Distinção que muda a recomendação

Três causas distintas, três destinatários distintos. Trocá-las manda o portador ao lugar errado — e o custo é dele.

| | Páginas ausentes | Erro de leitura | **Erro material do registro** |
|---|---|---|---|
| O que houve | faces não chegaram ao arquivo | a face chegou; a extração corrompeu o texto | o documento está inteiro e foi lido certo; o **impresso** está errado |
| Sinal | salto de numeração sem atos dos dois lados, paginação declarada maior, "continua na ficha X" sem a ficha | trecho truncado, caractere corrompido, rótulo ilegível | divergência que o próprio documento desmente (matrícula do cabeçalho ≠ matrícula das fichas) |
| A quem se pede | ao cartório, certidão de inteiro teor | a ninguém — reprocessar o arquivo | ao Oficial, retificação (art. 212, caput) |
| Efeito no parecer | **suspende** | não suspende | **não suspende** — vai para inconsistências |

## Anti-patterns

- **Tratar o número divergente como ato de outra matrícula.** Ato lançado na ficha desta matrícula é desta matrícula. O dígito errado no cabeçalho não o transfere de ficha, e recomendar certidão da "matrícula 199.908" manda o portador atrás de uma ficha que não existe.
- **Contar o ato como faltante e suspender o relatório.** O ato está lá e foi lido; suprimir a análise por causa de um dígito repete o erro que o portão de integridade existe para evitar — recusar documento que está inteiro.
- **Chamar erro do cartório de erro de leitura.** Manda reprocessar um arquivo sem defeito e deixa intocado o erro que só o Oficial pode corrigir.
- **Recomendar ação judicial de plano.** O art. 212 põe a via administrativa em primeiro lugar e o art. 213, I, permite até correção de ofício. Mandar o portador ao Judiciário por erro de digitação é desproporcional e caro.
- **Confundir com o art. 214.** Nulidade de pleno direito é cancelamento, não retificação, e desconstitui o ato. Um dígito errado no cabeçalho não invalida nada.
- **Exigir anuência de confrontantes para erro de transposição.** Anuência é do art. 213, II (medida perimetral). Erro material da alínea "a" do inciso I dispensa.

## Worked Example

```
Matrícula 119.908 — 15º RI de São Paulo (aberta em 04/01/1990)
Cabeçalho de todas as fichas: "matrícula 119.908"

Av.01 - 119.908 - São Paulo, 27 de abril de 1.990.  (demolição do prédio 3.404)
Av.02 - 119.908 - São Paulo, 27 de abril de 1.990.  (demolição do prédio 554)
Av.03 - 199.908 - São Paulo, 27 de abril de 1.990.  (demolição do prédio 558)
Av.04 - 119.908 - São Paulo, 27 de abril de 1.990.  (demolição do prédio 538)
...
R.10  - 119.908 - São Paulo, 14 de outubro de 2013. (compra e venda)
```

**Leitura correta.** A Av.03 traz `199.908`; o cabeçalho das fichas e os outros nove atos trazem `119.908`. Um dígito a mais no lugar do primeiro "1". A própria certidão desmente o número: não há como a Av.03 pertencer a outra matrícula estando lançada na ficha 01-verso desta.

**O que NÃO concluir.** Que falta o ato 3; que a Av.03 é de outra matrícula; que o documento está incompleto; que houve falha na leitura.

**O que escrever.**

> **Inconsistência.** A Av.03 está lançada como pertencente à matrícula 199.908, enquanto o cabeçalho das fichas e os demais nove atos indicam a matrícula 119.908. Trata-se de erro material de digitação no próprio registro, e não de ato estranho a esta matrícula.
>
> **Diligência recomendada.** Requerer ao Oficial do 15º Registro de Imóveis de São Paulo a retificação do cabeçalho da Av.03, com fundamento no art. 212, caput, da Lei 6.015/1973 (redação da Lei 10.931/2004), pelo procedimento administrativo do art. 213, I, "a" (erro cometido na transposição de elemento do título), hipótese em que o Oficial pode proceder inclusive de ofício. A retificação não altera o conteúdo nem a eficácia da averbação, que permanece produzindo seus efeitos.

**Efeito no relatório.** Nenhum. O relatório é emitido normalmente, com classificação de risco real; a divergência entra em `inconsistencias` e a providência em `diligencias_recomendadas`.

## Checklist de erro material

- [ ] O número divergente aparece em **um** cabeçalho, contra o cabeçalho das fichas e os demais atos?
- [ ] A divergência sobreviveu à conferência de leitura (ou seja, é o que está impresso)?
- [ ] O ato está fisicamente lançado na ficha desta matrícula?
- [ ] A hipótese é de transposição/erro material (art. 213, I) e não de medida perimetral (art. 213, II)?
- [ ] A recomendação nomeia o **Oficial**, o **cartório**, o **ato** e o **fundamento** (art. 212, caput, LRP)?
- [ ] O relatório segue emitido, com a divergência em `inconsistencias` e não em `riscos`?
