import { defineQueryOptions } from '@pinia/colada'

export const purchasesQuery = defineQueryOptions({
  key: ['purchases'],
  query: () => useRequestFetch()('/api/purchases') as Promise<unknown[]>
})

export const purchaseComparisonQuery = (purchaseId: number) => defineQueryOptions({
  key: ['purchase-comparison', purchaseId],
  query: () => useRequestFetch()(`/api/purchases/${purchaseId}/compare`) as Promise<unknown>
})
