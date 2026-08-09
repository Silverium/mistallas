import { eq, and } from 'drizzle-orm'
import { useValidatedParams, z } from 'h3-zod'
import { tables, useDB } from '@root/server/utils/db'

export default eventHandler(async (event) => {
  const params = await useValidatedParams(event, {
    id: z.coerce.number().int(),
    slot: z.coerce.number().int()
  })

  const { id, slot } = params

  if (slot < 1 || slot > 3) {
    throw createError({ statusCode: 400, message: 'Slot must be between 1 and 3' })
  }

  const { user } = await requireUserSession(event)

  // 1. Verify ownership
  const db = useDB()
  const photo = await db.select().from(tables.purchasePhotos).where(
    and(
      eq(tables.purchasePhotos.purchaseEventId, id),
      eq(tables.purchasePhotos.userId, user.id),
      eq(tables.purchasePhotos.slot, slot)
    )
  ).get()

  if (!photo) {
    throw createError({ statusCode: 404, message: 'Photo not found' })
  }

  // 2. Delete from R2 and D1
  const bucket = event.context.cloudflare?.env?.PURCHASE_PHOTOS
    ? event.context.cloudflare.env.PURCHASE_PHOTOS
    : event.context.cloudflare?.env?.PHOTOS
      ? event.context.cloudflare.env.PHOTOS
      : null

  if (bucket) {
    await bucket.delete(photo.storageKey)
  }

  await db.delete(tables.purchasePhotos).where(eq(tables.purchasePhotos.id, photo.id))

  return { success: true }
})
