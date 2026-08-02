import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOfflineDataStore } from './useOfflineData'

/**
 * REAL TEST - No mocks, testing actual offline storage and retrieval of photoSlots
 * This test should FAIL if photoSlots are being lost during offline caching
 */
describe('Offline Photo Slots Persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Clear localStorage before each test
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  afterEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  it('should persist photoSlots in offline cache', () => {
    const store = useOfflineDataStore()

    // Simulate API response with photos
    const apiResponse = {
      purchases: [
        {
          id: 1,
          brand: 'Nike',
          category: 'Shoes',
          productType: 'Sneaker',
          sizeLabel: '42',
          purchasedAt: '2026-07-27T00:00:00Z',
          photoSlots: [1, 2, 3] // ← CRITICAL: Photos in slots 1, 2, 3
        },
        {
          id: 2,
          brand: 'Adidas',
          category: 'Shoes',
          productType: 'Sneaker',
          sizeLabel: '41',
          purchasedAt: '2026-07-26T00:00:00Z',
          photoSlots: [1] // ← CRITICAL: One photo in slot 1
        }
      ],
      pagination: {
        page: 1,
        limit: 100,
        total: 2,
        totalPages: 1
      }
    } as const

    // Store offline
    store.setPurchasePage(1, 100, '', apiResponse)

    // Retrieve from store
    const retrieved = store.getPurchasePage(1, 100, '')

    // ASSERTION: photoSlots must be present
    expect(retrieved).toBeDefined()
    expect(retrieved?.purchases).toBeDefined()
    expect(Array.isArray(retrieved?.purchases)).toBe(true)
    
    // Check that each purchase has photoSlots array
    const purchases = retrieved?.purchases as any[]
    expect(purchases.length).toBe(2)
    
    expect(purchases[0].photoSlots).toBeDefined()
    expect(Array.isArray(purchases[0].photoSlots)).toBe(true)
    expect(purchases[0].photoSlots).toEqual([1, 2, 3])
    
    expect(purchases[1].photoSlots).toBeDefined()
    expect(Array.isArray(purchases[1].photoSlots)).toBe(true)
    expect(purchases[1].photoSlots).toEqual([1])
  })
})
