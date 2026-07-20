import { and, eq, inArray, desc } from 'drizzle-orm'
import { useValidatedQuery, z } from 'h3-zod'
import { calculateMultiWordSearchScore } from '../../utils/fuzzy-search'
import { tables, useDB } from '../../utils/db'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const query = await useValidatedQuery(event, {
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional()
  })

  const db = useDB()

  // Get all purchases for the user
  const purchases = await db
    .select()
    .from(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.userId, user.id))
    .orderBy(desc(tables.purchaseEvents.purchasedAt))
    .all()

  // Filter by search term if provided (using fuzzy search)
  let filtered = purchases
  if (query.search?.trim()) {
    const words = query.search.trim().split(/\s+/).filter(Boolean)
    filtered = purchases
      .map(purchase => ({
        purchase,
        score: calculateMultiWordSearchScore(purchase, words)
      }))
      .filter(item => item.score >= 0.2) // Only include matches with score >= 0.2
      .sort((a, b) => b.score - a.score) // Sort by relevance
      .map(item => item.purchase)
  }

  const totalCount = filtered.length
  const totalPages = Math.ceil(totalCount / query.limit)
  const offset = (query.page - 1) * query.limit

  // Apply pagination
  const paginatedPurchases = filtered.slice(offset, offset + query.limit)

  const purchaseIds = paginatedPurchases.map(purchase => purchase.id)

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
    purchases: paginatedPurchases
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
