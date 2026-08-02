import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePendingPurchasesStore } from './usePendingPurchasesStore'

describe('usePendingPurchasesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adds a pending purchase', () => {
    const store = usePendingPurchasesStore()

    store.addPurchase({
      brand: 'Nike',
      category: 'Shoes',
      productType: 'Running Shoes',
      sizeLabel: '42',
      purchasedAt: new Date('2026-07-27'),
      price: 100
    })

    expect(store.pendingPurchases).toHaveLength(1)
    expect(store.pendingPurchases[0]).toMatchObject({
      brand: 'Nike',
      category: 'Shoes',
      productType: 'Running Shoes',
      sizeLabel: '42',
      price: 100,
      isPending: true
    })
    expect(store.pendingPurchases[0].id).toBeDefined()
  })

  it('adds multiple pending purchases', () => {
    const store = usePendingPurchasesStore()

    store.addPurchase({
      brand: 'Nike',
      category: 'Shoes',
      productType: 'Running Shoes',
      sizeLabel: '42',
      purchasedAt: new Date('2026-07-27')
    })

    store.addPurchase({
      brand: 'Adidas',
      category: 'Shirts',
      productType: 'T-Shirt',
      sizeLabel: 'L',
      purchasedAt: new Date('2026-07-27')
    })

    expect(store.pendingPurchases).toHaveLength(2)
  })

  it('removes purchase by brand, category, productType, and sizeLabel', () => {
    const store = usePendingPurchasesStore()

    store.addPurchase({
      brand: 'Nike',
      category: 'Shoes',
      productType: 'Running Shoes',
      sizeLabel: '42',
      purchasedAt: new Date('2026-07-27')
    })

    store.addPurchase({
      brand: 'Adidas',
      category: 'Shirts',
      productType: 'T-Shirt',
      sizeLabel: 'L',
      purchasedAt: new Date('2026-07-27')
    })

    store.removePurchaseByBrand('Nike', 'Shoes', 'Running Shoes', '42')

    expect(store.pendingPurchases).toHaveLength(1)
    expect(store.pendingPurchases[0].brand).toBe('Adidas')
  })

  it('clears all pending purchases', () => {
    const store = usePendingPurchasesStore()

    store.addPurchase({
      brand: 'Nike',
      category: 'Shoes',
      productType: 'Running Shoes',
      sizeLabel: '42',
      purchasedAt: new Date('2026-07-27')
    })

    store.addPurchase({
      brand: 'Adidas',
      category: 'Shirts',
      productType: 'T-Shirt',
      sizeLabel: 'L',
      purchasedAt: new Date('2026-07-27')
    })

    store.clear()

    expect(store.pendingPurchases).toHaveLength(0)
  })

  it('generates unique IDs for each purchase', () => {
    const store = usePendingPurchasesStore()

    store.addPurchase({
      brand: 'Nike',
      category: 'Shoes',
      productType: 'Running Shoes',
      sizeLabel: '42',
      purchasedAt: new Date('2026-07-27')
    })

    store.addPurchase({
      brand: 'Nike',
      category: 'Shoes',
      productType: 'Running Shoes',
      sizeLabel: '42',
      purchasedAt: new Date('2026-07-27')
    })

    const ids = store.pendingPurchases.map(p => p.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('keeps optional fields when provided', () => {
    const store = usePendingPurchasesStore()

    store.addPurchase({
      brand: 'Nike',
      category: 'Shoes',
      productType: 'Running Shoes',
      sizeLabel: '42',
      purchasedAt: new Date('2026-07-27'),
      fitFeedback: 'Perfect fit',
      notes: 'Great purchase',
      price: 150
    })

    const purchase = store.pendingPurchases[0]
    expect(purchase.fitFeedback).toBe('Perfect fit')
    expect(purchase.notes).toBe('Great purchase')
    expect(purchase.price).toBe(150)
  })
})
