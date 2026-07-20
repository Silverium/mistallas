import { and, eq, inArray, desc } from 'drizzle-orm'
import { useValidatedQuery, z } from 'h3-zod'
import { tables, useDB } from '../../utils/db'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const query = await useValidatedQuery(event, {
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })

  const db = useDB()

  // Get total count for pagination
  const countResult = await db
    .select()
    .from(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.userId, user.id))
    .all()

  const totalCount = countResult.length
  const totalPages = Math.ceil(totalCount / query.limit)
  const offset = (query.page - 1) * query.limit

  // Get paginated purchases
  const purchases = await db
    .select()
    .from(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.userId, user.id))
    .orderBy(desc(tables.purchaseEvents.purchasedAt))
    .limit(query.limit)
    .offset(offset)
    .all()

  const purchaseIds = purchases.map(purchase => purchase.id)

  if (!purchaseIds.length) {
    return {
      purchases: [],
      pagination: {
        page: query.page,
        limit: query.limit,
        total: totalCount,
        totalPages
      }
    }
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

  return {
    purchases: purchases
      .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())
      .map(purchase => ({
        ...purchase,
        photoSlots: (slotsByPurchaseId.get(Number(purchase.id)) ?? []).sort((a, b) => a - b)
      })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: totalCount,
      totalPages
    }
  }
})
