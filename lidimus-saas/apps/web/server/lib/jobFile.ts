import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobFiles } from '@lidimus/db'

export function generateAccessToken(): string {
  return randomBytes(32).toString('hex')
}

export function buildFileUrl(baseUrl: string, jobId: string, token: string): string {
  return `${baseUrl}/api/jobs/${jobId}/file?token=${token}`
}

// Salva o binário e devolve { fileId, accessToken, fileUrl }
export async function storeJobFile(
  db: Db,
  jobId: string,
  content: Buffer,
  mimeType: string,
  originalName: string,
  baseUrl: string,
) {
  const accessToken = generateAccessToken()

  const [file] = await db
    .insert(jobFiles)
    .values({
      jobId,
      content: content as unknown as string,
      mimeType,
      originalName,
      accessToken,
    })
    .returning({ id: jobFiles.id })

  return {
    fileId: file.id,
    accessToken,
    fileUrl: buildFileUrl(baseUrl, jobId, accessToken),
  }
}

// Marca o arquivo como deletado (o GC pode limpar a coluna content futuramente)
export async function softDeleteJobFile(db: Db, jobId: string) {
  await db
    .update(jobFiles)
    .set({ deletedAt: new Date() })
    .where(eq(jobFiles.jobId, jobId))
}
