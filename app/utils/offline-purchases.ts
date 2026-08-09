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

  const getSortId = (purchase: unknown) => {
    if (!purchase || typeof purchase !== 'object') {
      return { numericId: null as number | null, rawId: '' }
    }

    const rawId = String((purchase as { id?: unknown }).id ?? '')
    const numericId = Number(rawId)
    return {
      numericId: Number.isFinite(numericId) ? numericId : null,
      rawId
    }
  }

  const compareByRecency = (a: unknown, b: unknown) => {
    const purchasedAtDiff = getPurchasedAtMs(b) - getPurchasedAtMs(a)
    if (purchasedAtDiff !== 0) {
      return purchasedAtDiff
    }

    const aSort = getSortId(a)
    const bSort = getSortId(b)

    // Keep pending (non-numeric IDs) first when purchase date is tied.
    const aIsPending = aSort.numericId == null && aSort.rawId.length > 0
    const bIsPending = bSort.numericId == null && bSort.rawId.length > 0
    if (aIsPending !== bIsPending) {
      return aIsPending ? -1 : 1
    }

    if (aSort.numericId != null && bSort.numericId != null) {
      return bSort.numericId - aSort.numericId
    }

    return bSort.rawId.localeCompare(aSort.rawId)
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

  allPurchases.sort(compareByRecency)

  let filtered = allPurchases
  if (search.trim()) {
    const searchWords = search.trim().split(/\s+/).filter(Boolean)
    filtered = allPurchases
      .map(purchase => ({
        purchase,
        score: scoreFn(purchase as Record<string, unknown>, searchWords)
      }))
      .filter(item => item.score >= 0.2)
      .sort((a, b) => {
        const scoreDiff = b.score - a.score
        if (scoreDiff !== 0) {
          return scoreDiff
        }

        return compareByRecency(a.purchase, b.purchase)
      })
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
