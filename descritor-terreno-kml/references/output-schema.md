# Output Schema — Descritor de Terreno KML

## JSON Structure (Definição Formal)

A resposta do modelo IA deve ser um objeto JSON válido com os seguintes campos:

```json
{
  "memorial_descritivo": {
    "type": "string",
    "description": "Texto do memorial descritivo completo, formatado conforme Lei 6.015/1973 e Lei 10.267/2001. Pode conter múltiplas linhas (\\n). Deve incluir cabeçalho, vértices, segmentos, área, perímetro, datum e encerramento legal.",
    "example": "TERRENO LOCALIZADO NO MUNICÍPIO DE SÃO PAULO, ESTADO DE SÃO PAULO...\n\nVÉRTICES:\nVértice P-01, de coordenadas UTM 345.678,90 E / 7.654.321,05 N..."
  },
  "descricao_perimetro": {
    "type": "string",
    "description": "Apenas o parágrafo narrativo contínuo do perímetro (mesmo conteúdo do item 'Descrição do Perímetro' dentro de memorial_descritivo), sem cabeçalho, vértices ou resumo geométrico. Usado para exibição isolada em destaque na interface.",
    "example": "Inicia-se a descrição deste perímetro no vértice P-01, de coordenadas UTM E 345.678,90 e N 7.654.321,05..."
  },
  "area_m2": {
    "type": "number",
    "description": "Área total do terreno em metros quadrados (m²). Deve ser um número positivo.",
    "example": 1500.75
  },
  "perimetro_m": {
    "type": "number",
    "description": "Perímetro total do terreno em metros (m). Deve ser um número positivo.",
    "example": 200.50
  },
  "vertices": {
    "type": "array",
    "description": "Array de vértices do polígono, em ordem sequencial (P-01, P-02, ..., P-N).",
    "items": {
      "type": "object",
      "properties": {
        "label": {
          "type": "string",
          "description": "Rótulo do vértice em formato P-NN (ex.: P-01, P-02, P-15).",
          "example": "P-01"
        },
        "utm_e": {
          "type": "number",
          "description": "Coordenada UTM Leste (E — Easting) do vértice, em metros. Pode conter até 2 casas decimais.",
          "example": 345678.90
        },
        "utm_n": {
          "type": "number",
          "description": "Coordenada UTM Norte (N — Northing) do vértice, em metros. Pode conter até 2 casas decimais.",
          "example": 7654321.05
        },
        "lat": {
          "type": "number",
          "description": "Latitude WGS84 do vértice em graus decimais (negativo = sul).",
          "example": -23.5505
        },
        "lon": {
          "type": "number",
          "description": "Longitude WGS84 do vértice em graus decimais (negativo = oeste).",
          "example": -46.6333
        }
      },
      "required": ["label", "utm_e", "utm_n", "lat", "lon"]
    },
    "example": [
      { "label": "P-01", "utm_e": 345678.90, "utm_n": 7654321.05, "lat": -23.5505, "lon": -46.6333 },
      { "label": "P-02", "utm_e": 345829.40, "utm_n": 7654321.05, "lat": -23.5505, "lon": -46.6318 }
    ]
  },
  "segmentos": {
    "type": "array",
    "description": "Array de segmentos (lados) do polígono, em ordem sequencial. Cada segmento conecta dois vértices consecutivos.",
    "items": {
      "type": "object",
      "properties": {
        "de": {
          "type": "string",
          "description": "Rótulo do vértice inicial do segmento (ex.: P-01).",
          "example": "P-01"
        },
        "ate": {
          "type": "string",
          "description": "Rótulo do vértice final do segmento (ex.: P-02).",
          "example": "P-02"
        },
        "azimute": {
          "type": "string",
          "description": "Azimute geodésico do segmento em formato sexagesimal DD°MM'SS\" (graus-minutos-segundos). Não use decimais.",
          "example": "083°06'19\"",
          "pattern": "^\\d{2,3}°\\d{2}'\\d{2}\"$"
        },
        "distancia_m": {
          "type": "number",
          "description": "Distância plana do segmento em metros, com até 2 casas decimais.",
          "example": 150.50
        },
        "confrontante": {
          "type": "string",
          "description": "Descrição do confrontante (propriedade vizinha, via pública, acidente geográfico). Se desconhecido, pode ser vazio ou 'conforme coordenadas'.",
          "example": "Rua Principal (lado esquerdo)"
        }
      },
      "required": ["de", "ate", "azimute", "distancia_m", "confrontante"]
    },
    "example": [
      { "de": "P-01", "ate": "P-02", "azimute": "083°06'19\"", "distancia_m": 150.50, "confrontante": "Rua Principal (lado esquerdo)" },
      { "de": "P-02", "ate": "P-03", "azimute": "173°15'45\"", "distancia_m": 200.00, "confrontante": "Propriedade de José Silva (fundo)" }
    ]
  },
  "datum": {
    "type": "string",
    "description": "Datum de referência das coordenadas. Deve ser 'SIRGAS 2000' (Lei 10.267/2001).",
    "enum": ["SIRGAS 2000"],
    "example": "SIRGAS 2000"
  },
  "fuso_utm": {
    "type": "string",
    "description": "Identificação do fuso UTM em formato 'XXS' ou 'XXN' (ex.: 22S, 23N). Os fusos brasileiros variam de 18S a 25S.",
    "example": "22S",
    "pattern": "^(1[89]|2[0-5])[NS]$"
  }
}
```

## Restrições e Validações

| Campo | Restrição | Notas |
|-------|-----------|-------|
| `memorial_descritivo` | Não-vazio, máximo 10.000 caracteres | Pode conter quebras de linha (`\n`). Deve respeitar estrutura legal obrigatória. |
| `area_m2` | Número positivo, ≥ 1 | Deve corresponder ao cálculo geométrico dos vértices. |
| `perimetro_m` | Número positivo, ≥ 1 | Deve ser a soma de todas as distâncias dos segmentos. |
| `vertices[].label` | String, formato P-NN onde NN ≥ 01 | Sequencial, sem omissões. Exemplo: P-01, P-02, ..., P-N |
| `vertices[].utm_e` | Número, típicamente 200.000 — 900.000 (depende fuso) | Coordenada Leste em metros. |
| `vertices[].utm_n` | Número, típicamente 0 — 10.000.000 | Coordenada Norte em metros. |
| `vertices[].lat` | Número, -90 ≤ lat ≤ 90 | Graus decimais. Brasil: -33 ≤ lat ≤ 5. |
| `vertices[].lon` | Número, -180 ≤ lon ≤ 180 | Graus decimais. Brasil: -74 ≤ lon ≤ -28. |
| `segmentos[].azimute` | String, formato DD°MM'SS" ou DDD°MM'SS" | 0° ≤ azimute < 360°. Separadores obrigatórios: ° (grau U+00B0), ' (apóstrofo), " (aspas duplas). |
| `segmentos[].distancia_m` | Número positivo | Até 2 casas decimais. Deve ser não-zero. |
| `segmentos[].confrontante` | String, até 200 caracteres | Pode ser vazio se desconhecido. Sem formatação especial obrigatória. |
| `datum` | Exatamente "SIRGAS 2000" | Obrigatório por Lei 10.267/2001 para imóveis em Brasil. |
| `fuso_utm` | String, padrão XXS ou XXN | Brasil: válidos 18S, 19S, ..., 25S. Fusos de 18N e 19N são usados em territórios ultramarinos. |

## Consistência Geométrica (Verificações Recomendadas)

Após receber a resposta JSON, o workflow deve validar:

1. **Número de vértices vs. segmentos:** `len(segmentos) == len(vertices)` (polígono fechado)
2. **Sequência de rótulos:** P-01, P-02, ..., P-N sem omissões; última diferencia de P-01 por N-1
3. **Continuidade de segmentos:** cada segmento `[i].ate` deve igualar `segmentos[i+1].de`
4. **Coerência de área:** se houver cálculo geométrico anterior, verificar se `area_m2` bate (tolerância: ±1%)
5. **Coerência de perímetro:** soma de `distancia_m` deve igualar `perimetro_m` (tolerância: ±0,5%)
6. **Datum e fuso:** campo `datum` deve ser "SIRGAS 2000"; `fuso_utm` deve ser válido para Brasil

## Exemplo Completo de Saída

```json
{
  "memorial_descritivo": "IMÓVEL LOCALIZADO NO MUNICÍPIO DE SÃO PAULO, ESTADO DE SÃO PAULO, DESCRITO CONFORME SEGUE:\n\nVÉRTICES:\nVértice P-01, de coordenadas UTM 345.678,90 E / 7.654.321,05 N, marco de concreto existente na intersecção da Rua Principal com a Rua Secundária.\nVértice P-02, de coordenadas UTM 345.829,40 E / 7.654.321,05 N, ponto de mudança de alinhamento na Rua Principal.\nVértice P-03, de coordenadas UTM 345.829,40 E / 7.654.170,55 N, marco de concreto existente na esquina da Rua Principal com a Rua Lateral.\nVértice P-04, de coordenadas UTM 345.678,90 E / 7.654.170,55 N, ponto de mudança de alinhamento na Rua Lateral.\n\nSEGMENTOS:\nSegmento de P-01 a P-02, com azimute de 083°06'19\", distância de 150,50 metros, confrontando com Rua Principal (lado esquerdo).\nSegmento de P-02 a P-03, com azimute de 173°15'45\", distância de 150,50 metros, confrontando com propriedade de José Silva (fundo).\nSegmento de P-03 a P-04, com azimute de 263°06'19\", distância de 150,50 metros, confrontando com Rua Lateral (lado direito).\nSegmento de P-04 a P-01, com azimute de 353°15'45\", distância de 150,50 metros, confrontando com propriedade de Maria Santos (frente).\n\nRESUMO GEOMÉTRICO:\nÁrea total: 22.650,25 m²\nPerímetro total: 602,00 m\nNúmero de vértices: 4\n\nDatum SIRGAS 2000, Fuso 22S, conforme Lei 6.015/1973, artigo 176, parágrafo 1º, inciso II, item 3, e Lei 10.267/2001, artigo 3º.",
  "area_m2": 22650.25,
  "perimetro_m": 602.00,
  "vertices": [
    { "label": "P-01", "utm_e": 345678.90, "utm_n": 7654321.05, "lat": -23.5505, "lon": -46.6333 },
    { "label": "P-02", "utm_e": 345829.40, "utm_n": 7654321.05, "lat": -23.5505, "lon": -46.6318 },
    { "label": "P-03", "utm_e": 345829.40, "utm_n": 7654170.55, "lat": -23.5520, "lon": -46.6318 },
    { "label": "P-04", "utm_e": 345678.90, "utm_n": 7654170.55, "lat": -23.5520, "lon": -46.6333 }
  ],
  "segmentos": [
    { "de": "P-01", "ate": "P-02", "azimute": "083°06'19\"", "distancia_m": 150.50, "confrontante": "Rua Principal (lado esquerdo)" },
    { "de": "P-02", "ate": "P-03", "azimute": "173°15'45\"", "distancia_m": 150.50, "confrontante": "Propriedade de José Silva (fundo)" },
    { "de": "P-03", "ate": "P-04", "azimute": "263°06'19\"", "distancia_m": 150.50, "confrontante": "Rua Lateral (lado direito)" },
    { "de": "P-04", "ate": "P-01", "azimute": "353°15'45\"", "distancia_m": 150.50, "confrontante": "Propriedade de Maria Santos (frente)" }
  ],
  "datum": "SIRGAS 2000",
  "fuso_utm": "22S"
}
```
