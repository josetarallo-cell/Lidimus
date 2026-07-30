# API pública v1

API para integrar o Lidimus a outro sistema — ERP do escritório, portal, script de
lote. Cobre a **análise de matrícula**: enviar o PDF e buscar o resultado.

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
  (§6). Nem `member` nem `reader` emitem.
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

## 3. `GET /api/v1/matriculas/{id}`

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
nulos. `etapa` serve para mostrar progresso — não ramifique lógica nela.

---

## 4. `GET /api/v1/matriculas`

Análises da organização, da mais recente para a mais antiga. **Não traz
`resultado`** — vinte resultados de matrícula por página seriam megabytes; para o
conteúdo, peça a análise pelo id.

| Parâmetro | Descrição |
|---|---|
| `limite` | 1 a 100 (padrão 20). |
| `status` | `queued`, `processing`, `done` ou `error`. |
| `cursor` | Valor de `proximoCursor` da resposta anterior. |

```json
{ "itens": [ { "id": "...", "status": "done" } ], "proximoCursor": "MjAyNi0w..." }
```

Paginação por cursor, e não por offset, porque a lista cresce pela frente
justamente enquanto o cliente pagina — offset repetiria e pularia registros. O
cursor é opaco: devolva-o como veio. `proximoCursor: null` é o fim.

---

## 5. Erros

Sempre no mesmo formato. Ramifique no **`codigo`**; a `mensagem` é para o humano
que lê o log e pode mudar de versão para versão.

```json
{ "erro": { "codigo": "creditos_insuficientes", "mensagem": "Créditos insuficientes. Saldo: 40, necessário: 91 (1 página)." } }
```

| HTTP | `codigo` | Quando |
|---|---|---|
| 400 | `tls_obrigatorio` | Chamada em `http://` em produção. |
| 400 | `requisicao_invalida` | Corpo, `params` ou cursor malformados. |
| 400 | `arquivo_invalido` | `file` ausente ou não é PDF. |
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
  do painel (20) porque integração de lote submete mais que gente clicando.
- **120 por chave**, com o mesmo teto. Existe para isolar o culpado quando a
  chave está compartilhada: o script descontrolado de um integrante não derruba a
  integração dos outros.
- **20 falhas de autenticação por IP a cada 5 minutos.** Só conta falhas —
  integração saudável nunca encosta nele.

---

## 6. Emitir chave pelo terminal

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

## 7. Exemplo completo

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

---

## 8. Onde mexer

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
