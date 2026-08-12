# Schema de Saída da Skill `tradutor-matriculas-analise-juridica`

Este documento descreve a estrutura esperada da resposta JSON para uso pelo workflow `tradutor-matriculas`.

## Estrutura recomendada

```json
{
  "documento": {
    "numero_matricula": "string",
    "cartorio": "string",
    "data_abertura": "string",
    "livro_folha": "string",
    "matricula_anterior": "string",
    "endereco": "string",
    "sql_iptu": "string",
    "texto_origem": "string",
    "certidao_posterior_a": "string|null"
  },
  "integridade": {
    "completo": true,
    "paginas_lidas": 0,
    "paginas_declaradas": 0,
    "atos_faltantes": ["string"],
    "cabecalhos_ilegiveis": ["string"],
    "causa_provavel": "paginas_ausentes|falha_de_leitura|null",
    "fichas_faltantes": ["string"],
    "motivos": ["string"],
    "cadeia_anterior_nao_examinada": false
  },
  "origem": {
    "matricula_anterior": "string|null",
    "ato_anterior": "string|null",
    "data_registro_anterior": "string|null",
    "referencias_externas": [{ "ato": "string", "matricula": "string" }],
    "cobertura_desde": "string|null",
    "examinada": false
  },
  "escopo_e_limites": {
    "periodo_examinado": "string",
    "base_documental": "string",
    "fora_do_escopo": ["string"]
  },
  "diligencias_recomendadas": [
    {
      "item": "string",
      "motivo": "string",
      "prioridade": "alta|media|baixa"
    }
  ],
  "modo_analise": "completa|dados_organizados",
  "aviso_matricula_incompleta": "string|null",
  "linha_tempo": [
    {
      "sequencia": "string",
      "data": "string",
      "data_titulo": "string|null",
      "data_prenotacao": "string|null",
      "tipo": "string",
      "classe": "TRANSFERENCIA|GARANTIA|RESTRICAO|DIREITO_REAL|EXTINCAO|OUTRA",
      "partes": "string",
      "valor": "string|null",
      "moeda": "string|null",
      "ano_valor": "number|null",
      "valor_display": "string|null",
      "status": "ativo|cancelado|extinto|pendente",
      "observacoes": "string|null"
    }
  ],
  "classes_juridicas": [
    {
      "classe": "string",
      "tipo": "string",
      "evidencia": "string",
      "confianca": "alta|media|baixa"
    }
  ],
  "outras_classes_detectadas": ["string"],
  "confrontantes_descricao": [
    {
      "lado": "string",
      "confrontante": "string"
    }
  ],
  "estado_atual": {
    "propriedade": "string",
    "cadeia_dominial_status": "ok|quebrada|incompleta|indeterminada|indeterminada_documento_incompleto|atual_integra_origem_nao_examinada",
    "onus_ativos": ["string"],
    "restricoes_ativas": ["string"],
    "direitos_reais_ativos": ["string"]
  },
  "proprietarios_atuais": [
    {
      "nome": "string",
      "documento_tipo": "CPF|CNPJ|null",
      "documento_numero": "string|null",
      "qualificacao": "string|null",
      "estado_civil": "string|null",
      "regime_bens": "string|null",
      "endereco_domicilio": "string|null",
      "ato_aquisitivo": "string|null",
      "data_aquisicao": "string|null",
      "percentual": "string|null",
      "observacao": "string|null"
    }
  ],
  "proprietario_indicado": {
    "nome": "string",
    "documento_tipo": "CPF|CNPJ|null",
    "documento_numero": "string|null",
    "fonte": "string",
    "titulo_aquisitivo_lido": false,
    "observacao": "string|null"
  },
  "promissarios_cessionarios": [
    {
      "nome": "string",
      "documento_tipo": "CPF|CNPJ|null",
      "documento_numero": "string|null",
      "natureza": "string",
      "ato_aquisitivo": "string|null",
      "observacao": "string|null"
    }
  ],
  "regras_deterministicas": [
    {
      "regra": "string",
      "condicao": "string",
      "resultado": true,
      "evidencia": "string|null"
    }
  ],
  "fundamentacao_legal": [
    {
      "fonte": "string",
      "referencia": "string",
      "aplicacao": "string",
      "trecho": "string|null"
    }
  ],
  "riscos": [
    {
      "tipo": "string",
      "severidade": "baixa|media|alta|critica",
      "evidencia": "string",
      "impacto": "string",
      "recomendacao": "string"
    }
  ],
  "resumo_executivo": {
    "classificacao_risco": "baixo|medio|alto|critico|indeterminado|nao_aplicavel",
    "conclusao": "string",
    "recomendacao": "string"
  },
  "legacy_compatibility": {
    "cadeia_dominial": [],
    "proprietarios_atuais": [],
    "riscos": [],
    "inconsistencias": [],
    "onus": [],
    "gravames": [],
    "possiveis_problemas": [],
    "classificacao_risco": "string",
    "parecer_geral": "string"
  },
  "json_final": {}
}
```

## Invariantes que o workflow verifica

O nó `Resumo Jurídico` valida a saída antes de montar o laudo. Violar qualquer
um destes pontos faz o pipeline sobrescrever o que você devolveu:

1. **`modo_analise: "dados_organizados"` exige `classificacao_risco:
   "nao_aplicavel"`** e `aviso_matricula_incompleta` preenchido. `riscos` fica
   vazio; as lacunas vão para `inconsistencias`.
2. **Origem não examinada não aciona esse modo.** Com `integridade.completo:
   true`, a existência de `origem.matricula_anterior` não autoriza
   `dados_organizados`, `nao_aplicavel` nem `aviso_matricula_incompleta`. A
   limitação vai para `escopo_e_limites` e `diligencias_recomendadas`, e o
   status é `atual_integra_origem_nao_examinada`. Devolver `nao_aplicavel` com
   documento íntegro faz o nó `Resumo Jurídico` elevar para `indeterminado` e
   registrar a coerção.
3. **Coerência de nível.** Indisponibilidade ativa força `critico`; penhora ou
   arresto ativo força no mínimo `alto`; risco de severidade `critica` força
   `critico`. Texto com "impeditiv"/"crítica" e classificação abaixo de `critico`
   é contradição — o pipeline eleva a classificação.
4. **Rótulo de booleano na forma afirmativa.** Regras cujo nome contenha `not`,
   `nao_`, `sem_` combinadas com negação na condição são descartadas.
5. **Valor sem moeda inferida.** Quando `moeda` estiver ausente e o documento não
   for em real corrente, o valor é exibido sem símbolo, nunca com `R$`.
6. **Confrontação cardeal sem rumo escrito é descartada** — sobrevive apenas em
   `confrontantes_descricao`.
7. **Termos de andaime interno** (manual, cheatsheet, patterns, anti-patterns,
   key concepts, frameworks, skill, prompt, RAG, workflow, parser, pipeline) são
   removidos de todo campo de texto antes da renderização.

## Observação prática

O workflow atual ainda consome campos legados para manter o template funcionando. Por isso, a resposta ideal deve trazer:

- estrutura nova completa para evolução futura;
- compatibilidade com os campos antigos do `Resumo Jurídico`;
- informações suficientes para geração de HTML sem reprocessamento.
