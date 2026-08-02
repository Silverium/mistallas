import { defineQueryOptions } from '@pinia/colada'

/**
 * Photo uploaded to the server and associated with a purchase.
 *
 * IMPORTANT: The `id` field is the server-assigned photoId (NOT a local tracking ID).
 * This is assigned by the server after successful upload.
 * Do not confuse with PendingPhoto.id, which is a local UUID.
 */
export type PurchasePhoto = {
  id: number // ← SERVER-ASSIGNED photoId after upload
  slot: number // photo position: 1-3
  mimeType: string
  width: number | null
  height: number | null
  bytes: number | null
  createdAt: string | Date | null
}

export type PurchasesPaginatedResponse = {
  purchases: unknown[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export const purchasesQuery = defineQueryOptions({
  key: ['purchases'],
  query: () => useRequestFetch()('/api/purchases') as Promise<PurchasesPaginatedResponse>
})

export const purchasesPageQuery = (page: number = 1, limit: number = 20, search: string = '') => defineQueryOptions({
  key: ['purchases', page, limit, search],
  query: async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit)
    })
    if (search.trim()) {
      params.append('search', search.trim())
    }
    try {
      return await useRequestFetch()(`/api/purchases?${params.toString()}`) as PurchasesPaginatedResponse
    }
    catch (err) {
      const offlineStore = useOfflineDataStore()
      const cached = offlineStore.getPurchasePage(page, limit, search)
      if (cached) return cached
      throw err
    }
  }
})

export const purchaseComparisonQuery = (purchaseId: number) => defineQueryOptions({
  key: ['purchase-comparison', purchaseId],
  query: () => useRequestFetch()(`/api/purchases/${purchaseId}/compare`) as Promise<unknown>
})

export const purchasePhotosQuery = (purchaseId: number) => defineQueryOptions({
  key: ['purchase-photos', purchaseId],
  query: () => useRequestFetch()(`/api/purchases/${purchaseId}/photos`) as Promise<PurchasePhoto[]>
})
