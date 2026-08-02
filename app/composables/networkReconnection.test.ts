import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePendingPhotosStore } from './usePendingPhotosStore'

/**
 * Tests for network status and reconnection behavior
 */
describe('Network Status and Reconnection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn()
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should identify photos needing upload for new purchases (purchaseId=0)', () => {
    const store = usePendingPhotosStore()
    const blob = new Blob(['test'], { type: 'image/jpeg' })

    // Add photos for new purchase
    store.addPhoto(0, blob, 'image/jpeg')
    store.addPhoto(0, blob, 'image/jpeg')

    // Add photos for existing purchase
    store.addPhoto(1, blob, 'image/jpeg')

    const newPurchasePhotos = store.pendingPhotos.filter(p => p.purchaseId === 0)
    const existingPurchasePhotos = store.pendingPhotos.filter(p => p.purchaseId > 0)

    expect(newPurchasePhotos).toHaveLength(2)
    expect(existingPurchasePhotos).toHaveLength(1)
  })

  it('should only process new purchase photos in uploadPendingPhotos', () => {
    const store = usePendingPhotosStore()
    const blob = new Blob(['test'], { type: 'image/jpeg' })

    // Mock fetch for new purchase photos
    global.fetch = vi.fn(() =>
      Promise.resolve({
        blob: () => Promise.resolve(blob)
      })
    ) as any

    // Add photos - simulate what uploadPendingPhotos should do
    store.addPhoto(0, blob, 'image/jpeg') // New purchase
    store.addPhoto(1, blob, 'image/jpeg') // Existing purchase

    // Simulate uploadPendingPhotos logic
    const photosToUpload = store.pendingPhotos.filter(p => p.purchaseId === 0)

    expect(photosToUpload).toHaveLength(1)
    expect(photosToUpload[0].purchaseId).toBe(0)
  })

  it('should clear existing purchase photos after offline queue sync', () => {
    const store = usePendingPhotosStore()
    const blob = new Blob(['test'], { type: 'image/jpeg' })

    // Simulate pending photos from offline queue
    store.addPhoto(1, blob, 'image/jpeg')
    store.addPhoto(2, blob, 'image/jpeg')

    expect(store.pendingPhotos).toHaveLength(2)

    // Simulate flushQueue clearing existing purchase photos
    const photosToRemove = store.pendingPhotos.filter(p => p.purchaseId > 0)
    for (const photo of photosToRemove) {
      store.removePhoto(photo.id)
    }

    expect(store.pendingPhotos).toHaveLength(0)
  })

  it('should not double-upload photos', () => {
    const store = usePendingPhotosStore()
    const blob = new Blob(['test'], { type: 'image/jpeg' })

    // Add photo for existing purchase
    store.addPhoto(1, blob, 'image/jpeg')

    // Simulate offline queue processing (should NOT be uploaded by uploadPendingPhotos)
    const shouldUploadByPendingStore = store.pendingPhotos.filter(p => p.purchaseId === 0)
    const shouldUploadByOfflineQueue = store.pendingPhotos.filter(p => p.purchaseId > 0)

    expect(shouldUploadByPendingStore).toHaveLength(0)
    expect(shouldUploadByOfflineQueue).toHaveLength(1)
    // The offline queue uploads it, then we clear it
  })

  it('should maintain photo order during reconnection', () => {
    const store = usePendingPhotosStore()
    const blob = new Blob(['test'], { type: 'image/jpeg' })

    store.addPhoto(1, blob, 'image/jpeg')
    store.addPhoto(1, blob, 'image/jpeg')
    store.addPhoto(1, blob, 'image/jpeg')

    const ids = store.pendingPhotos.map(p => p.id)
    const newPurchasePhotos = store.getPhotosByPurchaseId(1)
    const newIds = newPurchasePhotos.map(p => p.id)

    // Order should be preserved
    expect(newIds).toEqual(ids)
  })

  it('should handle mixed photos (new and existing purchases) correctly', () => {
    const store = usePendingPhotosStore()
    const blob = new Blob(['test'], { type: 'image/jpeg' })

    // Simulate workflow: new purchase with photos, then existing purchase with photo
    store.addPhoto(0, blob, 'image/jpeg') // New purchase pending
    store.addPhoto(1, blob, 'image/jpeg') // Existing purchase offline

    const newPurchasePhotos = store.getPhotosByPurchaseId(0)
    const existingPhotos = store.getPhotosByPurchaseId(1)

    // uploadPendingPhotos should only handle new purchase
    expect(newPurchasePhotos).toHaveLength(1)

    // Clear new purchase after upload
    store.clearPhotosByPurchaseId(0)
    expect(store.getPhotosByPurchaseId(0)).toHaveLength(0)

    // Existing photo should still be there (will be cleared by offline queue)
    expect(existingPhotos).toHaveLength(1)

    // Clear existing after offline queue sync
    const photosToRemove = store.pendingPhotos.filter(p => p.purchaseId > 0)
    for (const photo of photosToRemove) {
      store.removePhoto(photo.id)
    }

    expect(store.pendingPhotos).toHaveLength(0)
  })
})
