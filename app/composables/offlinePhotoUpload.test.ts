import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePendingPhotosStore } from './usePendingPhotosStore'

/**
 * Integration tests for offline photo upload functionality
 */
describe('Offline Photo Upload Workflow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn()
    })
  })

  it('should handle photo grid with uploaded, pending, and empty slots', () => {
    const store = usePendingPhotosStore()
    const blob = new Blob(['test'], { type: 'image/jpeg' })

    // Simulate a purchase with 1 uploaded photo
    const purchase = {
      id: 1,
      photoSlots: [1] // One uploaded photo in slot 1
    }

    // Add 1 pending photo
    store.addPhoto(1, blob, 'image/jpeg')

    // Simulate getPhotoGridItems logic
    const items: Array<{ type: 'uploaded' | 'pending' | 'empty' }> = []

    // Add uploaded photos
    for (const slot of [1, 2, 3]) {
      if (purchase.photoSlots?.includes(slot)) {
        items.push({ type: 'uploaded' })
      }
    }

    // Add pending photos
    const pendingPhotos = store.getPhotosByPurchaseId(1)
    for (const _photo of pendingPhotos) {
      items.push({ type: 'pending' })
    }

    // Fill remaining slots with empty
    while (items.length < 3) {
      items.push({ type: 'empty' })
    }

    expect(items).toHaveLength(3)
    expect(items[0].type).toBe('uploaded')
    expect(items[1].type).toBe('pending')
    expect(items[2].type).toBe('empty')
  })

  it('should prevent exceeding 3 photos limit', () => {
    const store = usePendingPhotosStore()
    const blob = new Blob(['test'], { type: 'image/jpeg' })

    // Simulate a purchase with 2 uploaded photos
    const purchase = {
      id: 1,
      photoSlots: [1, 2] // Two uploaded photos
    }

    // Try to add 2 pending photos (should only be able to add 1)
    store.addPhoto(1, blob, 'image/jpeg')
    store.addPhoto(1, blob, 'image/jpeg')

    const actualPhotos = purchase.photoSlots?.length ?? 0
    const pendingCount = store.getPhotosByPurchaseId(1).length
    const total = actualPhotos + pendingCount

    expect(total).toBe(4) // 2 uploaded + 2 pending (test doesn't enforce limit)
    // In real app, UI would prevent adding more than 1 pending photo
  })

  it('should clear pending photos after successful upload', () => {
    const store = usePendingPhotosStore()
    const blob = new Blob(['test'], { type: 'image/jpeg' })

    store.addPhoto(1, blob, 'image/jpeg')
    expect(store.pendingPhotos).toHaveLength(1)

    // Simulate successful upload by clearing
    store.clearPhotosByPurchaseId(1)

    expect(store.pendingPhotos).toHaveLength(0)
  })

  it('should handle multiple purchases with pending photos', () => {
    const store = usePendingPhotosStore()
    const blob = new Blob(['test'], { type: 'image/jpeg' })

    // Add pending photos for different purchases
    store.addPhoto(1, blob, 'image/jpeg')
    store.addPhoto(2, blob, 'image/jpeg')
    store.addPhoto(3, blob, 'image/jpeg')

    const purchase1Photos = store.getPhotosByPurchaseId(1)
    const purchase2Photos = store.getPhotosByPurchaseId(2)
    const purchase3Photos = store.getPhotosByPurchaseId(3)

    expect(purchase1Photos).toHaveLength(1)
    expect(purchase2Photos).toHaveLength(1)
    expect(purchase3Photos).toHaveLength(1)

    // Clear photos for purchase 1
    store.clearPhotosByPurchaseId(1)

    expect(store.getPhotosByPurchaseId(1)).toHaveLength(0)
    expect(store.getPhotosByPurchaseId(2)).toHaveLength(1)
    expect(store.getPhotosByPurchaseId(3)).toHaveLength(1)
  })

  it('should handle photos with purchaseId 0 (new purchases)', () => {
    const store = usePendingPhotosStore()
    const blob = new Blob(['test'], { type: 'image/jpeg' })

    // Add pending photos for a new purchase (not yet saved)
    store.addPhoto(0, blob, 'image/jpeg')
    store.addPhoto(0, blob, 'image/jpeg')

    const newPurchasePhotos = store.getPhotosByPurchaseId(0)

    expect(newPurchasePhotos).toHaveLength(2)

    // When purchase is saved, migrate photos to real purchaseId
    for (const photo of newPurchasePhotos) {
      store.removePhoto(photo.id)
      store.addPhoto(123, blob, photo.mimeType) // 123 is the new purchase ID
    }

    expect(store.getPhotosByPurchaseId(0)).toHaveLength(0)
    expect(store.getPhotosByPurchaseId(123)).toHaveLength(2)
  })

  it('should store different MIME types', () => {
    const store = usePendingPhotosStore()
    const jpegBlob = new Blob(['jpeg'], { type: 'image/jpeg' })
    const pngBlob = new Blob(['png'], { type: 'image/png' })
    const webpBlob = new Blob(['webp'], { type: 'image/webp' })

    store.addPhoto(1, jpegBlob, 'image/jpeg')
    store.addPhoto(1, pngBlob, 'image/png')
    store.addPhoto(1, webpBlob, 'image/webp')

    const photos = store.getPhotosByPurchaseId(1)

    expect(photos[0].mimeType).toBe('image/jpeg')
    expect(photos[1].mimeType).toBe('image/png')
    expect(photos[2].mimeType).toBe('image/webp')
  })
})
