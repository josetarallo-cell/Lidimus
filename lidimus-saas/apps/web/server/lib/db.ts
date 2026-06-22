import { createDb } from '@lidimus/db'

let _db: ReturnType<typeof createDb> | null = null

export function useDb() {
  if (!_db) {
    const config = useRuntimeConfig()
    if (!config.databaseUrl) throw new Error('DATABASE_URL not configured')
    _db = createDb(config.databaseUrl)
  }
  return _db
}
