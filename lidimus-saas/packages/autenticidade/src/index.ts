// Verificador de autenticidade de documento — o que dá para saber sobre a
// procedência de uma matrícula além do que ela diz de si mesma. Nunca bloqueia
// a leitura: só classifica e documenta (ver `veredito.ts`).

export { analisarPdf, detectarPaginasHeterogeneas } from './arquivo.ts'
export type { OpcoesAnalisarPdf } from './arquivo.ts'
export { calcularDvLuhnModN, luhnModNFecha } from './luhn.ts'
export { calcularDvIso7064, iso7064Fecha } from './iso7064.ts'
export { extrairCnm, extrairSelo, seloDoQr, tentarComCorrecaoDv } from './ancoras.ts'
export { decodificarQrDeBuffer, lerQrDoPdf, parseUrlSeloTjsp } from './qr.ts'
export { consultarOnr, extrairCodigoOnrDoTexto, limparCacheOnr } from './onr.ts'
export type { OpcoesConsultaOnr } from './onr.ts'
export { calcularAutenticidade } from './veredito.ts'
export type { CabecalhoLido, EntradaVeredito } from './veredito.ts'
export type {
  Ancoras,
  Autenticidade,
  Classificacao,
  Cnm,
  CodigoIndicioArquivo,
  ConsultaOnr,
  ContagensPdf,
  Indicio,
  InfoPdf,
  PericiaArquivo,
  PesoIndicio,
  QrSelo,
  RespostaOnr,
  SeloTjsp,
  StatusOnr,
  XmpPdf,
} from './tipos.ts'
