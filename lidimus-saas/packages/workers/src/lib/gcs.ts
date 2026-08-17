// Acesso ao GCS pelo worker: só ler e apagar.
//
// O módulo completo (upload, URL assinada, exclusão lógica) vive no app, em
// apps/web/server/lib/gcs.ts, e continua sendo o dono do ciclo de vida do
// arquivo. Aqui existe o mínimo porque o worker de revisão é quem tem o PDF na
// mão no único momento em que ele ainda é necessário — entre o OCR e o recorte —
// e é ele quem apaga o binário logo em seguida.
//
// Fazer isso pelo app significaria devolver o PDF ao container que atende a
// tela, ou adiar a exclusão até a revisão fechar. Nenhum dos dois vale: o
// binário morre no mesmo instante de sempre, poucos segundos depois da leitura.

import { Storage } from '@google-cloud/storage'

let _storage: Storage | null = null

function getStorage(): Storage {
  if (_storage) return _storage

  const keyJson = process.env.GOOGLE_CLOUD_SA_KEY_JSON || process.env.NUXT_GOOGLE_CLOUD_SA_KEY_JSON
  if (!keyJson) throw new Error('GOOGLE_CLOUD_SA_KEY_JSON not configured')

  const key = JSON.parse(keyJson)
  _storage = new Storage({
    projectId: key.project_id,
    credentials: { client_email: key.client_email, private_key: key.private_key },
  })
  return _storage
}

function bucket() {
  const nome = process.env.GCS_BUCKET_NAME || process.env.NUXT_GCS_BUCKET_NAME || 'lidimus-job-files'
  return getStorage().bucket(nome)
}

export async function baixarDoGcs(gcsPath: string): Promise<Buffer> {
  const [conteudo] = await bucket().file(gcsPath).download()
  return conteudo
}

export async function apagarDoGcs(gcsPath: string): Promise<void> {
  try {
    await bucket().file(gcsPath).delete({ ignoreNotFound: true })
  } catch {
    // o lifecycle de 7 dias do bucket é a rede de segurança
  }
}
