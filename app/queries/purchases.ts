import { defineQueryOptions } from '@pinia/colada'

type PurchasePhoto = {
  id: number
  slot: number
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

export const purchasesPageQuery = (page: number = 1, limit: number = 20) => defineQueryOptions({
  key: ['purchases', page, limit],
  query: () => useRequestFetch()(`/api/purchases?page=${page}&limit=${limit}`) as Promise<PurchasesPaginatedResponse>
})

export const purchaseComparisonQuery = (purchaseId: number) => defineQueryOptions({
  key: ['purchase-comparison', purchaseId],
  query: () => useRequestFetch()(`/api/purchases/${purchaseId}/compare`) as Promise<unknown>
})

export const purchasePhotosQuery = (purchaseId: number) => defineQueryOptions({
  key: ['purchase-photos', purchaseId],
  query: () => useRequestFetch()(`/api/purchases/${purchaseId}/photos`) as Promise<PurchasePhoto[]>
})
