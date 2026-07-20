import { and, eq, inArray, desc } from 'drizzle-orm'
import { useValidatedQuery, z } from 'h3-zod'
import { tables, useDB } from '../../utils/db'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const query = await useValidatedQuery(event, {
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional()
  })

  const db = useDB()

  // Get total count for pagination
  const countResult = await db
    .select()
    .from(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.userId, user.id))
    .all()

  const totalCount = query.search?.trim()
    ? countResult.filter((purchase) => {
      const searchTerm = query.search!.toLowerCase()
      return (
        purchase.brand.toLowerCase().includes(searchTerm)
        || purchase.category.toLowerCase().includes(searchTerm)
        || purchase.productType.toLowerCase().includes(searchTerm)
        || purchase.sizeLabel.toLowerCase().includes(searchTerm)
        || (purchase.fitFeedback?.toLowerCase().includes(searchTerm) ?? false)
        || (purchase.notes?.toLowerCase().includes(searchTerm) ?? false)
      )
    }).length
    : countResult.length

  const totalPages = Math.ceil(totalCount / query.limit)
  const offset = (query.page - 1) * query.limit

  // Get paginated purchases (filter in application for now)
  const purchases = await db
    .select()
    .from(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.userId, user.id))
    .orderBy(desc(tables.purchaseEvents.purchasedAt))
    .all()

  // Filter by search term if provided
  let filtered = purchases
  if (query.search?.trim()) {
    const searchTerm = query.search.toLowerCase()
    filtered = purchases.filter((purchase) => {
      return (
        purchase.brand.toLowerCase().includes(searchTerm)
        || purchase.category.toLowerCase().includes(searchTerm)
        || purchase.productType.toLowerCase().includes(searchTerm)
        || purchase.sizeLabel.toLowerCase().includes(searchTerm)
        || (purchase.fitFeedback?.toLowerCase().includes(searchTerm) ?? false)
        || (purchase.notes?.toLowerCase().includes(searchTerm) ?? false)
      )
    })
  }

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
