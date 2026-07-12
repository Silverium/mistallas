import { and, eq } from 'drizzle-orm'
import { useValidatedParams, zh } from 'h3-zod'

export default eventHandler(async (event) => {
  const { id } = await useValidatedParams(event, {
    id: zh.intAsString
  })
  const { user } = await requireUserSession(event)

  await useDB().delete(tables.purchaseMeasurementSnapshots).where(and(
    eq(tables.purchaseMeasurementSnapshots.purchaseEventId, id),
    eq(tables.purchaseMeasurementSnapshots.userId, user.id)
  ))

  // Cleanup associated purchase photos from R2 and D1 to prevent orphaned files/records
  const photos = await useDB().select({ id: tables.purchasePhotos.id, storageKey: tables.purchasePhotos.storageKey })
    .from(tables.purchasePhotos)
    .where(and(eq(tables.purchasePhotos.purchaseEventId, id), eq(tables.purchasePhotos.userId, user.id)))
    .all()

  if (photos.length > 0) {
    const bucket = event.context.cloudflare?.env?.PURCHASE_PHOTOS
      ? event.context.cloudflare.env.PURCHASE_PHOTOS
      : event.context.cloudflare?.env?.PHOTOS
        ? event.context.cloudflare.env.PHOTOS
        : null

    if (bucket) {
      await Promise.all(photos.map(photo => bucket.delete(photo.storageKey)))
    }

    await useDB().delete(tables.purchasePhotos).where(and(
      eq(tables.purchasePhotos.purchaseEventId, id),
      eq(tables.purchasePhotos.userId, user.id)
    ))
  }

  const deletedPurchase = await useDB().delete(tables.purchaseEvents).where(and(
    eq(tables.purchaseEvents.id, id),
    eq(tables.purchaseEvents.userId, user.id)
  )).returning().get()

  if (!deletedPurchase) {
    throw createError({
      statusCode: 404,
      message: 'Purchase not found'
    })
  }

  return deletedPurchase
})
