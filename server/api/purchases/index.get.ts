import { and, eq, inArray, desc } from 'drizzle-orm'
import { useValidatedQuery, z } from 'h3-zod'
import { calculateMultiWordSearchScore } from '@root/server/utils/fuzzy-search'
import { tables, useDB } from '@root/server/utils/db'

const PHOTO_ENRICHMENT_MAX_IDS_PER_QUERY = 90

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  setHeader(event, 'Cache-Control', 'private, no-store')

  const query = await useValidatedQuery(event, {
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().default(20).transform(value => Math.min(value, 5000)),
    search: z.string().optional()
  })

  try {
    const db = useDB()

    // Get all purchases for the user.
    // Compatibility fallback: if local DB schema is behind (e.g. missing newer
    // optional columns), retry with the stable core columns instead of failing 500.
    let purchases: Array<{
      id: number
      userId: number | string
      brand: string
      category: string
      productType: string
      sizeLabel: string
      purchasedAt: Date
      fitFeedback?: string | null
      notes?: string | null
      price?: number | null
    }>

    try {
      purchases = await db
        .select()
        .from(tables.purchaseEvents)
        .where(eq(tables.purchaseEvents.userId, user.id))
        .orderBy(desc(tables.purchaseEvents.purchasedAt), desc(tables.purchaseEvents.id))
        .all()
    }
    catch (error) {
      console.warn('[purchases.index.get] Falling back to core purchase columns due to schema mismatch.', error)

      try {
        const coreRows = await db
          .select({
            id: tables.purchaseEvents.id,
            userId: tables.purchaseEvents.userId,
            brand: tables.purchaseEvents.brand,
            category: tables.purchaseEvents.category,
            productType: tables.purchaseEvents.productType,
            sizeLabel: tables.purchaseEvents.sizeLabel,
            purchasedAt: tables.purchaseEvents.purchasedAt
          })
          .from(tables.purchaseEvents)
          .where(eq(tables.purchaseEvents.userId, user.id))
          .orderBy(desc(tables.purchaseEvents.purchasedAt), desc(tables.purchaseEvents.id))
          .all()

        purchases = coreRows.map(row => ({
          ...row,
          fitFeedback: null,
          notes: null,
          price: null
        }))
      }
      catch (fallbackError) {
        console.error('[purchases.index.get] Could not read purchase_events table, returning empty result.', fallbackError)
        purchases = []
      }
    }

    // Filter by search term if provided (using fuzzy search)
    let filtered = purchases
    if (query.search?.trim()) {
      const words = query.search.trim().split(/\s+/).filter(Boolean)

      const getPurchasedAtMs = (purchase: { purchasedAt: Date }) => {
        const timestamp = new Date(purchase.purchasedAt).getTime()
        return Number.isFinite(timestamp) ? timestamp : 0
      }

      filtered = purchases
        .map(purchase => ({
          purchase,
          score: calculateMultiWordSearchScore(purchase, words)
        }))
        .filter(item => item.score >= 0.2) // Only include matches with score >= 0.2
        .sort((a, b) => {
          const scoreDiff = b.score - a.score
          if (scoreDiff !== 0) {
            return scoreDiff
          }

          const purchasedAtDiff = getPurchasedAtMs(b.purchase) - getPurchasedAtMs(a.purchase)
          if (purchasedAtDiff !== 0) {
            return purchasedAtDiff
          }

          return Number(b.purchase.id) - Number(a.purchase.id)
        }) // Sort by relevance, then recency/id for deterministic order
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

    const photos: Array<{ purchaseEventId: number | string, slot: number | string }> = []

    for (let index = 0; index < purchaseIds.length; index += PHOTO_ENRICHMENT_MAX_IDS_PER_QUERY) {
      const batchPurchaseIds = purchaseIds.slice(index, index + PHOTO_ENRICHMENT_MAX_IDS_PER_QUERY)
      if (!batchPurchaseIds.length) {
        continue
      }

      try {
        const batchPhotos = await db
          .select({
            purchaseEventId: tables.purchasePhotos.purchaseEventId,
            slot: tables.purchasePhotos.slot
          })
          .from(tables.purchasePhotos)
          .where(and(
            eq(tables.purchasePhotos.userId, user.id),
            inArray(tables.purchasePhotos.purchaseEventId, batchPurchaseIds)
          ))
          .all()

        photos.push(...batchPhotos)
      }
      catch (error) {
        // Graceful degradation: if one enrichment batch fails (e.g. transient
        // D1 issue), keep processing remaining batches so unaffected purchases
        // can still render photo slots.
        console.warn('[purchases.index.get] Photo slot enrichment batch failed, continuing with remaining batches.', {
          batchStart: index,
          batchSize: batchPurchaseIds.length,
          error
        })
      }
    }

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
  }
  catch (error) {
    console.error('[purchases.index.get] Unexpected failure, returning empty result.', error)
    return {
      purchases: [],
      pagination: {
        page: query.page,
        limit: query.limit,
        total: 0,
        totalPages: 0
      }
    }
  }
})
