import { defineStore } from 'pinia'
import { ref } from 'vue'

const safeLocalStorage = {
  getItem: (key: string) => {
    if (!import.meta.client) {
      return null
    }
    return localStorage.getItem(key)
  },
  setItem: (key: string, value: string) => {
    if (!import.meta.client) {
      return
    }
    localStorage.setItem(key, value)
  },
  removeItem: (key: string) => {
    if (!import.meta.client) {
      return
    }
    localStorage.removeItem(key)
  }
}

/**
 * Pending photo stored locally before upload.
 *
 * IMPORTANT: The `id` field is a local tracking UUID (NOT the server photoId).
 * This is used only for local state management before the photo is uploaded.
 * After upload, the server assigns a numeric photoId.
 */
export interface PendingPhoto {
  id: string // ← LOCAL UUID for tracking, NOT server photoId
  purchaseId: number | string // numeric for synced purchases, UUID string for pending purchases
  blobUrl: string // ephemeral blob: URL for preview (not persisted)
  mimeType: string
  fileBase64: string // persisted for upload
}

/**
 * Persistent store for photos pending upload.
 * When the device goes offline or the upload fails, photos are queued here.
 * They automatically resume when the device comes back online.
 *
 * Note: blobUrl is NOT persisted because blob: URLs are ephemeral.
 * On restore, blobUrl is reconstructed from fileBase64.
 */
export const usePendingPhotosStore = defineStore('pendingPhotos', () => {
  const pendingPhotos = ref<PendingPhoto[]>([])

  async function addPhoto(purchaseId: number | string, blob: Blob, mimeType: string, fileBase64: string) {
    const blobUrl = URL.createObjectURL(blob)
    pendingPhotos.value.push({
      id: crypto.randomUUID(),
      purchaseId,
      blobUrl,
      mimeType,
      fileBase64
    })
  }

  function removePhoto(id: string) {
    const idx = pendingPhotos.value.findIndex(p => p.id === id)
    if (idx !== -1) {
      const photo = pendingPhotos.value[idx]!
      // Revoke the blob URL to free memory
      if (photo.blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photo.blobUrl)
      }
      pendingPhotos.value.splice(idx, 1)
    }
  }

  function getPhotosByPurchaseId(purchaseId: number | string) {
    return pendingPhotos.value.filter(p => p.purchaseId === purchaseId)
  }

  function getPhotoPreviewsByPurchaseId(purchaseId: number | string) {
    return getPhotosByPurchaseId(purchaseId).map(photo => ({
      id: photo.id,
      previewUrl: photo.blobUrl
    }))
  }

  function clearPhotosByPurchaseId(purchaseId: number | string) {
    const toRemove = pendingPhotos.value.filter(p => p.purchaseId === purchaseId)
    for (const photo of toRemove) {
      if (photo.blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photo.blobUrl)
      }
    }
    pendingPhotos.value = pendingPhotos.value.filter(p => p.purchaseId !== purchaseId)
  }

  function migratePhotoToNewPurchaseId(photoId: string, newPurchaseId: number | string) {
    const photoIndex = pendingPhotos.value.findIndex(p => p.id === photoId)
    if (photoIndex !== -1) {
      const photo = pendingPhotos.value[photoIndex]!
      // Update the purchase ID while keeping all other properties
      pendingPhotos.value[photoIndex] = {
        id: photo.id,
        purchaseId: newPurchaseId,
        blobUrl: photo.blobUrl,
        mimeType: photo.mimeType,
        fileBase64: photo.fileBase64
      }
    }
  }

  function clear() {
    // Revoke all blob URLs
    for (const photo of pendingPhotos.value) {
      if (photo.blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photo.blobUrl)
      }
    }
    pendingPhotos.value = []
  }

  return {
    pendingPhotos,
    addPhoto,
    removePhoto,
    getPhotosByPurchaseId,
    getPhotoPreviewsByPurchaseId,
    clearPhotosByPurchaseId,
    migratePhotoToNewPurchaseId,
    clear
  }
}, {
  persist: {
    storage: safeLocalStorage,
    serializer: {
      serialize: (value): string => {
        // Type-safe serialization of the store state
        const photos = value.pendingPhotos as PendingPhoto[]
        // Don't persist blobUrl (ephemeral session URLs), only fileBase64
        return JSON.stringify({
          pendingPhotos: photos.map((p: PendingPhoto) => ({
            id: p.id,
            purchaseId: p.purchaseId,
            mimeType: p.mimeType,
            fileBase64: p.fileBase64
            // blobUrl is NOT persisted
          }))
        })
      },
      deserialize: async (data: string) => {
        const parsed = JSON.parse(data) as {
          pendingPhotos: Array<{
            id: string
            purchaseId: number | string
            mimeType: string
            fileBase64: string
          }>
        }

        // Reconstruct blobUrls from fileBase64 on restore
        const photos: PendingPhoto[] = []
        for (const p of parsed.pendingPhotos) {
          // Properly reconstruct blob URL from base64
          let blobUrl: string
          try {
            // fileBase64 is a data URL like "data:image/webp;base64,ABC123..."
            // Convert to blob and create object URL
            const response = await fetch(p.fileBase64)
            const blob = await response.blob()
            blobUrl = URL.createObjectURL(blob)
          }
          catch {
            // Fallback: use data URL directly if fetch fails
            blobUrl = p.fileBase64
          }

          photos.push({
            ...p,
            blobUrl
          })
        }

        return {
          pendingPhotos: photos
        }
      }
    }
  }
})
