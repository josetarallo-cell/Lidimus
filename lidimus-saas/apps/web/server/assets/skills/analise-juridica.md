---
name: tradutor-matriculas-analise-juridica
description: "Analisa matrículas imobiliárias do workflow n8n tradutor-matriculas com parser temporal, classificador jurídico, motor de estado, regras determinísticas em Python, RAG legal, detector de riscos e saída JSON estruturada."
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

- linha do tempo dos atos;
- classes jurídicas padronizadas e classes adicionais detectadas;
- estado atual do imóvel;
- regras determinísticas em Python;
- fundamentação legal com RAG;
- detector de riscos e inconsistências;
- JSON final completo e compatível com os nós seguintes do n8n.

## Ordem de Execução

1. **Parser temporal**
   - Identifique atos em ordem cronológica.
   - Extraia data, tipo de ato, sequência, partes, valor, cancelamentos e referências cruzadas.
   - Produza uma `linha_tempo` com a evolução registral do imóvel.
   - A `linha_tempo` DEVE conter TODOS os atos do documento (ou todos os itens do array `ATOS DETECTADOS` quando o workflow o fornecer), na mesma ordem e quantidade. É proibido omitir ou amostrar atos.

2. **Classificador jurídico**
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

3. **Motor de estado**
   - Determine o estado atual do imóvel com base na linha do tempo.
   - Considere apenas atos ativos, cancelados, extintos ou substituídos.
   - Reflita o estado final em campos como `estado_atual`, `onus_ativos`, `restricoes_ativas`, `direitos_reais_ativos` e `cadeia_dominial_status`.
   - Transporte de ônus (ex.: "TRANSPORTE DE ÔNUS PENHORA") mantém o ônus ATIVO na nova matrícula até cancelamento expresso.
   - Cancelamento parcial (ex.: "fica CANCELADA a hipoteca indicada na Av-1 e a penhora indicada na Av-3 e Av-4") extingue SOMENTE os atos citados nominalmente; todos os demais gravames permanecem ativos.
   - Quando o workflow fornecer a lista `ÔNUS ATIVOS (DETERMINÍSTICO)`, ela é a fonte de verdade: `estado_atual.onus_ativos` deve conter exatamente essas sequências.
   - Adjudicação e arrematação são atos de TRANSFERENCIA dominial; o proprietário atual decorre do último ato de transferência, nunca da última averbação.

4. **Regras determinísticas em Python**
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

5. **RAG jurídico**
   - Consulte fontes legais nesta ordem de prioridade:
     1. Lei n. 6.015/1973 - Registros Públicos
     2. Lei n. 4.591/1964 - Incorporações Imobiliárias
     3. Lei n. 9.514/1997 - Alienação Fiduciária
     4. Lei n. 10.267/2001 - Georreferenciamento Rural, quando o imóvel for rural
     5. Normas da Corregedoria Geral da Justiça de São Paulo
   - Sempre que possível, cite artigo, inciso, item ou subitem.
   - Se a fonte não estiver confirmada, marque como `fundamentacao_pendente` em vez de inferir.

6. **Detector de riscos**
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
   - **Regra obrigatória:** quando `onus_ativos.length > 0`, o array `riscos` nunca pode ser vazio. Crie pelo menos uma entrada por tipo de gravame ativo (ex.: `penhora_ativa`, `arresto_ativo`, `hipoteca_ativa`). Quando `areas_destacadas` não for vazio, adicione risco `destacamento_sem_area_atualizada`.

7. **Gerador estruturado**
   - Entregue toda a análise em JSON válido.
   - Use nomes de campos estáveis e previsíveis.
   - Mantenha a saída pronta para consumo por outros nós do n8n.

## Formato de Saída Esperado

Retorne um objeto JSON único com as chaves abaixo. A resposta deve ser rica o bastante para alimentar o resumo jurídico, o template HTML e eventuais integrações futuras.

### Estrutura mínima obrigatória

- `documento`
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

### Definição dos blocos

- `documento`: metadados do arquivo analisado, como matrícula, cartório, endereço, datas e fonte OCR.
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

Os campos `onus` e `gravames` devem ser arrays de OBJETOS no formato `{tipo, ato_referencia, credor, valor, data, situacao}` — nunca strings soltas como `"penhora"`, que empobrecem o relatório final.

### Exemplo resumido

```json
{
   "documento": {
      "numero_matricula": "15.727",
      "cartorio": "1º CRI de São Paulo",
      "endereco": "..."
   },
   "linha_tempo": [
      {
         "sequencia": "R-1",
         "data": "12/03/1985",
         "tipo": "Compra e Venda",
         "classe": "TRANSFERENCIA",
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
         "regra": "hipoteca_ativa = bool(hipoteca and not cancelamento_hipoteca)",
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
         "tipo": "cadeia_dominial_quebrada",
         "severidade": "alta",
         "evidencia": "lacuna entre atos",
         "recomendacao": "validar matrícula anterior"
      }
   ],
   "resumo_executivo": {
      "classificacao_risco": "medio",
      "conclusao": "Imóvel com cadeia regular, porém sujeito a conferência documental.",
      "recomendacao": "Consultar certidão atualizada antes da transação."
   },
   "legacy_compatibility": {
      "cadeia_dominial": [],
      "proprietarios_atuais": [],
      "inconsistencias": [],
      "onus": [],
      "gravames": [],
      "possiveis_problemas": [],
      "classificacao_risco": "medio",
      "parecer_geral": "..."
   },
   "json_final": {}
}
```

## Regras de Qualidade

- Priorize determinismo quando a evidência documental for objetiva.
- Nunca use emolumentos, selos ou custas do rodapé da certidão como valor de um ato.
- Valores monetários sempre no formato brasileiro (1.234.567,89).
- O campo `documento.endereco` é o endereço do IMÓVEL objeto da matrícula, nunca o endereço do cartório.
- Separe fato extraído, inferência e conclusão jurídica.
- Não invente dados ausentes.
- Se houver conflito entre atos, reporte o conflito explicitamente.
- Se o documento for rural, reavalie georreferenciamento e consistência territorial.
- Se a análise encontrar incerteza alta, mantenha o risco visível no resultado final.
- Prefira arrays de objetos em vez de strings soltas quando a informação puder ser estruturada.
- Mantenha o bloco `legacy_compatibility` preenchido para integração com workflows antigos.

