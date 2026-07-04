import { Storage } from '@google-cloud/storage'

let _storage: Storage | null = null

function getStorage(): Storage {
  if (_storage) return _storage

  const keyJson = process.env.GOOGLE_CLOUD_SA_KEY_JSON || process.env.NUXT_GOOGLE_CLOUD_SA_KEY_JSON
  if (!keyJson) throw new Error('GOOGLE_CLOUD_SA_KEY_JSON not configured')

  const key = JSON.parse(keyJson)
  _storage = new Storage({
    projectId: key.project_id,
    credentials: {
      client_email: key.client_email,
      private_key: key.private_key,
    },
  })
  return _storage
}

function getBucketName(): string {
  return process.env.GCS_BUCKET_NAME || process.env.NUXT_GCS_BUCKET_NAME || 'lidimus-job-files'
}

export async function uploadToGcs(
  jobId: string,
  filename: string,
  content: Buffer,
  mimeType: string,
): Promise<string> {
  const storage = getStorage()
  const gcsPath = `jobs/${jobId}/${filename}`
  await storage.bucket(getBucketName()).file(gcsPath).save(content, {
    contentType: mimeType,
    metadata: { cacheControl: 'no-store' },
  })
  return gcsPath
}

export async function generateSignedUrl(gcsPath: string, expiresInMinutes = 60): Promise<string> {
  const storage = getStorage()
  const expires = Date.now() + expiresInMinutes * 60 * 1000
  const [url] = await storage
    .bucket(getBucketName())
    .file(gcsPath)
    .getSignedUrl({ version: 'v4', action: 'read', expires })
  return url
}

export async function deleteFromGcs(gcsPath: string): Promise<void> {
  try {
    await getStorage().bucket(getBucketName()).file(gcsPath).delete({ ignoreNotFound: true })
  } catch {
    // lifecycle do bucket garante limpeza após 7 dias
  }
}
