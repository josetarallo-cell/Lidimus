# API pública v1

API para integrar o Lidimus a outro sistema — ERP do escritório, portal, script de
lote. Cobre a **análise de matrícula**: enviar o PDF (um ou até dez de uma vez) e
buscar o resultado.

Disponível nos planos **Escritório** e **Enterprise**.

---

## 1. Autenticação

Chave de integração no cabeçalho `Authorization`:

```
Authorization: Bearer ldm_live_...
```

- A chave é **da organização**, não de uma pessoa. Pode ser compartilhada com a
  equipe e com o TI do cliente.
- **Toda análise enviada por ela debita créditos do plano da organização**, igual
  às feitas no painel. Quem tem a chave gasta esse saldo.
- Só o **proprietário** da conta emite chave, em Conta → API ou pelo script
  (§7). Nem `member` nem `reader` emitem.
- Validade de 365 dias. Revogação em Conta → API tem efeito na chamada seguinte.
- Máximo de 5 chaves ativas por organização.
- O token aparece **uma única vez**, na emissão. O banco guarda apenas o
  SHA-256 — não existe "ver a chave de novo".

### O plano é revalidado a cada requisição

A chave identifica; o plano autoriza. Rebaixar o plano, cancelar a assinatura ou
perder a flag `features.api` corta a API na **próxima chamada**, sem precisar
revogar chave nenhuma. É por isso que uma chave não é um passe permanente.

### O que a chave não abre

Nada além de `/api/v1/*`. As rotas de sessão (painel, equipe, assinatura, Stripe)
não aceitam chave, e a v1 não aceita cookie de sessão. Uma chave vazada não vira
acesso à conta — e, como nenhuma requisição de navegador se autentica sozinha na
v1, não existe superfície de CSRF nela.

HTTPS é obrigatório em produção: chamada em `http://` recebe `400
tls_obrigatorio`. Se isso acontecer, considere a chave comprometida e revogue-a.

---

## 2. `POST /api/v1/matriculas`

Envia uma matrícula para análise. `multipart/form-data`:

| Campo | Obrigatório | Descrição |
|---|---|---|
| `file` | sim | PDF da matrícula. Assinatura do arquivo é validada; limite em `MAX_UPLOAD_SIZE_MB` (50 por padrão). |
| `params` | não | JSON: `incluirMemorial` (padrão `true`), `incluirCroqui` (`false`), `geocodificar` (`true`). |

```bash
curl -X POST https://SEU_DOMINIO/api/v1/matriculas \
  -H "Authorization: Bearer $LIDIMUS_API_KEY" \
  -F "file=@matricula.pdf" \
  -F 'params={"incluirMemorial":true,"geocodificar":true}'
```

`202 Accepted`:

```json
{
  "id": "2c7e4e0b-61be-4d8d-9087-e24c27bf3c44",
  "status": "queued",
  "paginas": 1,
  "custoCreditos": 91,
  "saldoRestante": 47380
}
```

`custoCreditos` e `saldoRestante` aparecem **só aqui**: é o único momento em que
se sabe exatamente o que foi cobrado. Análise que falha tem o crédito estornado,
então "custo" de uma análise concluída seria ambíguo.

Custo: `83 + 8 × páginas` créditos.

---

## 3. `POST /api/v1/matriculas/lote`

Até **10 matrículas** numa requisição só (`MAX_BATCH_FILES`; o lote inteiro não
passa de `MAX_BATCH_TOTAL_MB`, 120 por padrão). Repita o campo `file` uma vez por
PDF; `params` é único e vale para todos.

**Não existe para poupar requisições** — um laço sobre §2 já cabe no teto de
120/hora. Existe pela garantia de cobrança: os N arquivos são validados e
debitados numa transação só, sob o mesmo lock de saldo. **Ou todas entram, ou
nenhuma entra e nada é cobrado.**

No laço, quem fica sem saldo no sétimo PDF termina com seis análises pagas, uma
recusada e três nunca enviadas — e precisa descobrir sozinho onde parou. Aqui o
402 chega antes de qualquer débito, com o custo do lote inteiro na mensagem.

```bash
curl -X POST https://SEU_DOMINIO/api/v1/matriculas/lote \
  -H "Authorization: Bearer $LIDIMUS_API_KEY" \
  -F "file=@matricula-1.pdf" \
  -F "file=@matricula-2.pdf" \
  -F "file=@matricula-3.pdf" \
  -F 'params={"incluirMemorial":true}'
```

`202 Accepted`:

```json
{
  "loteId": "2229b828-3fb6-42eb-978c-e0155f80b165",
  "itens": [
    { "id": "3b47e5b7-...", "status": "queued", "arquivo": "matricula-1.pdf", "paginas": 1, "custoCreditos": 91 },
    { "id": "295e3ede-...", "status": "queued", "arquivo": "matricula-2.pdf", "paginas": 4, "custoCreditos": 115 },
    { "id": "7fa76816-...", "status": "queued", "arquivo": "matricula-3.pdf", "paginas": 2, "custoCreditos": 99 }
  ],
  "custoTotal": 305,
  "saldoRestante": 46885
}
```

Cada item vira uma análise independente: acompanhe pelo `id` em §4, ou o lote
inteiro com `GET /api/v1/matriculas?lote={loteId}` (§5). **Depois do 202, o lote
deixa de ser atômico** — uma análise que falhar tem só o próprio crédito
estornado, sem afetar as outras. A atomicidade é da admissão, não do
processamento.

### O que recusa o lote inteiro

| HTTP | `codigo` | Quando |
|---|---|---|
| 400 | `requisicao_invalida` | Mais de `MAX_BATCH_FILES` arquivos, ou `params` malformado. |
| 415 | `arquivo_invalido` | Um ou mais arquivos não são PDF ou passam de `MAX_UPLOAD_SIZE_MB`. **A mensagem lista quais e por quê**, para você corrigir todos de uma vez em vez de um por tentativa. |
| 402 | `creditos_insuficientes` | O total do lote passa do saldo. Nenhuma análise criada. |
| 403 | `sem_acesso_a_ferramenta` | Sem plano, ou lote maior que o número de análises avulsas disponíveis. |
| 413 | `arquivo_grande_demais` | O lote somado passa de `MAX_BATCH_TOTAL_MB`. |
| 429 | `limite_de_uso` | O lote não cabe no que resta do teto por hora. **Nenhum token é consumido** — a mensagem diz quantas vagas restam. |

Um lote consome tantas vagas do teto por hora quanto tem arquivos: 10 matrículas
custam 10, não 1.

---

## 4. `GET /api/v1/matriculas/{id}`

Estado e resultado. É o endpoint de polling — uma matrícula percorre
`ocr → juridico → doc` e leva minutos. **Consulte a cada 10–30 segundos.**

```bash
curl https://SEU_DOMINIO/api/v1/matriculas/$ID \
  -H "Authorization: Bearer $LIDIMUS_API_KEY"
```

```json
{
  "id": "2c7e4e0b-...",
  "status": "done",
  "etapa": "doc",
  "arquivo": "matricula.pdf",
  "paginas": 1,
  "lote": null,
  "criadoEm": "2026-07-30T00:12:51.291Z",
  "concluidoEm": "2026-07-30T00:15:37.356Z",
  "erro": null,
  "resultado": { "numero_matricula": "...", "cartorio": "...", "resumo_juridico": {} }
}
```

| `status` | Significado |
|---|---|
| `queued` | Na fila. |
| `processing` | Em andamento; `etapa` diz onde (`ocr`, `juridico`, `doc`). |
| `done` | Concluída. `resultado` preenchido. |
| `error` | Falhou. `erro` preenchido e **o crédito foi estornado**. |

`erro` e `resultado` são mutuamente exclusivos; enquanto processa, os dois são
nulos. `etapa` serve para mostrar progresso — não ramifique lógica nela. `lote`
traz o `loteId` quando a análise veio de um envio em lote (§3), e `null` quando
veio do envio unitário.

---

## 5. `GET /api/v1/matriculas`

Análises da organização, da mais recente para a mais antiga. **Não traz
`resultado`** — vinte resultados de matrícula por página seriam megabytes; para o
conteúdo, peça a análise pelo id.

| Parâmetro | Descrição |
|---|---|
| `limite` | 1 a 100 (padrão 20). |
| `status` | `queued`, `processing`, `done` ou `error`. |
| `cursor` | Valor de `proximoCursor` da resposta anterior. |
| `lote` | `loteId` devolvido por §3. Restringe a listagem àquele envio — é como acompanhar um lote inteiro com uma chamada, em vez de uma por análise. |

```json
{ "itens": [ { "id": "...", "status": "done" } ], "proximoCursor": "MjAyNi0w..." }
```

Paginação por cursor, e não por offset, porque a lista cresce pela frente
justamente enquanto o cliente pagina — offset repetiria e pularia registros. O
cursor é opaco: devolva-o como veio. `proximoCursor: null` é o fim.

---

## 6. Erros

Sempre no mesmo formato. Ramifique no **`codigo`**; a `mensagem` é para o humano
que lê o log e pode mudar de versão para versão.

```json
{ "erro": { "codigo": "creditos_insuficientes", "mensagem": "Créditos insuficientes. Saldo: 40, necessário: 91 (1 página)." } }
```

| HTTP | `codigo` | Quando |
|---|---|---|
| 400 | `tls_obrigatorio` | Chamada em `http://` em produção. |
| 400 | `requisicao_invalida` | Corpo, `params` ou cursor malformados. |
| 400 | `arquivo_invalido` | `file` ausente. |
| 415 | `arquivo_invalido` | `file` presente, mas não é um PDF (a assinatura do arquivo é conferida, não o `Content-Type` declarado). Até jul/2026 este caso respondia `500 erro_interno` — erro do cliente apresentado como falha nossa. |
| 401 | `credencial_invalida` | Chave ausente, desconhecida, revogada ou expirada — **um código só**, de propósito: distinguir os casos confirmaria a quem sonda que o token em mãos existe. O motivo real aparece em Conta → API. |
| 402 | `creditos_insuficientes` | Saldo abaixo do custo. Nenhuma análise é criada. |
| 403 | `plano_sem_api` | O plano da organização não inclui a API. |
| 403 | `chave_orfa` | Quem emitiu a chave não é mais membro da organização. O proprietário emite outra. |
| 403 | `sem_acesso_a_ferramenta` | A matrícula não está no plano. |
| 404 | `nao_encontrado` | Id inexistente **ou de outra organização** — nunca 403, que confirmaria a existência. |
| 413 | `arquivo_grande_demais` | Acima de `MAX_UPLOAD_SIZE_MB`. |
| 429 | `limite_de_uso` | Teto por hora, ou tentativas de autenticação recusadas. |
| 5xx | `erro_interno` | Falha nossa. A mensagem é genérica de propósito. |

### Limites por hora

- **120 análises por organização** (`API_RATE_LIMIT_PER_HOUR`), separado do teto
  do painel (60) porque integração de lote submete mais que gente clicando.
- **120 por chave**, com o mesmo teto. Existe para isolar o culpado quando a
  chave está compartilhada: o script descontrolado de um integrante não derruba a
  integração dos outros.
- **20 falhas de autenticação por IP a cada 5 minutos.** Só conta falhas —
  integração saudável nunca encosta nele.

Os dois primeiros contam **por análise, não por requisição**: um lote de 10
consome 10 vagas. E a checagem acontece antes de incrementar — lote recusado por
429 não gasta as vagas que não chegou a usar.

---

## 7. Emitir chave pelo terminal

Para onboarding de Enterprise e para o suporte, sem pedir a senha de ninguém:

```powershell
pnpm chave:api --org <uuid> --nome "ERP do cartório"
pnpm chave:api --org <uuid> --listar
pnpm chave:api --revogar ldm_live_a1b2c3d4
```

O script **não é atalho para as regras**: importa o mesmo `planoLiberaApi` que a
API usa e recusa organização cujo plano não inclui a API; sempre emite no nome do
proprietário (não existe `--usuario`); e respeita o teto de 5 ativas.

`--revogar` aceita só o **prefixo**, nunca o token — linha de comando vai para o
histórico do shell. O script imprime em qual banco está agindo antes de escrever,
porque o `.env` local aponta para produção (ver `10-ambiente-local.md`).

---

## 8. Exemplo completo

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE=https://SEU_DOMINIO

ID=$(curl -sf -X POST "$BASE/api/v1/matriculas" \
  -H "Authorization: Bearer $LIDIMUS_API_KEY" \
  -F "file=@matricula.pdf" | jq -r .id)

echo "análise $ID enviada"

while :; do
  R=$(curl -sf "$BASE/api/v1/matriculas/$ID" -H "Authorization: Bearer $LIDIMUS_API_KEY")
  case $(jq -r .status <<<"$R") in
    done)  jq .resultado <<<"$R"; break ;;
    error) jq -r .erro <<<"$R" >&2; exit 1 ;;
    *)     sleep 15 ;;
  esac
done
```

### Em lote

Mesma ideia, com a diferença que importa: se não houver saldo para os três, o
script para **antes** de qualquer cobrança, em vez de descobrir no meio.

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE=https://SEU_DOMINIO

LOTE=$(curl -sf -X POST "$BASE/api/v1/matriculas/lote" \
  -H "Authorization: Bearer $LIDIMUS_API_KEY" \
  -F "file=@m1.pdf" -F "file=@m2.pdf" -F "file=@m3.pdf" | jq -r .loteId)

echo "lote $LOTE enviado"

# Uma consulta acompanha o lote inteiro, em vez de uma por análise.
while :; do
  R=$(curl -sf "$BASE/api/v1/matriculas?lote=$LOTE&limite=100" \
    -H "Authorization: Bearer $LIDIMUS_API_KEY")
  PENDENTES=$(jq '[.itens[] | select(.status=="queued" or .status=="processing")] | length' <<<"$R")
  [ "$PENDENTES" -eq 0 ] && break
  echo "$PENDENTES ainda processando"; sleep 20
done

# A listagem não traz `resultado` — busque o conteúdo de cada uma pelo id.
jq -r '.itens[] | select(.status=="done") | .id' <<<"$R" | while read -r ID; do
  curl -sf "$BASE/api/v1/matriculas/$ID" -H "Authorization: Bearer $LIDIMUS_API_KEY" | jq .resultado
done
```

---

## 9. Onde mexer

| Assunto | Arquivo |
|---|---|
| Autenticação e revalidação de plano | `apps/web/server/lib/requireApiKey.ts` |
| Entitlement (`features.api`) | `packages/db/src/planos.ts` |
| Geração e hash da chave | `packages/db/src/apiKey.ts` |
| Criação da análise (débito, fila) | `apps/web/server/lib/criarAnaliseMatricula.ts` |
| Contrato da resposta | `apps/web/server/lib/v1/serializarJob.ts` |
| Códigos de erro | `apps/web/server/lib/v1/erroApi.ts` |
| Rotas | `apps/web/server/api/v1/matriculas/` |
| Gestão pelo dono | `apps/web/server/api/account/api-keys/`, `pages/conta/api.vue` |
| Script | `packages/db/src/gerar-chave-api.ts` |

**Ao acrescentar croqui, KML ou detector:** o núcleo já é compartilhado. Cada
produto é uma rota nova que chama `requireApiKey` e o seu `criarAnalise*`
equivalente — mais o `tipo` correspondente em `getJobForOrg`. Nada em
`requireApiKey` precisa mudar.
