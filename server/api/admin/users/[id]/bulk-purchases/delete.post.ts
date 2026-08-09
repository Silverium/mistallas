import { eq, and, like, inArray } from 'drizzle-orm'
import { requireAdminAccess } from '@root/server/utils/admin'
import { tables, useDB } from '@root/server/utils/db'

const D1_IN_CLAUSE_CHUNK_SIZE = 100

const chunkIds = <T>(items: T[], chunkSize: number) => {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }

  return chunks
}

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
  const purchaseIdChunks = chunkIds(testPurchaseIds, D1_IN_CLAUSE_CHUNK_SIZE)

  // Delete measurement snapshots for test purchases
  let deletedSnapshotsCount = 0
  for (const idsChunk of purchaseIdChunks) {
    const deletedSnapshotsChunk = await db
      .delete(tables.purchaseMeasurementSnapshots)
      .where(inArray(tables.purchaseMeasurementSnapshots.purchaseEventId, idsChunk))
      .returning({ id: tables.purchaseMeasurementSnapshots.id })
      .all()

    deletedSnapshotsCount += deletedSnapshotsChunk.length
  }

  // Delete photos for test purchases
  let deletedPhotosCount = 0
  for (const idsChunk of purchaseIdChunks) {
    const deletedPhotosChunk = await db
      .delete(tables.purchasePhotos)
      .where(inArray(tables.purchasePhotos.purchaseEventId, idsChunk))
      .returning({ id: tables.purchasePhotos.id })
      .all()

    deletedPhotosCount += deletedPhotosChunk.length
  }

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
    deletedSnapshots: deletedSnapshotsCount,
    deletedPhotos: deletedPhotosCount,
    userId,
    message: `Deleted ${deletedPurchases.length} test purchases and related data for user ${userId}`
  }
})
