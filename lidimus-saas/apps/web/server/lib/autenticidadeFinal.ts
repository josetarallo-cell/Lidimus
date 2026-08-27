// Funde as três metades do verificador de autenticidade de documento — ver o
// plano, seção "Arquitetura":
//
//   worker  → stage_data.autenticidade.{pericia,qr}   (perícia do arquivo + QR)
//   n8n     → stage_data.ocr.ancoras.{selo,cnm}        (regex sobre texto_ocr)
//   aqui    → consulta a ONR (se o link aparecer no texto) + veredito final
//
// O ponto de junção é o callback do estágio 'juridico', e não o do 'ocr':
// cartório e número da matrícula só existem depois que o jurídico os extrai do
// texto, e são eles que habilitam os cruzamentos mais fortes (cabeçalho × ONR,
// número da matrícula × CNM). Nunca bloqueia: qualquer falha devolve null e o
// pipeline segue — o verificador documenta, não decide se a análise sai.

import {
  calcularAutenticidade,
  consultarOnr,
  extrairCodigoOnrDoTexto,
  seloDoQr,
} from '@lidimus/autenticidade'
import type { Ancoras, Autenticidade, PericiaArquivo, QrSelo } from '@lidimus/autenticidade'

export type OpcoesAutenticidadeFinal = {
  onrHabilitado: boolean
}

export async function computarAutenticidadeFinal(
  stageData: Record<string, unknown>,
  resultadoJuridico: Record<string, unknown>,
  opcoes: OpcoesAutenticidadeFinal,
): Promise<Autenticidade | null> {
  try {
    const bruto = stageData.autenticidade as
      | { pericia?: PericiaArquivo; qr?: QrSelo | null }
      | undefined
    const pericia = bruto?.pericia
    // Sem a perícia do worker não há o que combinar — acontece quando o
    // download do GCS ou o parser falharam no worker (ver
    // matricula-ocr.worker.ts); o job já segue sem o verificador nesse caso.
    if (!pericia) return null

    const ocr = stageData.ocr as Record<string, unknown> | undefined
    const ancorasDoTexto = (ocr?.ancoras as Ancoras | undefined) ?? { selo: null, cnm: null }
    const textoOcr = String(ocr?.texto_ocr ?? '')

    // QR é fonte primária do selo quando os dois aparecem (§3 do plano): imune
    // a erro de OCR. O CNM só existe no texto — não há QR para ele.
    const selo = bruto?.qr?.selo25 ? seloDoQr(bruto.qr.selo25) : ancorasDoTexto.selo
    const ancoras: Ancoras = { selo, cnm: ancorasDoTexto.cnm }

    const onrCodigo = extrairCodigoOnrDoTexto(textoOcr)
    const onr = onrCodigo ? await consultarOnr(onrCodigo, { habilitado: opcoes.onrHabilitado }) : null

    const cartorio = typeof resultadoJuridico.cartorio === 'string' ? resultadoJuridico.cartorio : null
    const numeroMatriculaRaw = resultadoJuridico.numero_matricula
    const numeroMatricula =
      typeof numeroMatriculaRaw === 'string' || typeof numeroMatriculaRaw === 'number'
        ? String(numeroMatriculaRaw)
        : null

    return calcularAutenticidade({
      pericia,
      ancoras,
      onr,
      onrCodigo,
      cabecalho: { cartorio, numeroMatricula },
    })
  } catch (err) {
    console.warn('[autenticidade] falha ao calcular o veredito final, seguindo sem ele:', err)
    return null
  }
}
