# Capítulo 16: Constrições Judiciais — Penhora, Arresto e Sequestro

## Core Idea
Penhora, arresto e sequestro são medidas de constrição judicial sobre imóveis que devem ser averbadas no RI para produzir eficácia erga omnes; sem registro da penhora, não há presunção de fraude à execução — o credor assume o ônus de provar má-fé do adquirente; com registro, a presunção é absoluta.

## Frameworks Introduzidos

- **Presunção de Fraude à Execução (STJ REsp 956.943/PR — Recurso Repetitivo)**:
  - **Com registro da penhora**: a alienação posterior é presumidamente fraudulenta (presunção juris et de jure); alienação ineficaz independentemente de provar má-fé.
  - **Sem registro da penhora**: o credor deve provar que o adquirente sabia da execução capaz de levar o alienante à insolvência.
  - **Com averbação premonitória** (art. 828, §3º CPC/2015 = art. 615-A, §3º CPC/1973): presunção de fraude na alienação/oneração posterior.
  - Citação válida é indispensável para configurar fraude à execução (ressalvada hipótese da averbação premonitória).

## Key Concepts

- **Penhora** (art. 831 CPC): apreensão e depósito de bens suficientes para a dívida (principal + juros + custas + honorários). O bem fica à disposição do juízo.
- **A Penhora Não Gera Indisponibilidade**: o bem pode ser alienado; mas a alienação é ineficaz perante o credor que tem a penhora inscrita.
- **Inscrição da Penhora** (art. 844 CPC): incumbência do exequente; apresenta cópia do auto ou termo.
- **Penhora no Rosto dos Autos**: quando o executado tem crédito em outro processo; a penhora incide sobre o crédito a ser reconhecido naquele processo.
- **Requisitos do Título** (arts. 176, §1º, III e 225 LRP): descrição do imóvel, qualificação do devedor e do credor, valor da dívida, dados do processo.
- **Arresto** (art. 813 CPC): medida cautelar de apreensão de bens do devedor quando há risco de dilapidação do patrimônio capaz de levar à insolvência.
- **Sequestro**: medida cautelar sobre bem determinado e específico objeto de ação judicial; bem fica com depositário até o final da demanda.
- **Conteúdo do Mandado** (art. 239 LRP): nome do juiz, depositário, partes e natureza do processo.

## Anti-patterns

- **Não registrar a penhora** → credor perde a presunção absoluta de fraude; passa a ter ônus de provar má-fé do adquirente.
- **Exigir cancelamento de penhoras anteriores** antes de registrar carta de arrematação → ilegal; alienação forçada prevalece sobre constrições anteriores (CSM).
- **Confundir penhora com indisponibilidade**: penhora não impede alienação; indisponibilidade sim — são institutos distintos.
- **Confundir arresto com penhora**: arresto é cautelar pré-executivo; penhora é ato executivo. Arresto se converte em penhora quando a execução se instaura.

## Worked Example

**Averbação de arresto:**
```
Av.01 - ARRESTO
Em 01/03/2016 (prenotação nº 123.456)
Conforme Mandado expedido em 25/01/2016 pelo Juiz da Vara Cível de SP,
nos autos da Execução (proc. nº 1234/2015), movida pelo BANCO CREDOR
S/A [CNPJ] contra JOSÉ SILVA [qualificação], para cobrança de R$1.000,00,
o imóvel foi arrestado e depositado em mãos do executado.
```

**Conversão de arresto em penhora:**
```
Av.02 - CONVERSÃO DE ARRESTO EM PENHORA
Em 01/03/2016 (prenotação nº 123.456)
Conforme Mandado [...] procede-se a esta averbação para constar que o arresto
objeto do Av.01 foi convertido em penhora.
```

**Averbação de penhora:**
```
Av.01 - PENHORA
Em 01/03/2016 (prenotação nº 123.456)
Conforme Mandado expedido em 25/01/2016 [...] nos autos da Execução (proc.
nº 1234/2015), movida pelo BANCO CREDOR S/A [CNPJ] contra JOSÉ SILVA
[qualificação], o imóvel foi penhorado, tendo sido nomeado como depositário o
executado. (Valor da execução: R$1.000,00, atualizado até 25/01/2016)
```

**Averbação de sequestro:**
```
R.01 - SEQUESTRO DE BENS
Em 01/03/2016 (prenotação nº 123.456)
Conforme Mandado [...] o imóvel foi sequestrado e depositado em mãos do executado.
```

## Key Takeaways

1. Penhora não bloqueia a alienação — torna-a ineficaz perante o credor inscrito.
2. Com registro da penhora: fraude à execução é presumida (absoluta); sem registro: credor prova má-fé.
3. Requisitos do título de penhora: qualificação das partes, descrição do imóvel, valor, dados do processo.
4. Arresto → penhora: quando a execução se instaura, converte-se (averbação de conversão no RI).
5. Sequestro: sobre bem específico e determinado; depositário cuida até o final do processo.
6. Constrições anteriores não impedem registro de carta de arrematação/adjudicação — canceladas indiretamente.

## Connects To

- **Ch. 15** (Cartas de Arrematação): destino final da penhora quando o bem vai a leilão.
- **Ch. 17** (Averbação Premonitória): forma alternativa de publicizar execução antes da penhora.
- **STJ REsp 956.943/PR**: paradigma de fraude à execução com/sem registro de penhora.
- **CPC arts. 813, 831, 844**: regime de arresto e penhora.
- **LRP art. 239**: requisitos do mandado de sequestro.
