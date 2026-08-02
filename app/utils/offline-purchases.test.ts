import { describe, expect, it } from 'vitest'
import { buildOfflinePurchasesResult } from './offline-purchases'

describe('buildOfflinePurchasesResult', () => {
  it('aggregates purchases from all cached pages and paginates them offline', () => {
    const purchasePages = {
      '1:20:': {
        purchases: [
          { id: 1, brand: 'Nike', productType: 'Tee', sizeLabel: 'M' },
          { id: 2, brand: 'Adidas', productType: 'Jeans', sizeLabel: 'L' }
        ]
      },
      '2:20:': {
        purchases: [
          { id: 3, brand: 'Puma', productType: 'Shoes', sizeLabel: '42' },
          { id: 4, brand: 'Levis', productType: 'Jacket', sizeLabel: 'S' }
        ]
      }
    }

    const result = buildOfflinePurchasesResult(purchasePages, '', 1, 20)

    expect(result.purchases).toHaveLength(4)
    expect(result.pagination.total).toBe(4)
    expect(result.pagination.totalPages).toBe(1)
    expect(result.pagination.page).toBe(1)
  })

  it('filters purchases with search across all cached pages', () => {
    const purchasePages = {
      '1:20:': {
        purchases: [
          { id: 1, brand: 'Nike', productType: 'Tee', sizeLabel: 'M', notes: '' },
          { id: 2, brand: 'Adidas', productType: 'Jeans', sizeLabel: 'L', notes: '' }
        ]
      },
      '2:20:': {
        purchases: [
          { id: 3, brand: 'Nike', productType: 'Shoes', sizeLabel: '42', notes: '' }
        ]
      }
    }

    const scoreFn = (purchase: Record<string, unknown>, searchWords: string[]) => {
      const text = Object.values(purchase).join(' ').toLowerCase()
      return searchWords.every(word => text.includes(word.toLowerCase())) ? 1 : 0
    }

    const result = buildOfflinePurchasesResult(purchasePages, 'nike', 1, 20, scoreFn)

    expect(result.purchases).toHaveLength(2)
    expect((result.purchases[0] as { brand: string }).brand).toBe('Nike')
    expect((result.purchases[1] as { brand: string }).brand).toBe('Nike')
    expect(result.pagination.total).toBe(2)
  })

  it('deduplicates purchases from mixed cache page sizes and sorts by date desc', () => {
    const purchasePages = {
      '1:20:': {
        purchases: [
          { id: 1, brand: 'Nike', productType: 'Tee', sizeLabel: 'M', purchasedAt: '2026-01-01T00:00:00.000Z' },
          { id: 2, brand: 'Adidas', productType: 'Jeans', sizeLabel: 'L', purchasedAt: '2026-01-03T00:00:00.000Z' }
        ]
      },
      '1:100:': {
        purchases: [
          { id: 2, brand: 'Adidas', productType: 'Jeans', sizeLabel: 'L', purchasedAt: '2026-01-03T00:00:00.000Z' },
          { id: 3, brand: 'Puma', productType: 'Shoes', sizeLabel: '42', purchasedAt: '2026-01-02T00:00:00.000Z' }
        ]
      }
    }

    const result = buildOfflinePurchasesResult(purchasePages, '', 1, 100)
    const ids = result.purchases.map(item => (item as { id: number }).id)

    expect(result.purchases).toHaveLength(3)
    expect(result.pagination.total).toBe(3)
    expect(ids).toEqual([2, 3, 1])
  })

  it('includes pending purchases in results', () => {
    const purchasePages = {
      '1:20:': {
        purchases: [
          { id: 1, brand: 'Nike', productType: 'Tee', sizeLabel: 'M', purchasedAt: '2026-01-01T00:00:00.000Z' }
        ]
      }
    }

    const pendingPurchases = [
      { id: 'pending-1', brand: 'Adidas', productType: 'Jeans', sizeLabel: 'L', purchasedAt: '2026-01-03T00:00:00.000Z', isPending: true }
    ]

    const result = buildOfflinePurchasesResult(purchasePages, '', 1, 20, undefined, pendingPurchases)

    expect(result.purchases).toHaveLength(2)
    expect(result.pagination.total).toBe(2)
    expect((result.purchases[0] as { id: string }).id).toBe('pending-1')
  })

  it('sorts pending purchases by date with cached purchases', () => {
    const purchasePages = {
      '1:20:': {
        purchases: [
          { id: 1, brand: 'Nike', productType: 'Tee', sizeLabel: 'M', purchasedAt: '2026-01-01T00:00:00.000Z' },
          { id: 2, brand: 'Adidas', productType: 'Jeans', sizeLabel: 'L', purchasedAt: '2026-01-05T00:00:00.000Z' }
        ]
      }
    }

    const pendingPurchases = [
      { id: 'pending-1', brand: 'Puma', productType: 'Shoes', sizeLabel: '42', purchasedAt: '2026-01-04T00:00:00.000Z', isPending: true }
    ]

    const result = buildOfflinePurchasesResult(purchasePages, '', 1, 20, undefined, pendingPurchases)
    const ids = result.purchases.map(item => (item as { id: string | number }).id)

    expect(ids).toEqual([2, 'pending-1', 1])
  })

  it('includes pending purchases in search', () => {
    const purchasePages = {
      '1:20:': {
        purchases: [
          { id: 1, brand: 'Nike', productType: 'Tee', sizeLabel: 'M', notes: '', purchasedAt: '2026-01-01T00:00:00.000Z' }
        ]
      }
    }

    const pendingPurchases = [
      { id: 'pending-1', brand: 'Adidas', productType: 'Jeans', sizeLabel: 'L', notes: '', purchasedAt: '2026-01-03T00:00:00.000Z', isPending: true }
    ]

    const scoreFn = (purchase: Record<string, unknown>, searchWords: string[]) => {
      const text = Object.values(purchase).join(' ').toLowerCase()
      return searchWords.every(word => text.includes(word.toLowerCase())) ? 1 : 0
    }

    const result = buildOfflinePurchasesResult(purchasePages, 'adidas', 1, 20, scoreFn, pendingPurchases)

    expect(result.purchases).toHaveLength(1)
    expect((result.purchases[0] as { id: string }).id).toBe('pending-1')
  })
})
