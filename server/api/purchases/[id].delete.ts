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
