import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PurchasesPaginatedResponse } from './purchases'

describe('purchasesPageQuery offline fallback', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns cached purchases when API request fails even if browser reports online', async () => {
    const cached: PurchasesPaginatedResponse = {
      purchases: [{ id: 1, brand: 'Nike' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    }

    vi.stubGlobal('useRequestFetch', () => async () => {
      throw new Error('Network error')
    })

    vi.stubGlobal('useOfflineDataStore', () => ({
      getPurchasePage: vi.fn(() => cached)
    }))

    const { purchasesPageQuery } = await import('./purchases')
    const query = purchasesPageQuery(1, 20, '')

    const result = await query.query()

    expect(result).toEqual(cached)
  })

  it('throws when API request fails and no cached purchases are available', async () => {
    vi.stubGlobal('useRequestFetch', () => async () => {
      throw new Error('Network error')
    })

    vi.stubGlobal('useOfflineDataStore', () => ({
      getPurchasePage: vi.fn(() => undefined)
    }))

    const { purchasesPageQuery } = await import('./purchases')
    const query = purchasesPageQuery(1, 20, '')

    await expect(query.query()).rejects.toThrow('Network error')
  })
})
