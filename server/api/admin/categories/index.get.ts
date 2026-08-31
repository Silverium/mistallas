import { asc, sql } from 'drizzle-orm'
import { requireAdminAccess } from '@root/server/utils/admin'
import { tables, useDB } from '@root/server/utils/db'

export default eventHandler(async (event) => {
  await requireAdminAccess(event)
  const db = useDB()

  const categoryRows = await db.select().from(tables.categories)
    .orderBy(asc(tables.categories.verified), asc(tables.categories.name))
    .all()

  const usageRows = await db.select({
    category: tables.purchaseEvents.category,
    count: sql<number>`count(*)`
  })
    .from(tables.purchaseEvents)
    .groupBy(tables.purchaseEvents.category)
    .all()

  const usageByName = new Map(usageRows.map(row => [row.category, row.count]))

  return {
    categories: categoryRows.map(row => ({
      id: row.id,
      name: row.name,
      verified: Boolean(row.verified),
      createdByUserId: row.createdByUserId,
      usageCount: usageByName.get(row.name) ?? 0
    }))
  }
})
