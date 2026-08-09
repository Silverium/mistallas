import { and, eq } from 'drizzle-orm'
import { useValidatedParams, zh } from 'h3-zod'
import { tables, useDB } from '@root/server/utils/db'

export default eventHandler(async (event) => {
  try {
    const { id } = await useValidatedParams(event, {
      id: zh.intAsString
    })
    const { user } = await requireUserSession(event)

    const purchase = await useDB().select({ id: tables.purchaseEvents.id }).from(tables.purchaseEvents).where(and(
      eq(tables.purchaseEvents.id, id),
      eq(tables.purchaseEvents.userId, user.id)
    )).get()

    if (!purchase) {
      throw createError({
        statusCode: 404,
        message: 'Purchase not found'
      })
    }

    const photos = await useDB().select({
      id: tables.purchasePhotos.id,
      slot: tables.purchasePhotos.slot
    }).from(tables.purchasePhotos).where(and(
      eq(tables.purchasePhotos.purchaseEventId, id),
      eq(tables.purchasePhotos.userId, user.id)
    )).all()

    const payload = photos
      .sort((a, b) => Number(a.slot) - Number(b.slot))
      .map(photo => ({
        id: Number(photo.id),
        slot: Number(photo.slot)
      }))

    return new Response(JSON.stringify(payload), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, no-store'
      }
    })
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Failed to list purchase photos:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to list purchase photos'
    })
  }
})
