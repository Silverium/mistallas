import { asc, desc } from 'drizzle-orm'
import { tables, useDB } from '@root/server/utils/db'

export default eventHandler(async (event) => {
  await requireUserSession(event)

  try {
    const rows = await useDB().select().from(tables.categories)
      .orderBy(desc(tables.categories.verified), asc(tables.categories.name))
      .all()

    return {
      categories: rows.map(row => ({
        id: row.id,
        name: row.name,
        verified: Boolean(row.verified)
      }))
    }
  }
  catch (error) {
    console.error('[purchases.categories.get] Unexpected failure, returning empty result.', error)
    return { categories: [] }
  }
})
