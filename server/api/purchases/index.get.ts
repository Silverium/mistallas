import { eq } from 'drizzle-orm'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const purchases = await useDB().select().from(tables.purchaseEvents).where(eq(tables.purchaseEvents.userId, user.id)).all()

  return purchases.sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())
})
