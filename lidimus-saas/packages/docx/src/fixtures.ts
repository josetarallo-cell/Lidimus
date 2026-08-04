// Fixtures do formato `result.documento` que o pipeline (etapa `doc`) grava no
// job. A forma segue o consumidor autoritativo — o template de
// pages/matriculas/[id].vue. São dois casos porque o parecer tem dois regimes:
// o laudo completo e a matrícula incompleta, em que quase tudo é suprimido.

import type { Documento } from './parecer.ts'

export const documentoCompleto: Documento = {
  cabecalho: {
    titulo: 'Certidão de inteiro teor',
    numero_matricula: '12.345',
    cartorio: '1º Oficial de Registro de Imóveis de São Paulo',
    data_abertura: '14/03/1978',
    livro_folha: 'Livro 2 / Fl. 88',
    matricula_anterior: '4.001',
    sql_iptu: '012.345.6789-0',
    classificacao_risco: 'alto',
    certidao: { detectada: true, data: '21/03/2024', hora: '14:32', situacao: 'atual' },
    matricula_incompleta: false,
  },
  imovel: {
    endereco: 'Rua das Acácias, 210 — Vila Mariana, São Paulo/SP',
    area_total_display: '360,00 m²',
    area_construida_display: '182,50 m²',
    testada: '12,00 m',
    tem_onus_display: 'Sim — 2 ativos',
    confrontantes: { frente: 'Rua das Acácias', fundos: 'Lote 14' },
    confrontantes_descricao: [],
  },
  proprietarios: {
    titulo_aquisitivo_lido: true,
    lista: [
      {
        ordem: 1,
        nome: 'Maria Alves de Souza',
        documento_tipo: 'CPF',
        documento_numero: '123.456.789-00',
        estado_civil: 'Casada',
        regime_bens: 'Comunhão parcial de bens',
        ato_aquisitivo: 'R.7',
        data_aquisicao: '02/09/2015',
        percentual: '50%',
      },
    ],
    promissarios: {
      lista: [
        {
          ordem: 1,
          nome: 'Construtora Horizonte Ltda.',
          natureza: 'Promitente compradora',
          documento_tipo: 'CNPJ',
          documento_numero: '11.222.333/0001-44',
        },
      ],
    },
  },
  parecer: {
    classificacao_risco: 'alto',
    texto:
      'A matrícula apresenta hipoteca ativa em favor de instituição financeira e penhora ' +
      'oriunda de execução fiscal, ambas sem baixa registrada.',
  },
  analise_juridica: {
    resumo_executivo: 'Imóvel com dois gravames ativos e cadeia dominial íntegra.',
    riscos_html: '<ul><li>Hipoteca <strong>ativa</strong> (R.9)</li><li>Penhora ativa (Av.11)</li></ul>',
    inconsistencias_html: '<p>Divergência de 0,4 m² entre a área descrita e a averbada.</p>',
    problemas_html: '<p>Execução fiscal em curso.</p>',
    cadeia_dominial_html: '<p>Cadeia íntegra desde a abertura.</p>',
    fundamentacao_html: '<p>Art. 1.473 do Código Civil.</p>',
  },
  historico_atos: {
    total: 2,
    lista: [
      {
        sequencia: 'R.7',
        tipo_label: 'Compra e venda',
        partes: 'João Pereira → Maria Alves de Souza',
        valor_display: 'R$ 480.000,00',
        data: '02/09/2015',
        status: 'ativo',
      },
      {
        sequencia: 'R.3',
        tipo_label: 'Compra e venda',
        partes: 'Antônio Dias → João Pereira',
        valor: '12.000.000',
        moeda: 'Cr$',
        ano_valor: 1966,
        data: '11/05/1966',
        status: 'cancelado',
        cancelado_por: 'Av.4',
      },
    ],
  },
  onus: {
    total: 2,
    ativos: [
      {
        sequencia: 'R.9',
        tipo_label: 'Hipoteca',
        partes: 'Banco Exemplo S.A.',
        valor_display: 'R$ 300.000,00',
        data: '15/01/2019',
      },
      {
        sequencia: 'Av.11',
        tipo_label: 'Penhora',
        partes: 'Fazenda Nacional',
        data: '07/06/2022',
      },
    ],
  },
  metadados: {
    data_extracao: '21/03/2024',
    total_paginas: 6,
    validacao: { avisos: ['Página 4 com baixa qualidade de digitalização.'] },
  },
}

export const documentoIncompleto: Documento = {
  cabecalho: {
    numero_matricula: '98.765',
    cartorio: '2º Oficial de Registro de Imóveis de Campinas',
    // O pipeline ainda classifica; o parecer é que não sai. Se a supressão
    // falhar, é justamente este valor que vaza para o documento.
    classificacao_risco: 'medio',
    certidao: { detectada: false, posterior_a: '30/11/2021' },
    matricula_incompleta: true,
    aviso_matricula_incompleta:
      'O documento enviado contém 3 das 8 páginas declaradas pela certidão.',
  },
  integridade: {
    completo: false,
    paginas_lidas: 3,
    paginas_declaradas: 8,
    atos_faltantes: ['R.5', 'R.6', 'Av.7'],
    atos_apenas_citados: ['R.4'],
  },
  imovel: {
    endereco: 'Rua Bento Carlos, 55 — Campinas/SP',
    area_total_display: '250,00 m²',
    tem_onus_display: 'Indeterminado',
    confrontantes: {},
    // Sem rumo cardeal: a divisa sai como a matrícula escreveu
    confrontantes_descricao: [
      { lado: 'de um lado', confrontante: 'com o lote 12' },
      { lado: 'de outro lado', confrontante: 'com o lote 14' },
    ],
  },
  proprietarios: {
    // O ato aquisitivo não consta das páginas recebidas
    titulo_aquisitivo_lido: false,
    lista: [{ ordem: 1, nome: 'Carlos Eduardo Ramos', documento_tipo: 'CPF', documento_numero: '987.654.321-00' }],
  },
  parecer: { classificacao_risco: 'medio', texto: 'Não deveria aparecer no documento.' },
  analise_juridica: {
    resumo_executivo: 'Resumo que não deve sair em matrícula incompleta.',
    riscos_html: '<p>Risco que não deve sair.</p>',
    inconsistencias_html: '<ul><li>Faltam as páginas 4 a 8.</li></ul>',
    problemas_html: '<p>Problema que não deve sair.</p>',
    cadeia_dominial_html: '<p>Cadeia que não deve sair.</p>',
    fundamentacao_html: '<p>Fundamentação que não deve sair.</p>',
  },
  historico_atos: {
    total: 1,
    lista: [
      {
        sequencia: 'R.3',
        tipo_label: 'Compra e venda',
        partes: 'Espólio de Ana Ramos → Carlos Eduardo Ramos',
        data: '30/11/2021',
        status: 'ativo',
      },
    ],
  },
  onus: { total: 0, ativos: [] },
  metadados: { data_extracao: '02/08/2026', total_paginas: 3 },
}
