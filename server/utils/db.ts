import { drizzle } from 'drizzle-orm/d1'
import type { D1Database } from '@cloudflare/workers-types'
import * as schema from '../database/schema'

export { sql, eq, and, or } from 'drizzle-orm'
export const tables = schema

let dbInstance: ReturnType<typeof drizzle> | null = null

export function useDB() {
  if (dbInstance) return dbInstance

  if (process.env.NODE_ENV === 'production') {
    const db = process.env.DB as unknown as D1Database
    if (!db) throw new Error('Cloudflare D1 binding "DB" is missing in process.env')
    dbInstance = drizzle(db, { schema })
    return dbInstance
  }

  // Local dev: use Nitro's experimental DB layer
  const fakeD1 = useDatabase('devDatabase') as unknown as D1Database
  dbInstance = drizzle(fakeD1, { schema })
  return dbInstance
}
