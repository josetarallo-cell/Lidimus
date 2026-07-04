import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import type { Db } from '@lidimus/db'
import { jobFiles } from '@lidimus/db'
import { uploadToGcs, generateSignedUrl, deleteFromGcs } from './gcs'

export function generateAccessToken(): string {
  return randomBytes(32).toString('hex')
}

export function buildFileUrl(baseUrl: string, jobId: string, token: string): string {
  return `${baseUrl}/api/jobs/${jobId}/file?token=${token}`
}

export async function storeJobFile(
  db: Db,
  jobId: string,
  content: Buffer,
  mimeType: string,
  originalName: string,
  baseUrl: string,
) {
  const accessToken = generateAccessToken()
  const gcsPath = await uploadToGcs(jobId, originalName, content, mimeType)

  const [file] = await db
    .insert(jobFiles)
    .values({ jobId, gcsPath, mimeType, originalName, accessToken })
    .returning({ id: jobFiles.id })

  return {
    fileId: file.id,
    accessToken,
    fileUrl: buildFileUrl(baseUrl, jobId, accessToken),
  }
}

export async function getJobFileSignedUrl(
  db: Db,
  jobId: string,
  token: string,
): Promise<{ signedUrl: string; mimeType: string; originalName: string } | null> {
  const [file] = await db
    .select()
    .from(jobFiles)
    .where(eq(jobFiles.jobId, jobId))
    .limit(1)

  if (!file || file.accessToken !== token || file.deletedAt) return null

  const signedUrl = await generateSignedUrl(file.gcsPath)
  return { signedUrl, mimeType: file.mimeType, originalName: file.originalName }
}

export async function softDeleteJobFile(db: Db, jobId: string) {
  const [file] = await db
    .select({ gcsPath: jobFiles.gcsPath })
    .from(jobFiles)
    .where(eq(jobFiles.jobId, jobId))
    .limit(1)

  if (file?.gcsPath) await deleteFromGcs(file.gcsPath)

  await db
    .update(jobFiles)
    .set({ deletedAt: new Date() })
    .where(eq(jobFiles.jobId, jobId))
}
