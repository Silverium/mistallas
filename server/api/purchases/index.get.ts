import { and, eq, inArray } from 'drizzle-orm'
import { tables, useDB } from '../../utils/db'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const db = useDB()

  const purchases = await db
    .select()
    .from(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.userId, user.id))
    .all()

  const purchaseIds = purchases.map(purchase => purchase.id)

  if (!purchaseIds.length) {
    return []
  }

  const photos = await db
    .select({
      purchaseEventId: tables.purchasePhotos.purchaseEventId,
      slot: tables.purchasePhotos.slot
    })
    .from(tables.purchasePhotos)
    .where(and(
      eq(tables.purchasePhotos.userId, user.id),
      inArray(tables.purchasePhotos.purchaseEventId, purchaseIds)
    ))
    .all()

  const slotsByPurchaseId = new Map<number, number[]>()

  for (const photo of photos) {
    const purchaseId = Number(photo.purchaseEventId)
    const slot = Number(photo.slot)
    const currentSlots = slotsByPurchaseId.get(purchaseId) ?? []
    currentSlots.push(slot)
    slotsByPurchaseId.set(purchaseId, currentSlots)
  }

  return purchases
    .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())
    .map(purchase => ({
      ...purchase,
      photoSlots: (slotsByPurchaseId.get(Number(purchase.id)) ?? []).sort((a, b) => a - b)
    }))
})
