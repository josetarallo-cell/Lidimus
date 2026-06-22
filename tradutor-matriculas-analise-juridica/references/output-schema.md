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
    "texto_origem": "string"
  },
  "linha_tempo": [
    {
      "sequencia": "string",
      "data": "string",
      "tipo": "string",
      "classe": "TRANSFERENCIA|GARANTIA|RESTRICAO|DIREITO_REAL|EXTINCAO|OUTRA",
      "partes": "string",
      "valor": "string|null",
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
  "estado_atual": {
    "propriedade": "string",
    "cadeia_dominial_status": "ok|quebrada|incompleta|indeterminada",
    "onus_ativos": ["string"],
    "restricoes_ativas": ["string"],
    "direitos_reais_ativos": ["string"],
    "proprietarios_atuais": ["string"]
  },
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
    "classificacao_risco": "baixo|medio|alto|critico|indeterminado",
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

## Observação prática

O workflow atual ainda consome campos legados para manter o template funcionando. Por isso, a resposta ideal deve trazer:

- estrutura nova completa para evolução futura;
- compatibilidade com os campos antigos do `Resumo Jurídico`;
- informações suficientes para geração de HTML sem reprocessamento.
