# Capítulo 2: Alienação Fiduciária

## Core Idea
Na alienação fiduciária imobiliária (Lei 9.514/97), o devedor transfere a propriedade resolúvel do imóvel ao credor como garantia, mantendo a posse direta; o inadimplemento aciona procedimento extrajudicial de consolidação e leilão — muito mais ágil que a hipoteca.

## Frameworks Introduzidos

- **Procedimento de Mora e Consolidação** (art. 26, Lei 9.514/97):
  1. Credor apresenta requerimento ao RI com: CPF/nome do devedor e cônjuge, endereços, prova de decurso do prazo de carência, demonstrativo do débito (sem antecipação de vencimento), CPF/nome do credor, comprovante de representação.
  2. RI prenotado, autuado como processo individual.
  3. Oficial expede intimação pessoal (via RTD, correio com AR "mão própria", ou por comparecimento espontâneo) para pagar em **15 dias improrrogáveis**.
  4. Se não encontrado: intimação por **edital** (3 dias em jornal de circulação local) ou **hora certa** (2 idas ao domicílio com suspeita de ocultação; admissível pelo item 253.1 Cap. XX NSCGJSP).
  5. Sem purgação: Oficial emite **Certidão de Transcurso de Prazo sem Purgação da Mora**.
  6. Credor consolida a propriedade mediante prova do pagamento do ITBI (e laudêmio, se enfiteuse) sobre o maior entre o valor declarado pelas partes e o valor venal.
  7. Prazo máximo de 120 dias para recolher o ITBI e consolidar; após isso, novo procedimento extrajudicial é necessário.

- **Leilão após Consolidação**:
  - 1º leilão: no prazo de 30 dias da averbação da consolidação; lance mínimo = valor de mercado.
  - 2º leilão: 15 dias após o 1º frustrado; lance mínimo = valor da dívida + despesas.
  - Se 2º leilão negativo: credor permanece com o imóvel, **dívida extinta** (art. 27, §§ 5º e 6º, Lei 9.514/97).
  - Superavit do leilão: credor deve entregar ao devedor em 5 dias (valor quitando a dívida e despesas).

- **Cessão de Crédito Fiduciário**: independe de anuência do devedor; exige averbação prévia na matrícula para substituição do credor/proprietário fiduciário. Exceção: CCI escritural — dispensa averbação (item 241, Cap. XX, NSCGJSP).

## Key Concepts

- **Fiduciante**: devedor; possuidor direto do bem; pode usar livremente o imóvel enquanto adimplente.
- **Fiduciário**: credor; proprietário resolúvel (propriedade fiduciária) e possuidor indireto.
- **Propriedade Resolúvel**: transferida ao credor com cláusula resolutiva — quitada a dívida, retorna automaticamente ao fiduciante.
- **Purgação da Mora**: pagamento integral da dívida vencida + despesas dentro dos 15 dias da intimação.
- **Consolidação da Propriedade**: averbação da propriedade plena em nome do fiduciário após inadimplemento definitivo.
- **Taxa de Ocupação** (art. 37-A): 1% ao mês sobre o valor do imóvel, devida pelo fiduciante após leilão até imissão na posse pelo credor/arrematante.
- **Portabilidade**: transferência de financiamento para outra instituição; averbada em ato único com instrumento do novo credor + quitação do anterior, dispensada assinatura do devedor na quitação.

## Mental Models

- **Prefira alienação fiduciária a hipoteca** quando quiser execução extrajudicial: todo o procedimento corre no RI, sem necessidade de ação judicial.
- **Intimação por edital é último recurso** — STJ exige tentativa real de localização do devedor; intimação por simples "avisos" no imóvel invalida a consolidação.
- **Fiduciante em mora não pode dispor do bem**: prenotado o requerimento de intimação, atos subsequentes (ex.: contrato de locação) ficam impedidos — *tempus regit actum* (CSM).
- **Laudêmio só é devido na consolidação**, não no registro da alienação fiduciária de imóvel enfitêutico.

## Anti-patterns

- **Incluir vencimento antecipado no demonstrativo de débito** → vedado expressamente; o RI não deve aceitar.
- **Notificação por edital sem diligências prévias de localização** → STJ invalida a consolidação (AgInt REsp 1363414/RS).
- **Não averbar a cessão de crédito antes de proceder ao procedimento de mora** → o novo credor não tem legitimidade para requerer a intimação.
- **Deixar escoar 120 dias após Certidão de Transcurso** sem consolidar → autos arquivados; necessário novo procedimento completo.

## Worked Example

**Fluxo completo de consolidação:**
```
1. R.01 — ALIENAÇÃO FIDUCIÁRIA registrada (José Silva → Banco Credor)
2. José Silva não paga após prazo de carência.
3. Banco Credor apresenta requerimento ao RI (CPF, endereços, demonstrativo).
4. RI prenotado → Oficial expede intimação via Sedex AR/MP para 3 endereços.
5. José Silva não responde em 15 dias.
6. Oficial emite: "Certidão de Transcurso de Prazo sem Purgação da Mora".
7. Banco Credor recolhe ITBI sobre o maior entre valor declarado e venal.
8. Av.03 — CONSOLIDAÇÃO DA PROPRIEDADE FIDUCIÁRIA
   (proprietário: Banco Credor; ITBI recolhido R$X; valor venal R$Y)
9. 30 dias: 1º leilão — lance mínimo = valor de mercado → frustrado.
10. 15 dias: 2º leilão — lance mínimo = dívida + despesas → frustrado.
11. Av.04 — LEILÕES NEGATIVOS + extinção da dívida (art. 27, §§ 5º-6º).
```

## Key Takeaways

1. Alienação fiduciária é garantia real com execução extrajudicial: tudo passa pelo RI, sem juiz.
2. Intimação pessoal do devedor é requisito de validade do procedimento — STJ não admite atalhos.
3. Cônjuge e terceiro garantidor devem ser intimados individualmente.
4. Purgação da mora é direito imrprogável de 15 dias; após, inicia-se consolidação.
5. Se 2º leilão for negativo, a dívida se extingue com a retenção do imóvel pelo credor.
6. Taxa de ocupação (1%/mês) é devida desde o leilão até a imissão efetiva na posse.
7. Cessão de crédito: averbar antes de qualquer procedimento extrajudicial; CCI escritural dispensa averbação.

## Connects To

- **Ch. 1** (Hipoteca): comparativo — hipoteca exige execução judicial; AF é extrajudicial.
- **Ch. 11** (Dação em Pagamento): fiduciante pode dar o imóvel em pagamento, com anuência do fiduciário, dispensando o leilão.
- **Ch. 13** (Enfiteuse): imóvel enfitêutico pode ser objeto de AF; laudêmio só é devido na consolidação.
- **Lei 9.514/97**: arts. 24, 26, 27, 37-A — regime completo da AF imobiliária.
- **NSCGJSP Cap. XX**, itens 241, 253.1: regras procedimentais do Estado de SP.
