import { calculateMultiWordSearchScore } from './fuzzy-search'

export type OfflinePurchasePage = {
  purchases?: unknown[]
}

export type OfflinePurchasesResult = {
  purchases: unknown[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export function buildOfflinePurchasesResult(
  purchasePages: Record<string, OfflinePurchasePage>,
  search: string,
  page: number,
  pageSize: number,
  scoreFn: (purchase: Record<string, unknown>, searchWords: string[]) => number = calculateMultiWordSearchScore,
  pendingPurchases: unknown[] = []
): OfflinePurchasesResult {
  const allPurchases: unknown[] = []
  const seenPurchaseIds = new Set<string>()

  const getPurchaseIdentity = (purchase: unknown) => {
    if (purchase && typeof purchase === 'object') {
      const maybeId = (purchase as { id?: unknown }).id
      if (typeof maybeId === 'number' || typeof maybeId === 'string') {
        return `id:${maybeId}`
      }
    }
    return null
  }

  const getPurchasedAtMs = (purchase: unknown) => {
    if (!purchase || typeof purchase !== 'object') {
      return 0
    }

    const maybeDate = (purchase as { purchasedAt?: unknown }).purchasedAt
    if (typeof maybeDate !== 'string' && !(maybeDate instanceof Date)) {
      return 0
    }

    const timestamp = new Date(maybeDate).getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  // Add pending purchases first (they should appear at the top with most recent dates)
  for (const purchase of pendingPurchases) {
    allPurchases.push(purchase)
  }

  for (const key in purchasePages) {
    const cachedPage = purchasePages[key]
    if (cachedPage?.purchases) {
      for (const purchase of cachedPage.purchases) {
        const identity = getPurchaseIdentity(purchase)
        if (identity) {
          if (seenPurchaseIds.has(identity)) {
            continue
          }
          seenPurchaseIds.add(identity)
        }

        allPurchases.push(purchase)
      }
    }
  }

  allPurchases.sort((a, b) => getPurchasedAtMs(b) - getPurchasedAtMs(a))

  let filtered = allPurchases
  if (search.trim()) {
    const searchWords = search.trim().split(/\s+/).filter(Boolean)
    filtered = allPurchases
      .map(purchase => ({
        purchase,
        score: scoreFn(purchase as Record<string, unknown>, searchWords)
      }))
      .filter(item => item.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .map(item => item.purchase)
  }

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const offset = (page - 1) * pageSize
  const paginated = filtered.slice(offset, offset + pageSize)

  return {
    purchases: paginated,
    pagination: {
      page,
      limit: pageSize,
      total: totalCount,
      totalPages
    }
  }
}
