# Ensaio — testar o deploy sem arriscar a produção

O `lidimus-update.mjs` é o script mais perigoso do repositório: ele builda,
aplica migrations, recria containers e empurra para o GitHub, sozinho, às 5h da
manhã. Até 27/08/2026 ele **só rodava em produção** — não existia nenhum outro
lugar onde pudesse ser executado.

O preço disso está no histórico de `tmp/update-agent.log`:

| Data | Desfecho |
|---|---|
| 13/08 | último `sucesso` |
| 22, 23, 24/08 | abortou na fase github (a peneira derrubou o `.env.example`); produção subiu, push nunca aconteceu |
| 25, 26/08 | abortou no preflight, porque a árvore não batia mais com o marcador — consequência dos abortos acima |
| 27/08 | migrator rodou no container antigo, o relatório mentiu "migrations aplicadas", o rollback ficou proibido e a produção passou das 5h às 14h fora do ar |

Duas semanas sem um ciclo automático limpo. Cada correção era escrita **depois**
de a produção quebrar, porque não havia como exercitar o pipeline antes.

Este documento descreve os dois lugares onde ele agora é exercitado.

## As duas formas de ensaiar

| | Matriz de cenários | Ensaio geral |
|---|---|---|
| Comando | `pnpm ensaio` | `pnpm ensaio:geral` (ou o n8n às 3h30) |
| Stack | `docker-compose.ensaio-stub.yml` (portas 3201/5435/6382) | `docker-compose.ensaio.yml` (portas 3200/5434/6381) |
| Imagem | stub mínimo (`ensaio/Dockerfile.stub`), builda em segundos | Dockerfiles **reais** do Nuxt e do worker |
| Árvore | cópia em `C:\tmp\lidimus-ensaio\repo`, com bare repo local no lugar do GitHub | a árvore de trabalho de verdade |
| Banco | clone do dump de produção | clone do dump de produção |
| O que testa | a **orquestração**: ordem das fases, gates, ledger, rollback, consumo do marcador, forma do relatório | o **build** e o schema de verdade |
| Duração | ~20 s por cenário, ~15 min a matriz inteira | o tempo de um deploy real |

A divisão existe porque são perguntas diferentes. "O rollback funciona quando o
smoke falha com uma migration aplicada?" não precisa de 25 minutos de `nuxt
build` para ser respondida — e se precisasse, ninguém rodaria a pergunta.

## Preparar

```powershell
cd lidimus-saas
pnpm ensaio:preparar --stub     # ou sem --stub, para o ensaio geral
```

Isso gera o `.env.ensaio` **a partir do `.env.sandbox`** (nunca do `.env` de
produção: o ensaio sobe um worker de verdade, e com as credenciais reais ele
mandaria e-mail pelo Resend, gastaria Document AI e debitaria crédito de
cliente), sobe o Postgres e o Redis do ensaio e restaura o dump mais recente de
`backups/`. Com `--do-zero` ele tira um dump novo da produção antes.

## A matriz

```powershell
pnpm ensaio                      # todos os cenários
pnpm ensaio -- --listar          # os nomes e o que cada um cobre
pnpm ensaio -- --cenario=nome    # um só
pnpm ensaio -- --manter          # não derruba a stack no fim (para investigar)
```

Cada cenário faz três coisas: coloca o sistema num estado conhecido, roda
`lidimus-update.mjs --alvo=ensaio` (o **mesmo arquivo** que sobe a produção) e
afere o resultado por dois lados —

1. o **relatório** que o WhatsApp mostraria (`resultado`, `fase`, o texto do erro);
2. o **estado em que a stack ficou** (versão da imagem no ar, contagem no ledger,
   marcador consumido ou não, commit presente no repositório remoto).

A segunda aferição é a que faltava. Em 27/08 o relatório dizia
`migrations aplicadas: 0025_autenticidade` sem que nenhuma tivesse sido
aplicada: um teste que lesse só o relatório teria dado ✓ para a falha que
derrubou a produção por nove horas.

Quando um cenário reprova, a saída completa daquele run vai para
`tmp/ensaio/<cenario>.log` **na hora**, e não no fim da rodada — uma matriz
interrompida no meio levava junto a única evidência do que deu errado, e o
cenário tinha que ser reproduzido do zero só para ser investigado.

### Como o stub finge ser o Lidimus

`ensaio/stub/servidor.mjs` responde só o que o pipeline observa: `/api/health`,
`/api/health?profundo=1` e o estado do container. `ensaio/stub/pnpm` intercepta
o `pnpm --filter db migrate` que o pipeline executa e chama
`ensaio/stub/migrar.mjs`, que aplica os `.sql` de verdade e escreve no ledger
real do Drizzle — sem isso, a conferência de ledger que o pipeline faz depois do
migrator não estaria sendo testada, que é o ponto do cenário
`migration-nao-aplicou`.

Os botões ficam no `.env.ensaio`, reescrito entre um cenário e outro:
`ENSAIO_MODO_WEB`, `ENSAIO_MODO_WORKER`, `ENSAIO_MIGRACAO`,
`ENSAIO_SELECT_PROFUNDO`.

**Os defeitos valem só para a imagem `candidata`, nunca para a `anterior`.** É o
que torna o rollback verificável: se o `ENSAIO_MODO_WEB=insalubre` também
adoecesse a versão de volta, o pipeline terminaria em "o rollback também falhou"
em vez de demonstrar que a produção foi restaurada. No mundo real a versão
anterior funciona — é por isso que voltar para ela é a saída.

### Acrescentar um cenário

Em `ensaio/cenarios.mjs`. A regra para entrar na lista: **ou o cenário reproduz
uma falha que já aconteceu de verdade** (com a data no comentário), **ou fecha um
caminho pelo qual o pipeline poderia quebrar a produção sem ninguém perceber**.
Cenário sem uma dessas duas justificativas é manutenção sem contrapartida.

```js
{
  nome: 'meu-cenario',
  descricao: 'uma linha, aparece no --listar',
  async preparar(ctx) {
    await ctx.migracao({ sql: 'alter table plans add column x text;\n' })
    ctx.botoes({ ENSAIO_MODO_WEB: 'insalubre' })
    await ctx.aprovar('descricao da aprovacao')
  },
  espera: { resultado: 'rollback', fase: 'rollback', erro: /regex no motivo/ },
  async conferir(ctx, relatorio) {
    return []   // devolve a lista de problemas encontrados
  },
}
```

O `ctx` traz `sql`, `git`, `docker`, `saude`, `escrever`, `botoes`, `aprovar`,
`migracao`, `hashDaArvore`, `selo`, `imagemSelada`, `copia` e `marco`. O
`aprovar` passa pelo `sandbox-ok.mjs` de verdade, e não forja o marcador à mão —
senão deixaria de testar justamente o gate que mais aborta. O `imagemSelada`
constrói uma imagem com identidade própria (`ENSAIO_VERSAO`), que é como os
cenários de promoção provam que a imagem no ar veio do selo e não de um build
novo.

## O ensaio geral e o selo

Às **3h30** o n8n dispara `scripts/ensaio-geral.mjs`: mesma árvore de trabalho,
Dockerfiles reais, banco clonado da produção. Ele roda preflight → build →
migrations → up → smoke, com a fase do GitHub em modo conferência (aplica a
peneira sobre o `git status` e não commita nada).

O script prepara o ambiente antes e o desmonta depois: gera o `.env.ensaio`,
sobe o banco do ensaio, tira um **dump novo da produção** (não o último de
`backups/` — o ensaio precisa enfrentar o schema que a produção tem agora, que é
o que o deploy das 5h vai encontrar), restaura, roda o pipeline, apaga o clone e
derruba a stack. As imagens ficam: é uma delas que a produção promove.

Ele é um script separado do `lidimus-update.mjs` de propósito. Uma falha na
**preparação** não pode ser confundida com reprovação do código — reprovar por
engano bloquearia o deploy das 5h sem motivo.

**Só reprova o que é sobre o código.** Um abort de preflight no ensaio é
ambiental (sandbox no chão, disco apertado, fila ocupada, credencial vencida) e
**não** grava selo de reprovação: o run das 5h reavalia cada um desses gates por
conta própria, com o ambiente daquele momento. Gravar reprovação aí criaria um
portão emperrado — o sandbox volta, está tudo bem, e o deploy segue bloqueado
por um selo da madrugada. É o mesmo padrão que deixou 14 dias sem deploy.

O desfecho vira um selo em `.lidimus/`:

| Selo | O que o run das 5h faz |
|---|---|
| `ensaio-ok.json` com o mesmo hash de árvore | **não builda**: promove a imagem já validada com `docker tag` e segue para migrations, up e smoke |
| `ensaio-reprovado.json` com o mesmo hash | aborta no preflight; a produção não é tocada |
| nenhum (máquina desligada de madrugada) | builda como antes, e o relatório diz que subiu sem ensaio |

O selo vale pelo **hash da árvore**, o mesmo que identifica o marcador de
aprovação: um selo de anteontem descreve um build de anteontem. E a imagem
carimbada é uma tag imutável (`lidimus-candidato-web:<hash>`), não `:latest` —
um ensaio posterior sobrescreveria o `latest` e a produção promoveria uma imagem
que o selo não descreve.

O fallback "sem selo, builda" é deliberado. Ser estrito demais aqui recriaria
exatamente o padrão que deixou 14 dias sem deploy: um gate que trava e ninguém
percebe.

## Limpeza

A matriz derruba a stack e apaga as tags `antes-*` e as imagens carimbadas ao
final, a menos que você passe `--manter`. O ensaio pula o `builder prune` que o
deploy de produção faz na fase 8 — jogar fora o cache de build entre um cenário e
outro transformaria 22 builds de segundos em 22 builds do zero.
