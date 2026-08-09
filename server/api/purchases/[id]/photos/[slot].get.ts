import { eq, and } from 'drizzle-orm'
import { useValidatedParams, z, zh } from 'h3-zod'
import { tables, useDB } from '@root/server/utils/db'

export default eventHandler(async (event) => {
  const { id, slot } = await useValidatedParams(event, {
    slot: z.coerce.number().int().min(1).max(3),
    id: zh.intAsString
  })
  const { user } = await requireUserSession(event)

  const photo = await useDB().select().from(tables.purchasePhotos).where(and(
    eq(tables.purchasePhotos.purchaseEventId, id),
    eq(tables.purchasePhotos.userId, user.id),
    eq(tables.purchasePhotos.slot, slot)
  )).get()

  if (!photo) {
    throw createError({ statusCode: 404, message: 'Photo not found' })
  }

  const bucket = event.context.cloudflare?.env?.PURCHASE_PHOTOS
    ? event.context.cloudflare.env.PURCHASE_PHOTOS
    : event.context.cloudflare?.env?.PHOTOS
      ? event.context.cloudflare.env.PHOTOS
      : null

  if (!bucket) {
    throw createError({ statusCode: 500, message: 'R2 bucket not configured' })
  }

  const object = await bucket.get(photo.storageKey)
  if (!object || !object.body) {
    throw createError({ statusCode: 404, message: 'Photo file not found' })
  }

  setHeader(event, 'Content-Type', object.httpMetadata?.contentType || photo.mimeType)
  setHeader(event, 'Cache-Control', 'private, no-store')

  return object.body
})
