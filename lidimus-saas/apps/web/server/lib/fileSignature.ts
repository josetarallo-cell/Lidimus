// Valida a assinatura (magic bytes) do arquivo enviado antes de debitar
// créditos ou enfileirar processamento — o MIME type declarado pelo cliente
// não é confiável, e um binário incompatível só falharia (com custo) lá na
// frente, no OCR/Document AI.

export function assertPdfSignature(data: Uint8Array): void {
  const header = Buffer.from(data.subarray(0, 5)).toString('latin1')
  if (header !== '%PDF-') {
    throw createError({ statusCode: 415, statusMessage: 'Arquivo não é um PDF válido.' })
  }
}

export function assertKmlSignature(data: Uint8Array): void {
  const text = Buffer.from(data.subarray(0, 512))
    .toString('utf8')
    .replace(/^﻿/, '')
    .trimStart()
  if (!text.startsWith('<?xml') && !text.startsWith('<kml')) {
    throw createError({ statusCode: 415, statusMessage: 'Arquivo não é um KML válido.' })
  }
}
