// Para onde o Lidimus Update aponta.
//
// Até 27/08/2026 o lidimus-update.mjs trazia produção fixa em constantes e em
// nomes literais de container (`lidimus-saas-web-1`). Isso não era só falta de
// elegância: significava que o pipeline de deploy NÃO RODAVA em nenhum outro
// lugar, e portanto nunca podia ser testado. A consequência está no histórico —
// o único ambiente onde ele já foi exercitado é a produção, às 5h da manhã, sem
// ninguém olhando, uma vez por dia. Cada bug custava um dia; o de 27/08 custou
// nove horas de site fora do ar.
//
// Um perfil descreve TUDO que muda entre "promover para produção" e "ensaiar a
// promoção numa stack descartável". O roteiro das fases é o mesmo nos dois — é
// esse o ponto: o ensaio só vale se exercitar exatamente o mesmo código.

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { raizRepo, raizSaas } from './lidimus-update-comum.mjs'

// O ensaio lê estes para que a matriz de cenários possa perturbar um gate por
// vez sem editar código. Só valem no alvo `ensaio`: em produção nada aqui é
// consultado, para que uma variável esquecida no ambiente não afrouxe um gate
// real.
const num = (v, padrao) => (v === undefined || v === '' ? padrao : Number(v))
const bool = (v, padrao) => (v === undefined || v === '' ? padrao : v !== '0' && v !== 'false')

export const CAMINHO_SELO_ENSAIO = resolve(raizRepo, '.lidimus', 'ensaio-ok.json')
export const CAMINHO_SELO_REPROVADO = resolve(raizRepo, '.lidimus', 'ensaio-reprovado.json')
// Deploy que subiu mas não foi publicado no GitHub. O run seguinte lê isto
// antes de qualquer coisa e retenta.
export const CAMINHO_PUBLICACAO_PENDENTE = resolve(raizRepo, '.lidimus', 'publicacao-pendente.json')

function producao() {
  return {
    nome: 'producao',

    // O compose de produção é o único que inclui o cloudflared, que publica o
    // `web` em lidimus.gvlar.com. Mexer nele é mexer no site.
    compose: ['compose', '-f', 'docker-compose.yml'],
    cwd: raizSaas,

    urlWeb: 'http://127.0.0.1:3000',
    urlPublica: 'https://lidimus.gvlar.com',
    // Saúde do sandbox é gate de preflight: promover algo que não está de pé em
    // 3100 é promover algo que ninguém validou.
    urlSandbox: 'http://127.0.0.1:3100',

    imagemWeb: 'lidimus-saas-web',
    imagemWorker: 'lidimus-saas-worker',
    pg: { usuario: 'lidimus', banco: 'lidimus' },

    dirBackups: resolve(raizRepo, 'backups'),
    // Configurável porque o piso certo depende de onde o disco virtual do Docker
    // mora. Com ele no C: (que tem 238 GB e vive cheio) 20 GB é apertado.
    espacoMinimoGb: num(process.env.LIDIMUS_ESPACO_MINIMO_GB, 20),

    rodaTestes: true,
    verificaEnv: true,
    verificaPush: true,
    exigeFilaVazia: true,

    publicaNoGithub: true,
    consomeMarcador: true,

    // Produção não builda quando existe selo de ensaio para a mesma árvore:
    // promove a imagem que o ensaio das 3h30 já validou.
    aproveitaSeloDoEnsaio: true,
    gravaSelo: false,
    limpaDisco: true,
  }
}

function ensaio() {
  // A stack de ensaio é descartável e não tem túnel. Tudo que o preflight
  // consulta pode ser redirecionado pela matriz de cenários — é assim que
  // "disco cheio" ou "fila ocupada" viram teste em vez de acidente.
  const raizEnsaio = process.env.LIDIMUS_ENSAIO_RAIZ || raizSaas

  return {
    nome: 'ensaio',

    // Dois composes com o mesmo papel: o padrão builda os Dockerfiles REAIS (é
    // o ensaio noturno, e a imagem que ele valida é a que a produção promove);
    // o `-stub` troca o Nuxt por uma imagem mínima e é o que a matriz de
    // cenários usa, porque 19 cenários × 20 min de build não é uma ferramenta,
    // é um impedimento.
    compose: [
      'compose',
      '-f', process.env.LIDIMUS_ENSAIO_COMPOSE || 'docker-compose.ensaio.yml',
      '--env-file', '.env.ensaio',
    ],
    cwd: raizEnsaio,

    urlWeb: process.env.LIDIMUS_ENSAIO_URL_WEB || 'http://127.0.0.1:3200',
    // Sem cloudflared: não há site público para checar, e o smoke pula o teste
    // em vez de reprovar por uma URL que não existe neste alvo.
    urlPublica: null,
    // A matriz aponta para uma porta morta no cenário `sandbox-fora`.
    urlSandbox: process.env.LIDIMUS_ENSAIO_URL_SANDBOX || 'http://127.0.0.1:3100',

    // `candidato` é a imagem que o ensaio geral produz e a produção promove às
    // 5h. A matriz de cenários usa outro prefixo (`lidimus-ensaio-stub-*`),
    // porque a limpeza dela apagava a imagem selada pelo ensaio.
    imagemWeb: `${process.env.LIDIMUS_ENSAIO_IMAGEM || 'lidimus-candidato'}-web`,
    imagemWorker: `${process.env.LIDIMUS_ENSAIO_IMAGEM || 'lidimus-candidato'}-worker`,
    pg: { usuario: 'lidimus', banco: 'lidimus' },

    dirBackups: resolve(raizRepo, 'tmp', 'ensaio-backups'),
    espacoMinimoGb: num(process.env.LIDIMUS_ENSAIO_ESPACO_MINIMO_GB, 10),

    // Na matriz os testes do preflight são simulados: rodar `pnpm --filter X
    // test` de verdade exigiria node_modules na árvore copiada e transformaria
    // cada cenário em minutos. O ensaio geral (--geral), esse sim, roda os
    // testes reais — é a mesma árvore de trabalho e o node_modules está lá.
    rodaTestes: bool(process.env.LIDIMUS_ENSAIO_TESTES, true),
    // Aceita 'ok' | 'falha' para o cenário de testes reprovados.
    testesSimulados: process.env.LIDIMUS_ENSAIO_TESTES_SIMULADOS || null,

    verificaEnv: bool(process.env.LIDIMUS_ENSAIO_VERIFICA_ENV, true),
    verificaPush: bool(process.env.LIDIMUS_ENSAIO_VERIFICA_PUSH, true),
    exigeFilaVazia: bool(process.env.LIDIMUS_ENSAIO_FILA_VAZIA, true),

    // O ensaio empurra para um bare repo local (a matriz o cria em tmp), nunca
    // para o GitHub. Quando roda `--geral` sobre a árvore real, a fase do
    // GitHub vira conferência: valida a peneira e não commita nada.
    publicaNoGithub: bool(process.env.LIDIMUS_ENSAIO_PUBLICA_GITHUB, false),
    consomeMarcador: bool(process.env.LIDIMUS_ENSAIO_CONSOME_MARCADOR, false),

    // O ensaio PRODUZ o selo; quem consome é a produção. A matriz liga isto para
    // exercitar o lado do consumo, que de outro modo só seria exercitado às 5h
    // da manhã, em produção — que é exatamente o problema que este projeto veio
    // resolver.
    aproveitaSeloDoEnsaio: bool(process.env.LIDIMUS_ENSAIO_APROVEITA_SELO, false),
    gravaSelo: bool(process.env.LIDIMUS_ENSAIO_GRAVA_SELO, true),
    // O `builder prune` do fim do roteiro jogaria fora o cache de build entre um
    // cenário e outro, transformando 19 builds de segundos em 19 builds do
    // zero. A matriz faz uma limpeza só, no fim de tudo.
    limpaDisco: bool(process.env.LIDIMUS_ENSAIO_LIMPA_DISCO, false),
  }
}

export function escolherAlvo(argv = process.argv) {
  const achado = argv.find((a) => a.startsWith('--alvo='))
  const nome = achado ? achado.slice('--alvo='.length) : 'producao'

  if (nome === 'producao') return producao()
  if (nome === 'ensaio') return ensaio()

  console.error(`alvo desconhecido: "${nome}" — use --alvo=producao ou --alvo=ensaio`)
  process.exit(1)
}

// Lê o selo do ensaio, se ele existir e ainda valer para esta árvore.
//
// "Valer" é o ponto todo: um selo de anteontem descreve um build de anteontem.
// A comparação é pelo hash da árvore — o mesmo que o marcador de aprovação usa
// — porque é ele que identifica o que foi realmente construído.
export function lerSelo(caminho, hashAtual) {
  if (!existsSync(caminho)) return null
  try {
    const selo = JSON.parse(readFileSync(caminho, 'utf8'))
    return selo.hashArvore === hashAtual ? selo : { ...selo, desatualizado: true }
  } catch {
    return null
  }
}
