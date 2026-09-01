import { and, eq } from 'drizzle-orm'
import { useValidatedBody, useValidatedParams, z, zh } from 'h3-zod'

export default eventHandler(async (event) => {
  const { id } = await useValidatedParams(event, {
    id: zh.intAsString
  })
  const input = await useValidatedBody(event, {
    brand: z.string().min(1).max(120),
    category: z.string().min(1).max(60),
    productType: z.string().min(1).max(120),
    sizeLabel: z.string().min(1).max(30),
    fitFeedback: z.string().min(1).max(120).optional(),
    notes: z.string().max(500).optional(),
    price: z.coerce.number().min(0).optional()
  })
  const { user } = await requireUserSession(event)

  const category = await resolveCategoryName(input.category, user.id)

  const purchase = await useDB().update(tables.purchaseEvents).set({
    brand: input.brand,
    category,
    productType: input.productType,
    sizeLabel: input.sizeLabel,
    fitFeedback: input.fitFeedback ?? null,
    notes: input.notes ?? null,
    price: input.price ?? null
  }).where(and(
    eq(tables.purchaseEvents.id, id),
    eq(tables.purchaseEvents.userId, user.id)
  )).returning().get()

  if (!purchase) {
    throw createError({
      statusCode: 404,
      message: 'Purchase not found'
    })
  }

  return purchase
})
