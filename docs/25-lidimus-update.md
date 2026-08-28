# Lidimus Update — promoção automática do sandbox para produção

Todo dia às 5h da manhã, o n8n dispara uma automação que promove para produção
aquilo que você validou no sandbox, testa o resultado, reverte sozinha se algo
quebrar e manda o relatório no seu WhatsApp.

Antes disso, às **3h30**, o mesmo pipeline roda inteiro numa stack descartável,
com um clone do banco de produção. Se ele tropeçar lá, o deploy das 5h nem
começa — e a imagem que ele validar é a que sobe, sem rebuildar. Ver
[docs/26-ensaio.md](26-ensaio.md).

Ela **não** decide o que subir. Quem decide é você — com `pnpm sandbox:ok` na
máquina, ou tocando no link de aprovação que vem na própria mensagem do
WhatsApp.

## O uso do dia a dia

```powershell
cd lidimus-saas

# 1. desenvolve e testa no sandbox (docs/15-sandbox.md)
pnpm sandbox:up

# 2. quando estiver satisfeito, aprova:
pnpm sandbox:ok "corrigi o calculo de creditos no upload em lote"
```

E acabou. Às 5h a automação encontra o marcador, confere que a árvore não mudou
desde a aprovação, sobe e avisa. Se você não aprovar nada, ela acorda, não acha
marcador e não faz nada (nem manda mensagem de "nada a fazer" — manda sim, para
você saber que ela está viva).

Se você editar qualquer arquivo depois de aprovar, o deploy é **adiado** e o
relatório diz exatamente quais arquivos mudaram. Inclusive quando foi só o
formatador do editor trocando as quebras de linha — por isso a mensagem nomeia
os arquivos, para você distinguir num relance.

## Aprovar pelo WhatsApp

Esquecer o `pnpm sandbox:ok` custava um dia inteiro: às 5h a automação não achava
marcador, avisava "nada aprovado" e o trabalho validado ficava parado até a
manhã seguinte. Agora esse aviso vem acionável.

Quando o run das 5h termina sem aprovação, a mensagem lista o que ficou para
trás e traz um **link de aprovação**. Tocar nele abre uma página com o commit e
os arquivos, um campo de descrição já preenchido com o assunto do último commit,
e um botão. Confirmar grava o `sandbox:ok` e dispara o deploy na hora — passando
por **todos** os gates de sempre, os mesmos das 5h.

Às **22h** um lembrete faz o mesmo convite, se houver algo sem aprovação. É a
chance de aprovar antes do run automático, e ele fica calado quando não há nada
a promover — lembrete que chega todo dia deixa de ser lido.

### Duas coisas que fazem isso ser seguro

**O GET é inerte.** O link só renderiza a página; a aprovação exige o POST do
botão dela. Isso não é cerimônia: o prefetch de preview de link — do WhatsApp,
do Cloudflare, de qualquer coisa no caminho — abre essa URL sozinho. Se o GET
aprovasse, um deploy sairia sem ninguém ter tocado em nada.

**O aceite é amarrado ao hash da árvore.** O link carrega um ticket assinado
(HMAC-SHA256 com chave derivada do `LIDIMUS_UPDATE_TOKEN`, sem segredo novo) que
guarda o hash da árvore no momento em que a mensagem foi montada. Se você editou
código entre o relatório e o toque no link, o aceite é **recusado**, dizendo o
que mudou. É o mesmo princípio do gate original: ninguém promove um estado que
não foi validado no sandbox. Nesse caso, valide de novo e aprove na máquina.

O ticket vale `LIDIMUS_TICKET_HORAS` (padrão 18h) e a aprovação continua valendo
para um deploy só. Um ticket forjado ou vencido morre no agente, que é o único
lugar onde a assinatura é conferida — a página não valida nada, só exibe.

O aceite pelo celular grava `aprovadoPor: whatsapp` no marcador, e o relatório
mostra "Aprovado (pelo WhatsApp)". Aprovar do celular e aprovar no teclado têm o
mesmo peso, mas não a mesma trilha.

### O que o aceite NÃO contorna

Aprovar não é implantar. O agente só grava o marcador — por isso a página
responde em segundos em vez de segurar o navegador por todo o build. Quem
implanta é o próprio `Lidimus Update`, chamado logo em seguida, com o preflight
inteiro: disco, saúde do sandbox, paridade do `.env`, testes de `croqui` e
`docx`, credencial do GitHub e fila vazia. Qualquer um deles pode adiar o
deploy, e aí chega o relatório de sempre explicando qual foi.

Como o deploy sai na hora do aceite, a recriação dos containers acontece no
horário em que você tocou no link — não às 5h. O relatório informa a
indisponibilidade em segundos.

Para ensaiar sem tocar em produção, acrescente `&ensaio=1` ao link: o mesmo
caminho roda com `--dry-run`.

## Por que existe

O comando de deploy manual era `docker compose up -d --build web worker`, que
builda e recria no mesmo passo. Um build quebrado só aparecia **depois** que a
produção já tinha parado, e o site ficava fora do ar durante todo o build.

A automação separa os dois: builda com o site velho no ar (minutos) e só então
recria os containers (segundos). Um build quebrado agora morre antes de encostar
na produção.

## As peças

| Peça | Onde | O que faz |
|---|---|---|
| Workflow `Lidimus Update` | n8n (`EMeS3q1rDBAIpWrM`) | Agenda o ensaio das 3h30 e o deploy das 5h, acompanha por polling, formata e envia o WhatsApp |
| Workflow `Lidimus Aprovar` | n8n (`jvNX0XRrdUVdlD9S`) | Página do link de aceite, lembrete das 22h |
| `scripts/update-agent.mjs` | host, porta 8099 | Recebe a ordem do n8n e executa em segundo plano |
| `scripts/update-agent-oculto.vbs` | host, Inicializar | Sobe o agente sem console e rotaciona o log |
| `scripts/update-agent-vigia.vbs` | host, tarefa a cada 15 min | Ressobe o agente se a 8099 parar de responder |
| `scripts/ensaio-geral.mjs` | host | O ensaio noturno: prepara o ambiente, roda o pipeline nele e desmonta |
| `scripts/lidimus-update.mjs` | host | O deploy em si, fases 0 a 8; `--alvo=ensaio` roda tudo numa stack descartável |
| `scripts/lidimus-alvos.mjs` | host | Os perfis `producao` e `ensaio` — é o que permite o pipeline rodar fora da produção |
| `scripts/sandbox-ok.mjs` | host | Grava o marcador de aprovação (porta do teclado) |
| `scripts/ensaio.mjs` + `ensaio/cenarios.mjs` | host | A matriz de cenários ([docs/26-ensaio.md](26-ensaio.md)) |
| `scripts/ensaio-preparar.mjs` | host | Gera o `.env.ensaio` e clona o banco de produção para o ensaio |
| `scripts/n8n-diff.mjs` | host | Compara os workflows do n8n com os JSONs de `n8n/` |
| `scripts/verificar-env-producao.mjs` | host | Confere `.env` + `docker-compose.yml` antes de subir |

### Por que precisa de um agente no host

O container do n8n não tem o socket do Docker, não tem o código-fonte e está
numa rede separada das stacks do Lidimus — ele não consegue buildar nem
reiniciar a produção. O que ele alcança é o host, por `host.docker.internal`.

O agente escuta em **127.0.0.1:8099**, não em `0.0.0.0`. O `host.docker.internal`
resolve para `192.168.65.254`, endereço da VM interna do Docker Desktop que não
existe em nenhuma interface do Windows; o proxy do Docker entrega o tráfego em
loopback. Resultado: alcançável por qualquer container, invisível para a rede
local e para o Tailscale, sem precisar de regra de firewall.

O outro lado disso é que **todo processo desta máquina também alcança a porta**.
O `LIDIMUS_UPDATE_TOKEN` é o único controle, e ele dispara `git push`,
`docker build` e `docker compose up` com a sua conta. Trate como credencial de
execução remota de código.

O agente oferece cinco rotas, todas exigindo o `Bearer`:

| Rota | O que faz |
|---|---|
| `POST /lidimus-update` | Implanta (ou ensaia, com `{"alvo":"ensaio"}`). Responde **202** na hora com um `execucaoId`. |
| `GET /execucao/<id>` | Como está, ou como terminou, aquela execução. |
| `GET /status` | Se há algo rodando, as últimas execuções e o desfecho do último. |
| `GET /pendencia` | Só lê git e disco: o que espera aprovação, mais o ticket do link. |
| `POST /aprovar` | Grava o `sandbox:ok` vindo do celular. **Não** implanta. |

**Por que 202 e não a resposta pronta.** Era síncrono, e o nó HTTP do n8n
desistia em 15 minutos. Um build mais longo fazia o n8n reportar "o agente do
host nao respondeu" no WhatsApp **enquanto o deploy continuava rodando** — o
relatório mentia, e o `emExecucao` bloqueava as tentativas seguintes sem que
ninguém soubesse por quê. Agora o n8n dispara, recebe o `execucaoId` e consulta
`/execucao/<id>` de 30 em 30 segundos até terminar (ou desistir de esperar
depois de 45 min, dizendo isso).

Para uso no teclado, `{"aguardar": true}` no corpo segura a conexão e devolve o
relatório inteiro, como antes.

Cada execução também é arquivada em `.lidimus/historico/<id>.json`. Antes, o
único registro era o `tmp/update-agent.log`, um arquivo append sem rotação — em
27/08/2026 quem foi investigar às 14h teve que garimpar 49 KB de texto corrido.

## As fases

| # | Fase | O que acontece se falhar |
|---|---|---|
| 0 | Preflight | Aborta. Produção intacta. |
| 1 | O que mudou (+ retenta publicação pendente) | — |
| 2 | Divergência do n8n | Só reporta, nunca bloqueia |
| 3 | Migrations pendentes | Aborta se achar SQL destrutivo |
| 4 | Backup, imagem, migrations, recriação | Aborta no build; produção intacta |
| 5 | Smoke tests | Dispara o rollback |
| 6 | Rollback | Só vira intervenção manual se o próprio rollback falhar |
| 7 | Commit e push | `sucesso-sem-push`; o run seguinte retenta |
| 8 | Limpeza de disco e relatório | — |

O preflight confere, nesta ordem: espaço em disco, marcador de aprovação, hash
da árvore, **veredito do ensaio da madrugada**, saúde do sandbox, paridade do
`.env` de produção, **os testes de todos os pacotes que têm script `test`**,
credencial do GitHub e fila de jobs vazia.

A lista de testes era fixa em `croqui` e `docx` e envelheceu em silêncio: em
27/08/2026 subiu para produção o pacote `autenticidade`, que tem testes e não
era rodado por ninguém. Agora ela é descoberta varrendo `packages/*` e `apps/*`.

### Fase 4: a imagem normalmente não é buildada

Quando existe `.lidimus/ensaio-ok.json` para a mesma árvore, o deploy das 5h
**promove** a imagem que o ensaio das 3h30 já construiu e validou, com um
`docker tag`. Não há segundo build. Isso tira ~30 min do caminho crítico,
elimina a classe "passou no ensaio e falhou no build de produção" e reduz a
indisponibilidade aos segundos da recriação. Ver [docs/26-ensaio.md](26-ensaio.md).

A migration roda com `compose run --rm --no-deps web` — na imagem nova, não no
container que ainda está no ar — e o resultado é conferido no ledger antes do
`up -d web`. Ver a seção de decisões abaixo.

### Decisões que não são óbvias

**O push vem depois do deploy, não antes.** Este repositório tem 6 arquivos de
teste ao todo, nenhum cobrindo API, auth ou billing — o `nuxt build` dentro do
`docker compose build` é o único gate de qualidade real. Empurrar antes de
buildar publicaria um build quebrado.

**Migrations destrutivas param a automação.** O histórico tem casos reais: a
`0015_papeis_equipe` faz `DELETE FROM organizations` e dropa
`users.active_org_id`. O script lê o SQL pendente e recusa rodar sozinho se
achar `DROP`, `DELETE`, `TRUNCATE`, `SET DATA TYPE` ou `SET NOT NULL`.

**A migration roda em container descartável da imagem nova, e o resultado é
conferido no ledger.** Até 27/08/2026 era `compose exec -T web` — que roda no
container que ainda está no ar, cuja imagem é a *antiga*. Naquele dia a
`0025_autenticidade` só existia na imagem recém-buildada; o migrator leu o
journal velho, concluiu que não havia nada pendente e saiu com código 0. O
script marcou "aplicadas" a partir da lista calculada no host, subiu o código
novo contra o schema velho, e todo upload passou a morrer em
`column "sha256" of relation "job_files" does not exist`. Pior: como
`migrations.aplicadas` estava (falsamente) true, o rollback automático ficou
proibido e a produção passou o dia fora do ar. Agora é
`compose run --rm --no-deps web`, que usa a imagem nova, e logo depois o script
confere que `drizzle.__drizzle_migrations` cresceu exatamente o número de
pendentes. Essa conferência acontece **antes** do `up -d web`: se falhar, o
site continua na imagem anterior e o rollback segue permitido.

**Migration aplicada não proíbe mais o rollback.** Até 27/08/2026 proibia: a
ideia era que retaggear a imagem colocaria código velho contra schema novo. O
raciocínio estava incompleto. Tudo que a automação aplica sozinha passou pelo
gate `SQL_DESTRUTIVO` da fase 3 — nada de `DROP`, `DELETE`, `TRUNCATE`,
`SET DATA TYPE` ou `SET NOT NULL`. O que sobra é **aditivo**, e o código
anterior roda contra um schema aditivamente à frente sem enxergar diferença:
colunas e tabelas novas simplesmente não são referenciadas.

O custo da política antiga foi medido. Em 27/08/2026 ela transformou uma falha
de smoke de dois minutos em nove horas de site fora do ar — das 5h às 14h,
esperando alguém acordar e ler o WhatsApp. Voltar a imagem custa segundos.

O dump continua sendo tirado antes de tudo, o banco não é tocado no rollback, e
o relatório diz explicitamente que o schema ficou à frente do código.
`PRECISA DE INTERVENCAO MANUAL` agora significa uma coisa só: o rollback foi
tentado e **também** não restaurou a saúde.

**O marcador é consumido quando o deploy passa no smoke, não no fim do
roteiro.** Tudo que vem depois — commit, push — é publicação, e falha de
publicação não desfaz um deploy que já está no ar. Com o consumo no fim, os
aborts da fase do GitHub de 22, 23 e 24/08/2026 deixaram o marcador vivo com a
produção já atualizada; nos dias seguintes a árvore não batia mais com ele e o
preflight abortou, todo dia, até alguém ir olhar. Falha de push agora vira
`.lidimus/publicacao-pendente.json`, que o run seguinte retenta antes de
qualquer outra coisa, e o desfecho é `sucesso-sem-push` — nem sucesso limpo, nem
deploy fracassado.

**Um rollback também consome o marcador**, arquivando-o como `.rejeitado`. Sem
isso o run de amanhã acharia o mesmo marcador, promoveria o mesmo código
quebrado e reverteria de novo, todo dia. Quem corrigir precisa reaprovar.

**A fase do n8n nunca escreve.** Nem no repositório, nem na instância. A direção
da verdade é ambígua nos dois sentidos: em 12/08/2026 o repo estava *à frente*
do n8n (o commit `308f071` trocou "parecer jurídico" por "relatório técnico" e
nunca foi aplicado). Reexportar por cima teria revertido uma correção
deliberada e reportado sucesso. Reconciliar é decisão humana — veja
`rag/guarda-producao.cjs` para o caminho supervisionado.

**A fila precisa estar vazia.** Durante a recriação do `web`, o callback do n8n
leva conexão recusada; o job fica preso e o `watchdog.ts` marca erro e estorna o
crédito depois do timeout. O cliente perde a análise e o custo de Document AI e
Claude já foi gasto. Havendo job em voo, o deploy é adiado para o dia seguinte.

## Comandos

```powershell
pnpm sandbox:ok "descricao"   # aprova a árvore atual para promoção
pnpm update:simular           # roda tudo sem buildar, commitar nem subir
pnpm update:agora             # deploy imediato, sem esperar as 5h
pnpm update:agente            # sobe o agente HTTP (normalmente já roda no boot)
pnpm n8n:diff                 # compara os workflows do n8n com o repositório
pnpm env:verificar            # confere .env + docker-compose.yml

pnpm ensaio:preparar --stub   # prepara a stack de ensaio e clona o banco
pnpm ensaio                   # a matriz de cenários (docs/26-ensaio.md)
pnpm ensaio:geral             # o ensaio completo, com os Dockerfiles reais
```

O `LIDIMUS_ESPACO_MINIMO_GB` sobrescreve o piso de espaço em disco (padrão 20),
útil para testar em máquina apertada.

## Operação

O agente precisa estar rodando para o n8n alcançá-lo. Ele sobe por um **atalho
na pasta Inicializar** (`Startup`) apontando para
`scripts/update-agent-oculto.vbs` — e não por uma tarefa agendada, porque
precisa rodar **na sua conta, com o perfil carregado**: o Git Credential Manager
guarda a credencial do GitHub no perfil do usuário, e um processo como SYSTEM
não a enxerga (o `git push` falharia todo dia às 5h).

A contrapartida é que o agente só existe **depois do logon interativo**. Máquina
ligada com a sessão bloqueada funciona; máquina reiniciada sem ninguém entrar
não tem agente às 5h, e o WhatsApp diz que ele não respondeu. Por isso existe a
tarefa agendada `Lidimus Update - vigia`, que a cada 15 minutos confere a porta
8099 e ressobe o agente se ele não responder.

Subir um segundo agente agora **falha alto**: o `EADDRINUSE` era engolido como
evento não tratado, e o processo ficava vivo sem escutar nada — em 27/08/2026
havia três `update-agent.mjs` na máquina e só um detinha a porta.

Para conferir se está de pé:

```powershell
curl.exe -H "Authorization: Bearer $env:LIDIMUS_UPDATE_TOKEN" http://127.0.0.1:8099/status
```

Se o agente estiver fora do ar às 5h, o relatório do WhatsApp diz
"o agente do host nao respondeu" e a produção não é tocada.

## Quando o WhatsApp avisa que deu errado

| Mensagem | O que fazer |
|---|---|
| `Nada aprovado para subir` | Se a mensagem trouxer o link, toque nele para aprovar e subir agora. Senão, ninguém mexeu em nada. |
| `a árvore mudou depois da aprovação` | Valide de novo no sandbox e reaprove. |
| `a árvore mudou depois que este link foi gerado` | Você editou código depois do relatório. Aprove na máquina, ou espere o próximo link. |
| `Link vencido` | Passou de `LIDIMUS_TICKET_HORAS`. O lembrete das 22h traz um novo. |
| `disco com N GB livres` | Libere espaço; ver a seção de disco abaixo. |
| `N job(s) em processamento` | Normal e temporário. Vai subir amanhã. |
| `build falhou` | Produção intacta. Corrija e reaprove. |
| `Deploy revertido` | Produção voltou à versão anterior e a aprovação foi consumida. Investigue o smoke que falhou e reaprove. |
| `Deploy no ar, mas NAO publicado no GitHub` | O deploy deu certo; só o push ficou para trás. Se for pendência de `push`, o run seguinte retenta sozinho. Se for de `commit`, algum arquivo bateu na peneira e precisa de você. |
| `PRECISA DE INTERVENCAO MANUAL` | O rollback foi tentado e também não restaurou a saúde. Vá até a máquina; o caminho do dump está na mensagem. |
| `Ensaio REPROVOU` | Chegou às 3h30 e é **boa notícia**: o problema apareceu numa stack descartável e o deploy das 5h não vai acontecer. Corrija e reaprove. |
| `ainda rodando depois de 45 min` | O n8n desistiu de esperar, o deploy não. Veja `.lidimus/historico/<id>.json` ou `GET /status`. |

## Disco

O disco virtual do Docker (`docker_data.vhdx`) **não encolhe** quando você roda
`docker system prune` — o espaço volta para dentro do arquivo, não para o
Windows. Por isso a fase 8 roda `image prune` e `builder prune --keep-storage`
ao final de cada rodada: o objetivo não é devolver espaço ao host, é impedir que
o arquivo precise crescer.

O gate de 20 GB no preflight existe porque o Postgres de produção grava no mesmo
disco. Ficar sem espaço para WAL é a falha mais cara possível, e aconteceria às
5h da manhã sem ninguém olhando.
