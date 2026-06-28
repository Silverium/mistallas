import { eq } from 'drizzle-orm'

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const brand = typeof query.brand === 'string' ? query.brand : undefined
  const productType = typeof query.productType === 'string' ? query.productType : undefined
  const sizeLabel = typeof query.sizeLabel === 'string' ? query.sizeLabel : undefined
  const { user } = await requireUserSession(event)

  const purchases = await useDB().select().from(tables.purchaseEvents).where(eq(tables.purchaseEvents.userId, user.id)).all()
  const sortedPurchases = purchases.sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())

  const match = sortedPurchases.find((purchase) => {
    const brandOk = brand ? purchase.brand.toLowerCase() === brand.toLowerCase() : true
    const typeOk = productType ? purchase.productType.toLowerCase() === productType.toLowerCase() : true
    const sizeOk = sizeLabel ? purchase.sizeLabel.toLowerCase() === sizeLabel.toLowerCase() : true
    return brandOk && typeOk && sizeOk
  }) ?? sortedPurchases[0]

  if (!match) {
    throw createError({
      statusCode: 404,
      message: 'No purchases found for comparison'
    })
  }

  return sendRedirect(event, `/api/purchases/${match.id}/compare`)
})
