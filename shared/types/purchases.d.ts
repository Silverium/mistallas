export interface Purchase {
  id: number
  userId: number | string
  brand: string
  category: string
  productType: string
  sizeLabel: string
  purchasedAt: string | Date
  fitFeedback?: string | null
  notes?: string | null
  price?: number | null
  photoSlots: number[]
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PurchasesApiResponse {
  purchases: Purchase[]
  pagination: Pagination
}
