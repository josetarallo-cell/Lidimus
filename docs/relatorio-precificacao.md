# Lidimus — Plano de Precificação e Modelo de Assinaturas

**Versão 1.0 · Julho/2026**
Base de cálculo: consumo real medido em ambiente de testes (611.935 tokens, 19 jobs jurídicos, câmbio US$1 = R$ 5,45).

---

## 1. Premissas de custo

### 1.1 Custo de IA por unidade de trabalho

> **Desatualizado desde 04/09/2026 nas duas linhas do Mistral.** Este relatório é um documento
> datado e as tabelas abaixo ficam como estavam; o que mudou está registrado logo após a tabela.

| Workflow | Modelo | Custo nominal | Grossed up (1,45x) |
|---|---|---|---|
| Análise de matrícula | Claude Sonnet 4.6 | R$ 0,91 | R$ 1,32 |
| Análise de matrícula (auxiliar) | Mistral Large | R$ 0,07 | R$ 0,10 |
| Croqui / memorial | Mistral Large | R$ 0,12 | R$ 0,18 |
| OCR | Google Document AI | não medido | R$ 0,15 |
| Render (DOCX/PDF), storage | — | R$ 0,10 | R$ 0,10 |

> **Atenção:** o painel mostra Document AI com 0 tokens. OCR é cobrado por **página**, não por token — o custo existe e está invisível. Uma matrícula de 10–20 páginas custa de US$ 0,015 (OCR básico) a US$ 0,30 (Layout/Form Parser).

**Revisão de 04/09/2026 — saída do Mistral.** A conta Mistral caiu para o tier gratuito (`mistral-large`
com 403 `tier_not_allowed` desde 01/09, `mistral-medium` com 429 desde 04/09), derrubando análises de
cliente. As duas etapas que usavam Mistral passaram para `claude-sonnet-5`. Medido contra a API real,
no mesmo câmbio (US$ 1 = R$ 5,45) e mesmo gross-up (1,45x):

| Workflow | Modelo | Custo nominal | Grossed up | Era |
|---|---|---|---|---|
| Análise de matrícula (auxiliar) | Claude Sonnet 5 | R$ 0,16 | **R$ 0,23** | R$ 0,10 |
| Croqui / memorial | Claude Sonnet 5 | R$ 0,28 | **R$ 0,40** | R$ 0,18 |

Amostras: matrícula de 7 páginas (9.812 tokens de entrada) para o auxiliar; croqui de 14 segmentos com
cache de prompt quente para o croqui. O croqui é o caso a observar — sozinho, a linha de IA passou o
**R$ 0,33 de planejamento** da unidade inteira em 1.2. Duas alavancas antes de mexer em preço: o
`effort` do nó (medido `low` = mesmo resultado nessa amostra, ~40% menos tokens de saída) e a franquia
do plano Croqui.

### 1.2 Custo variável consolidado

| Unidade | Cenário típico | Cenário pesado (p95) | **Planejamento** |
|---|---|---|---|
| **Análise de matrícula** | R$ 1,57 | R$ 6,50 | **R$ 3,00** |
| **Croqui / memorial** | R$ 0,33 | R$ 0,80 | **R$ 0,33** |

Cenário pesado = matrícula com cadeia dominial longa (30+ transmissões), muitas averbações, 40+ páginas.

### 1.3 Fator de gross-up sobre importação de IA

Fornecedores (Anthropic, Mistral, OpenAI, Google) faturam do exterior em USD.

| Tributo | Alíquota | Incide quando |
|---|---|---|
| IOF câmbio | 3,5% | Pagamento via cartão internacional |
| IOF câmbio (remessa) | 0,38% | Transferência bancária |
| PIS/COFINS-importação | 9,25% | Importação de serviço |
| ISS-importação (São Paulo) | 2% a 5% | Conforme enquadramento do serviço |
| IRRF sobre serviço técnico | 15% | Remessa caracterizada como serviço técnico |
| CIDE | 10% | Se caracterizar transferência de tecnologia |

**Fator adotado: 1,45x** sobre o custo nominal em dólar. É a média realista para PME pagando via cartão corporativo. Se a operação escalar e passar a remeter por contrato, o fator pode subir para 1,6x–1,8x.

### 1.4 Custos fixos mensais

| Item | R$/mês |
|---|---|
| VPS (Docker + n8n + Postgres + app) | 200–350 |
| Backup / object storage | 50 |
| Domínio, e-mail transacional, Sentry | 120 |
| Contabilidade especializada | 400–700 |
| **Total** | **R$ 900 – 1.200** |

### 1.5 Tributação sobre a receita

| Regime | Alíquota inicial | Condição |
|---|---|---|
| Simples — Anexo V | **15,5%** | Padrão para licenciamento/desenvolvimento de software |
| Simples — Anexo III | **6,0%** | Se fator R ≥ 28% (folha + pró-labore sobre faturamento) |
| Lucro Presumido | ~16–18% | PIS/COFINS 3,65% + IRPJ/CSLL ~7,68% + ISS 2–5% |

**Premissa do modelo: 16%.**

> **Alerta de médio prazo — Reforma Tributária (LC 214/2025).** CBS entra em 2027; IBS em transição de 2029 a 2032, plena em 2033. Alíquota-padrão estimada em ~26,5–28%. Serviços perdem na alíquota mas ganham crédito integral sobre insumos, incluindo a importação de IA. **Não construa um plano que só fecha a 15,5%.** Reavalie a tabela em 2027.

### 1.6 Gateway de pagamento

| Meio | Taxa | Recomendação |
|---|---|---|
| Stripe cartão BRL | 3,99% + R$ 0,39 | Usar para cartão internacional |
| PIX recorrente (Asaas/Pagar.me) | ~1,0% | **Meio preferencial** — economia de ~R$ 15/mês no ticket de R$ 497 |
| Boleto | R$ 2,50–3,50 fixo | Escritórios e enterprise |

**Premissa do modelo: 3,99% + R$ 0,39** (cenário conservador).

---

## 2. Tabela de planos

| Plano | Preço/mês | Matrículas | Croquis | Usuários | Recursos |
|---|---|---|---|---|---|
| **Croqui** | **R$ 29,90** | ❌ *(avulso a R$ 89)* | 20 | 1 | Croqui, memorial, export DOCX |
| **Essencial** | **R$ 197** | 5 | 40 | 1 | + Análise jurídica, cadeia dominial, relatório PDF |
| **Profissional** | **R$ 497** | 15 | Ilimitado | 3 | + Marca própria no relatório, Detector, histórico |
| **Escritório** | **R$ 1.297** | 50 | Ilimitado | 10 | + API, white-label, SLA, suporte prioritário |
| **Enterprise** | Sob contrato | Volume | Ilimitado | Custom | + SSO, integração, contrato anual, jurídico dedicado |

### 2.1 Excedentes

| Plano | Matrícula extra | Croqui extra |
|---|---|---|
| Croqui | R$ 89 *(avulso assinante)* | R$ 4,00 |
| Essencial | R$ 39 | — |
| Profissional | R$ 29 | — |
| Escritório | R$ 19 | — |
| **Não assinante** | **R$ 119** | — |

### 2.2 Planos anuais

Desconto de 2 meses (16,7%). Reduz churn e elimina 11 taxas fixas de gateway por ano.

| Plano | Mensal ×12 | **Anual** | Economia |
|---|---|---|---|
| Croqui | R$ 358,80 | **R$ 299** | R$ 59,80 |
| Essencial | R$ 2.364 | **R$ 1.970** | R$ 394 |
| Profissional | R$ 5.964 | **R$ 4.970** | R$ 994 |
| Escritório | R$ 15.564 | **R$ 12.970** | R$ 2.594 |

---

## 3. Análise de margem

### 3.1 Cenário típico (custo variável de planejamento)

| Plano | Receita | Impostos 16% | Gateway | Custo variável | **Margem** | **%** |
|---|---|---|---|---|---|---|
| Croqui | 29,90 | 4,78 | 1,58 | 6,60 | **16,94** | **57%** |
| Essencial | 197,00 | 31,52 | 8,25 | 28,20 | **129,03** | **65%** |
| Profissional | 497,00 | 79,52 | 20,22 | 55,00 | **342,26** | **69%** |
| Escritório | 1.297,00 | 207,52 | 52,14 | 170,00 | **867,34** | **67%** |

*Custo variável considera uso pleno da franquia. Consumo real médio tende a 60–70% da franquia, elevando a margem efetiva em 8–12 pontos.*

### 3.2 Cenário pesado (todas as unidades no p95)

| Plano | Custo variável | **Margem** | **%** |
|---|---|---|---|
| Croqui | 16,00 | **7,54** | **25%** ⚠️ |
| Essencial | 64,50 | **92,73** | **47%** |
| Profissional | 130,00 | **267,26** | **54%** |
| Escritório | 365,00 | **672,34** | **52%** |

⚠️ **O plano Croqui é o único que quebra no cenário pesado.** Ver mitigação em §5.

### 3.3 Margem do avulso

| Produto | Preço | Impostos | Gateway | Variável | **Margem** | **%** |
|---|---|---|---|---|---|---|
| Avulso público | 119,00 | 19,04 | 5,14 | 3,00 | **91,82** | **77%** |
| Avulso assinante | 89,00 | 14,24 | 3,94 | 3,00 | **67,82** | **76%** |
| Avulso assinante (p95) | 89,00 | 14,24 | 3,94 | 6,50 | **64,32** | **72%** |

**O avulso é o produto de maior margem percentual do catálogo.** É por isso que ele merece ser o motor do plano básico, não um acessório.

### 3.4 Break-even de custos fixos (R$ 1.100/mês)

| Mix | Clientes necessários |
|---|---|
| Só Croqui (sem avulso) | **65 clientes** |
| Só Croqui (com 1 avulso/mês em 30% da base) | **31 clientes** |
| Só Essencial | **9 clientes** |
| Só Profissional | **4 clientes** |
| Realista (40 Croqui + 5 Essencial + 2 Profissional) | **coberto com folga** |

---

## 4. Método de aplicação — Plano Croqui + Análise avulsa

Esta é a mecânica central do modelo. O plano de R$ 29,90 **não é um plano de receita — é um plano de aquisição.** A receita vem do avulso e da conversão.

### 4.1 Lógica do desenho

| Função | Como o plano cumpre |
|---|---|
| **Aquisição** | Preço baixo o suficiente para decisão sem aprovação orçamentária |
| **Ativação** | Croqui entrega valor imediato, sem depender da análise jurídica |
| **Monetização** | Avulso a R$ 89 com margem de 76% |
| **Qualificação** | Frequência de compra avulsa revela quem tem volume real |
| **Conversão** | Gatilho matemático empurra para Essencial no momento certo |

### 4.2 Mecânica de créditos

O assinante Croqui compra análises por **crédito pré-pago**, não por cobrança avulsa a cada uso. Isso reduz atrito, antecipa caixa e aumenta o ticket médio.

| Pacote | Preço | Por análise | Desconto | Validade |
|---|---|---|---|---|
| 1 crédito | R$ 89 | R$ 89,00 | 25% vs. público | 12 meses |
| 3 créditos | R$ 249 | R$ 83,00 | 30% | 12 meses |
| 5 créditos | R$ 379 | R$ 75,80 | 36% | 12 meses |
| 10 créditos | R$ 690 | R$ 69,00 | 42% | 12 meses |

**Margem dos pacotes (cenário típico):**

| Pacote | Receita | Impostos | Gateway | Variável | **Margem** | **%** |
|---|---|---|---|---|---|---|
| 3 créditos | 249 | 39,84 | 10,32 | 9,00 | **189,84** | **76%** |
| 5 créditos | 379 | 60,64 | 15,51 | 15,00 | **287,85** | **76%** |
| 10 créditos | 690 | 110,40 | 27,92 | 30,00 | **521,68** | **76%** |

A margem percentual se mantém estável em toda a escada de desconto — o desconto é financiado pelo volume, não pela margem.

**Regras:**

1. Crédito só pode ser comprado por assinante ativo. Cancelou, perde o saldo (avisar em 3 pontos: checkout, e-mail de confirmação, tela de cancelamento).
2. Crédito é consumido na **conclusão** da análise, nunca no envio. Falha de OCR ou matrícula ilegível não debita.
3. Reprocessamento da mesma matrícula em até 7 dias não debita novo crédito.
4. Saldo visível no header do app, sempre.

### 4.3 Gatilho de conversão para Essencial

O ponto de indiferença é matemático e deve ser exposto ao usuário.

| Cenário no mês | Custo total | Compare com Essencial |
|---|---|---|
| Croqui + 1 avulso | R$ 118,90 | Essencial R$ 197 — ainda vale ficar |
| **Croqui + 2 avulsos** | **R$ 207,90** | **Essencial R$ 197 — já compensa migrar** ✅ |
| Croqui + 3 avulsos | R$ 296,90 | Essencial economiza R$ 100 |
| Croqui + 5 avulsos | R$ 474,90 | Essencial economiza R$ 278 |

**Implementação do gatilho:**

| Momento | Ação do sistema |
|---|---|
| No checkout do **2º crédito** do mês | Banner: *"Com o plano Essencial você teria 5 análises por R$ 197 — R$ 10 a menos do que está gastando este mês."* Botão de upgrade em 1 clique. |
| Ao **esgotar** o saldo de créditos | Oferta dupla: recomprar pacote **ou** migrar para Essencial |
| **2 meses seguidos** com ≥2 avulsos | E-mail de upgrade com o cálculo personalizado do próprio consumo do cliente |
| Upgrade dentro do mesmo mês | Créditos não usados convertem em análises do Essencial (não expiram no upgrade) |

> **Regra de ouro:** o upgrade deve ser sempre financeiramente favorável ao cliente no momento em que é oferecido. Oferecer upgrade antes do ponto de indiferença queima confiança e aumenta churn.

### 4.4 Contenção de custo e suporte

Margem de R$ 16,94/mês não sustenta atendimento humano. Um ticket de 20 minutos consome 3 meses de margem daquele cliente.

| Regra | Especificação |
|---|---|
| **Cap de croquis** | 20/mês rígido. Extra a R$ 4,00, cobrado no ciclo seguinte |
| **Cap de páginas** | 15 páginas por croqui. Acima disso, exige crédito |
| **Cap de tokens por job** | Hard limit no n8n. Job que estourar aborta e devolve o crédito |
| **Suporte** | Zero-touch: base de conhecimento + FAQ + fila de e-mail com SLA de 72h. Sem chat, sem telefone |
| **Onboarding** | 100% self-service, tour guiado no app |
| **Suporte humano** | A partir do Essencial |

### 4.5 Posicionamento comercial

O maior risco do plano de R$ 29,90 é virar a âncora de preço da marca. O salto de R$ 29,90 para R$ 197 é 6,6x — quem ancorou em 29,90 percebe 197 como abusivo.

| Regra | Aplicação |
|---|---|
| **Nome** | "Lidimus Croqui" — nunca "Lidimus Básico". Não é uma versão inferior da plataforma, é outro produto |
| **Página** | Landing page própria, com CTA próprio |
| **Tabela de preços** | Não exibir na mesma grade comparativa dos planos de análise. Colocar abaixo, como "também oferecemos" |
| **Âncora visível** | A página principal abre com **Profissional destacado** e o avulso a R$ 119 como referência de valor unitário |
| **Comunicação do avulso** | Sempre como *benefício de assinante* (R$ 89 vs. R$ 119), nunca como *limitação do plano* |

### 4.6 Métricas de validação (medir desde o dia 1)

| Métrica | Meta | O que decide |
|---|---|---|
| **Taxa de attach** (% de assinantes Croqui que compram ≥1 avulso/mês) | > 30% | Se < 15%, o plano é só custo — descontinuar ou reposicionar |
| **Frequência de compra** (avulsos/mês por comprador) | > 1,5 | Se alta, criar degrau intermediário de R$ 97 |
| **Conversão Croqui → Essencial em 6 meses** | > 12% | Justifica o CAC do tier |
| **Churn mensal Croqui** | < 8% | Acima disso, empurrar anual com mais força |
| **CAC do tier Croqui** | < R$ 70 | LTV estimado ~R$ 210 (sem attach). Regra 1:3 |
| **Custo de suporte por cliente Croqui** | < R$ 3/mês | Acima disso, a margem evapora |
| **p50 e p95 de custo por análise** | p95 < R$ 6,50 | Valida ou invalida toda a tabela |

---

## 5. Degrau intermediário (condicional)

**Não lançar no dia 1.** Ativar somente se a métrica de frequência de compra ficar acima de 1,5 avulso/mês — sinal de que existe demanda represada entre R$ 29,90 e R$ 197.

| Plano | Preço | Conteúdo | Margem estimada |
|---|---|---|---|
| **Inicial** | R$ 97/mês | 20 croquis + 2 matrículas | R$ 71 (73%) |

Cobre exatamente o cliente que hoje paga R$ 207,90 (Croqui + 2 avulsos) e resiste ao Essencial.

---

## 6. Otimizações que melhoram a margem sem mexer no preço

Aplicar **antes** de publicar a tabela — mudam os números do modelo.

| Ação | Impacto estimado |
|---|---|
| **Prompt caching** (90% off no input em cache) | Os 345k tokens de input são majoritariamente system prompt repetido. Reduz o custo do Claude de R$ 17,37 para ~R$ 6 nos mesmos 19 jobs. **+5 a 8 pontos de margem** |
| **Batch API** (50% off) para análises não-interativas | +2 a 4 pontos |
| **Migrar cobrança para PIX recorrente** | +3 pontos no Croqui, +2,5 nos demais |
| **Fator R / Anexo III** (pró-labore ≥ 28% do faturamento) | Até **+9,5 pontos** de margem — a maior alavanca isolada da lista |
| **OCR básico em vez de Layout Parser** onde a estrutura permitir | +1 a 3 pontos |

---

## 7. Checklist pré-lançamento

- [ ] Instrumentar custo real do Google Document AI (por página, não por token)
- [ ] Rodar 100+ análises reais e apurar p50/p95 de custo por matrícula
- [ ] Implementar hard cap de tokens e páginas por job no n8n
- [ ] Levantar preço atual dos concorrentes (Matrícula Simples, Docket, Auket, CBRdoc) e posicionar a tabela em relação a eles
- [ ] Fechar regime tributário com contador — enquadramento CNAE, viabilidade do fator R, caracterização do serviço para ISS
- [ ] Validar tratamento tributário da importação de serviços de IA (cartão vs. contrato de remessa)
- [ ] Definir política de reembolso e cancelamento
- [ ] Construir base de conhecimento antes de abrir o tier Croqui
- [ ] Configurar telemetria das 7 métricas da §4.6
- [ ] Revisar a tabela inteira no 2º semestre de 2026, antes da entrada da CBS

---

## Ressalva

As alíquotas de Simples Nacional, ISS-São Paulo e do regime de importação de serviços têm nuances de enquadramento — CNAE, fator R, caracterização de serviço técnico versus licenciamento — que movem o resultado em vários pontos percentuais. Os números deste documento são premissas de planejamento, não apuração fiscal. Fechar o modelo com contador especializado em SaaS antes de publicar qualquer tabela.
