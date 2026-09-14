import { describe, expect, it } from 'vitest'
import { documento, tokenizar } from '@lidimus/revisao/fixtures'
import { prepararLeitura, querCorretorDeLeitura } from './revisaoDaLeitura'

// O gate do corretor de leitura: quem entra na etapa de conferência humana.
//
// O gatilho dos casos é um CPF de dígito verificador errado, e não uma data
// fora do calendário, de propósito: `prepararLeitura` chama `levantarCandidatos`
// sem a opção `anoAtual`, então um caso ancorado em data apodreceria sozinho na
// virada do ano. Dígito verificador é imune ao relógio.
const TEXTO = 'Adquirido por JOSÉ DA SILVA, CPF 529.982.247-26, conforme R.3 desta matrícula.'
const TOKENS = tokenizar(TEXTO)

describe('querCorretorDeLeitura', () => {
  it('recusa a integração: não há tela para responder', () => {
    expect(querCorretorDeLeitura({ origem: 'api' })).toBe(false)
  })

  it('recusa quando o usuário desmarcou a conferência no envio', () => {
    expect(querCorretorDeLeitura({ params: { corretorDeLeitura: false } })).toBe(false)
  })

  it('aceita quando o usuário pediu a conferência', () => {
    expect(querCorretorDeLeitura({ params: { corretorDeLeitura: true } })).toBe(true)
  })

  // Job enfileirado antes deste deploy não tem a chave, e precisa continuar se
  // comportando como no envio em que entrou.
  it('aceita quando a chave não existe', () => {
    expect(querCorretorDeLeitura({ params: { incluirMemorial: true } })).toBe(true)
    expect(querCorretorDeLeitura({})).toBe(true)
    expect(querCorretorDeLeitura(null)).toBe(true)
  })

  // A origem manda mesmo que o parâmetro diga o contrário — a v1 recusa a chave
  // na fronteira (lib/v1/paramsMatricula.ts), e isto é a segunda tranca.
  it('recusa a integração mesmo com o parâmetro ligado', () => {
    expect(querCorretorDeLeitura({ origem: 'api', params: { corretorDeLeitura: true } })).toBe(
      false,
    )
  })
})

describe('prepararLeitura', () => {
  it('não levanta candidatos numa análise vinda da API', () => {
    const { candidatos } = prepararLeitura({
      textoOcr: TEXTO,
      tokens: TOKENS,
      inputMeta: { origem: 'api' },
    })
    expect(candidatos).toEqual([])
  })

  it('não levanta candidatos com o corretor desmarcado', () => {
    const { candidatos } = prepararLeitura({
      textoOcr: TEXTO,
      tokens: TOKENS,
      inputMeta: { params: { corretorDeLeitura: false } },
    })
    expect(candidatos).toEqual([])
  })

  it('levanta candidatos com o corretor marcado', () => {
    const { candidatos } = prepararLeitura({
      textoOcr: TEXTO,
      tokens: TOKENS,
      inputMeta: { params: { corretorDeLeitura: true } },
    })
    expect(candidatos.length).toBeGreaterThan(0)
  })

  it('levanta candidatos quando o job não traz a chave', () => {
    const { candidatos } = prepararLeitura({
      textoOcr: TEXTO,
      tokens: TOKENS,
      inputMeta: { params: { incluirMemorial: true } },
    })
    expect(candidatos.length).toBeGreaterThan(0)
  })

  // O que mais fácil se quebra ao mexer no gate: desligar o corretor desliga a
  // conferência humana, não a leitura. A tarja diagonal da certidão eletrônica
  // continua saindo do texto — ela não pergunta nada a ninguém.
  it('limpa o carimbo mesmo com o corretor desmarcado', () => {
    const { texto, tokens } = documento([
      'Imovel matriculado sob numero dois mil seiscentos e cinquenta e tres',
      '@PARA SIMPLES CONSULTA NAO VALE COMO CERTIDAO',
      'situado na rua Padre Raposo apartamento cento e vinte e um',
      'a parte ideal correspondente a sete virgula tres por cento a cada um',
    ])

    const leitura = prepararLeitura({
      textoOcr: texto,
      tokens,
      inputMeta: { params: { corretorDeLeitura: false } },
    })

    expect(leitura.candidatos).toEqual([])
    expect(leitura.carimboRemovido?.length).toBeGreaterThan(0)
    expect(leitura.textoOcr).not.toContain('NAO VALE COMO CERTIDAO')
    // O texto como o cartório mandou fica ao lado, para provar o que foi tirado.
    expect(leitura.textoBruto).toBe(texto)
  })
})
