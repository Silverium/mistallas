import { eq, and, like, inArray } from 'drizzle-orm'
import { requireAdminAccess } from '../../../../../utils/admin'
import { tables, useDB } from '../../../../../utils/db'

export default eventHandler(async (event) => {
  await requireAdminAccess(event)

  const userId = decodeURIComponent(getRouterParam(event, 'id') || '')
  if (!userId) {
    throw createError({ statusCode: 400, message: 'Missing user ID' })
  }

  const db = useDB()

  // Verify target user exists
  const targetUser = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!targetUser) {
    throw createError({ statusCode: 404, message: 'Target user not found' })
  }

  // Find all test purchases (marked with "Bulk test purchase" in notes)
  const testPurchases = await db
    .select({ id: tables.purchaseEvents.id })
    .from(tables.purchaseEvents)
    .where(and(
      eq(tables.purchaseEvents.userId, userId),
      like(tables.purchaseEvents.notes, 'Bulk test purchase%')
    ))
    .all()

  if (!testPurchases.length) {
    return {
      deleted: 0,
      message: 'No test purchases found for this user'
    }
  }

  const testPurchaseIds = testPurchases.map(p => p.id)

  // Delete measurement snapshots for test purchases
  const deletedSnapshots = await db
    .delete(tables.purchaseMeasurementSnapshots)
    .where(inArray(tables.purchaseMeasurementSnapshots.purchaseEventId, testPurchaseIds))
    .returning()
    .all()

  // Delete photos for test purchases
  const deletedPhotos = await db
    .delete(tables.purchasePhotos)
    .where(inArray(tables.purchasePhotos.purchaseEventId, testPurchaseIds))
    .returning()
    .all()

  // Delete test purchases
  const deletedPurchases = await db
    .delete(tables.purchaseEvents)
    .where(and(
      eq(tables.purchaseEvents.userId, userId),
      like(tables.purchaseEvents.notes, 'Bulk test purchase%')
    ))
    .returning()
    .all()

  return {
    deleted: deletedPurchases.length,
    deletedSnapshots: deletedSnapshots.length,
    deletedPhotos: deletedPhotos.length,
    userId,
    message: `Deleted ${deletedPurchases.length} test purchases and related data for user ${userId}`
  }
})
