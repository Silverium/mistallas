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

export const purchasesQuery = defineQueryOptions({
  key: ['purchases'],
  query: () => useRequestFetch()('/api/purchases') as Promise<unknown[]>
})

export const purchaseComparisonQuery = (purchaseId: number) => defineQueryOptions({
  key: ['purchase-comparison', purchaseId],
  query: () => useRequestFetch()(`/api/purchases/${purchaseId}/compare`) as Promise<unknown>
})

export const purchasePhotosQuery = (purchaseId: number) => defineQueryOptions({
  key: ['purchase-photos', purchaseId],
  query: () => useRequestFetch()(`/api/purchases/${purchaseId}/photos`) as Promise<PurchasePhoto[]>
})
