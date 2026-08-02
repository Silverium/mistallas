import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { QueuedMutation } from './useOfflineQueue'
import type { PendingPhoto } from './usePendingPhotosStore'
import {
  flushOfflineWork,
  shouldAnnounceReconnection,
  shouldFlushWhenWorkAppears,
  shouldScheduleFlushRetry
} from './useNetworkStatus'

vi.mock('../utils/image-compression', () => ({
  blobToBase64: vi.fn().mockResolvedValue('data:image/webp;base64,AAA=')
}))

type PendingPhotosLike = {
  pendingPhotos: PendingPhoto[]
  removePhoto: (id: string) => void
}

type OfflineQueueLike = {
  queue: QueuedMutation[]
  dequeue: (id: string) => void
}

function createPendingPhotosStore(photos: PendingPhoto[]): PendingPhotosLike {
  return {
    pendingPhotos: photos,
    removePhoto(id: string) {
      const index = this.pendingPhotos.findIndex(photo => photo.id === id)
      if (index >= 0) {
        this.pendingPhotos.splice(index, 1)
      }
    }
  }
}

function createOfflineQueue(entries: QueuedMutation[]): OfflineQueueLike {
  return {
    queue: entries,
    dequeue(id: string) {
      const index = this.queue.findIndex(entry => entry.id === id)
      if (index >= 0) {
        this.queue.splice(index, 1)
      }
    }
  }
}

describe('flushOfflineWork', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('clears only pending photos that were actually synced from queue', async () => {
    const offlineQueue = createOfflineQueue([
      {
        id: 'q1',
        method: 'POST',
        url: '/api/purchases/101/photos',
        body: { fileBase64: 'a', mimeType: 'image/webp' }
      },
      {
        id: 'q2',
        method: 'POST',
        url: '/api/purchases/202/photos',
        body: { fileBase64: 'b', mimeType: 'image/webp' }
      }
    ])

    const pendingPhotos = createPendingPhotosStore([
      {
        id: 'p1',
        purchaseId: 101,
        blobUrl: 'blob:101',
        mimeType: 'image/webp'
      },
      {
        id: 'p2',
        purchaseId: 202,
        blobUrl: 'blob:202',
        mimeType: 'image/webp'
      }
    ])

    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('network down'))

    const result = await flushOfflineWork({
      offlineQueue,
      pendingPhotos,
      request
    })

    expect(result).toEqual({ syncedMutations: 1, uploadedFromPendingStore: 0, droppedMutations: 0, syncedPhotoPurchaseIds: [101] })
    expect(offlineQueue.queue.map(entry => entry.id)).toEqual(['q2'])
    expect(pendingPhotos.pendingPhotos.map(photo => photo.id)).toEqual(['p2'])
  })

  it('uploads remaining pending photos on reconnect when queue has no matching photo upload entry', async () => {
    const offlineQueue = createOfflineQueue([])

    const pendingPhotos = createPendingPhotosStore([
      {
        id: 'p10',
        purchaseId: 10,
        blobUrl: 'blob:10',
        mimeType: 'image/webp'
      }
    ])

    const request = vi.fn().mockResolvedValue({ ok: true })

    vi.mocked(fetch).mockResolvedValue({
      blob: async () => new Blob(['test'], { type: 'image/webp' })
    } as Response)

    const result = await flushOfflineWork({
      offlineQueue,
      pendingPhotos,
      request
    })

    expect(result).toEqual({ syncedMutations: 0, uploadedFromPendingStore: 1, droppedMutations: 0, syncedPhotoPurchaseIds: [] })
    expect(request).toHaveBeenCalledWith('/api/purchases/10/photos', expect.objectContaining({ method: 'POST' }))
    expect(pendingPhotos.pendingPhotos).toHaveLength(0)
  })

  it('does not fallback-upload when a matching queued photo upload is still pending', async () => {
    const offlineQueue = createOfflineQueue([
      {
        id: 'q-photo',
        method: 'POST',
        url: '/api/purchases/55/photos',
        body: { fileBase64: 'x', mimeType: 'image/webp' }
      }
    ])

    const pendingPhotos = createPendingPhotosStore([
      {
        id: 'p55',
        purchaseId: 55,
        blobUrl: 'blob:55',
        mimeType: 'image/webp'
      }
    ])

    const request = vi.fn().mockRejectedValue(new Error('still offline'))

    const result = await flushOfflineWork({
      offlineQueue,
      pendingPhotos,
      request
    })

    expect(result).toEqual({ syncedMutations: 0, uploadedFromPendingStore: 0, droppedMutations: 0, syncedPhotoPurchaseIds: [] })
    expect(pendingPhotos.pendingPhotos).toHaveLength(1)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('matches absolute queued photo endpoint URLs (localhost) and avoids duplicate fallback upload', async () => {
    const offlineQueue = createOfflineQueue([
      {
        id: 'q-abs',
        method: 'POST',
        url: 'http://localhost:8787/api/purchases/300/photos',
        body: { fileBase64: 'x', mimeType: 'image/webp' }
      }
    ])

    const pendingPhotos = createPendingPhotosStore([
      {
        id: 'p300',
        purchaseId: 300,
        blobUrl: 'blob:300',
        mimeType: 'image/webp'
      }
    ])

    const request = vi.fn().mockRejectedValue(new Error('still offline'))

    const result = await flushOfflineWork({
      offlineQueue,
      pendingPhotos,
      request
    })

    expect(result).toEqual({ syncedMutations: 0, uploadedFromPendingStore: 0, droppedMutations: 0, syncedPhotoPurchaseIds: [] })
    expect(pendingPhotos.pendingPhotos).toHaveLength(1)
    expect(request).toHaveBeenCalledWith('http://localhost:8787/api/purchases/300/photos', expect.any(Object))
  })

  it('skips unrecoverable 4xx mutations and continues to later pending photo uploads', async () => {
    const offlineQueue = createOfflineQueue([
      {
        id: 'q-stale',
        method: 'PATCH',
        url: '/api/purchases/9999',
        body: { notes: 'stale' }
      },
      {
        id: 'q-photo',
        method: 'POST',
        url: '/api/purchases/301/photos',
        body: { fileBase64: 'x', mimeType: 'image/webp' }
      }
    ])

    const pendingPhotos = createPendingPhotosStore([
      {
        id: 'p301',
        purchaseId: 301,
        blobUrl: 'blob:301',
        mimeType: 'image/webp'
      }
    ])

    const staleError = Object.assign(new Error('Not found'), { statusCode: 404 })
    const request = vi
      .fn()
      .mockRejectedValueOnce(staleError)
      .mockResolvedValueOnce({ ok: true })

    const result = await flushOfflineWork({
      offlineQueue,
      pendingPhotos,
      request
    })

    expect(result).toEqual({ syncedMutations: 1, uploadedFromPendingStore: 0, droppedMutations: 1, syncedPhotoPurchaseIds: [301] })
    expect(offlineQueue.queue).toHaveLength(0)
    expect(pendingPhotos.pendingPhotos).toHaveLength(0)
  })

  it('removes legacy queued GET requests and still uploads queued photo POST immediately', async () => {
    const offlineQueue = createOfflineQueue([
      {
        id: 'q-get-legacy',
        method: 'GET',
        url: '/api/purchases?page=1'
      },
      {
        id: 'q-photo',
        method: 'POST',
        url: '/api/purchases/302/photos',
        body: { fileBase64: 'x', mimeType: 'image/webp' }
      }
    ])

    const pendingPhotos = createPendingPhotosStore([
      {
        id: 'p302',
        purchaseId: 302,
        blobUrl: 'blob:302',
        mimeType: 'image/webp'
      }
    ])

    const request = vi.fn().mockResolvedValue({ ok: true })

    const result = await flushOfflineWork({
      offlineQueue,
      pendingPhotos,
      request
    })

    expect(result).toEqual({ syncedMutations: 1, uploadedFromPendingStore: 0, droppedMutations: 0, syncedPhotoPurchaseIds: [302] })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/purchases/302/photos', expect.objectContaining({ method: 'POST' }))
    expect(offlineQueue.queue).toHaveLength(0)
    expect(pendingPhotos.pendingPhotos).toHaveLength(0)
  })
})

describe('shouldAnnounceReconnection', () => {
  it('returns false while still offline', () => {
    expect(shouldAnnounceReconnection({
      online: false,
      wasOnline: false,
      hadBeenOffline: true
    })).toBe(false)
  })

  it('returns true when transitioning from offline to online', () => {
    expect(shouldAnnounceReconnection({
      online: true,
      wasOnline: false,
      hadBeenOffline: false
    })).toBe(true)
  })

  it('returns true when online and previous offline state was remembered', () => {
    expect(shouldAnnounceReconnection({
      online: true,
      wasOnline: true,
      hadBeenOffline: true
    })).toBe(true)
  })

  it('returns false when continuously online with no offline history', () => {
    expect(shouldAnnounceReconnection({
      online: true,
      wasOnline: true,
      hadBeenOffline: false
    })).toBe(false)
  })
})

describe('shouldScheduleFlushRetry', () => {
  it('returns true when online, no progress made, and pending work remains', () => {
    expect(shouldScheduleFlushRetry({
      online: true,
      remainingQueue: 1,
      remainingPending: 0,
      progressMade: false
    })).toBe(true)
  })

  it('returns false when progress was made', () => {
    expect(shouldScheduleFlushRetry({
      online: true,
      remainingQueue: 1,
      remainingPending: 1,
      progressMade: true
    })).toBe(false)
  })

  it('returns false when no work remains', () => {
    expect(shouldScheduleFlushRetry({
      online: true,
      remainingQueue: 0,
      remainingPending: 0,
      progressMade: false
    })).toBe(false)
  })

  it('returns false when offline', () => {
    expect(shouldScheduleFlushRetry({
      online: false,
      remainingQueue: 3,
      remainingPending: 2,
      progressMade: false
    })).toBe(false)
  })
})

describe('shouldFlushWhenWorkAppears', () => {
  it('returns true when online and queue has pending mutations', () => {
    expect(shouldFlushWhenWorkAppears({
      online: true,
      remainingQueue: 1,
      remainingPending: 0
    })).toBe(true)
  })

  it('returns true when online and pending photos exist', () => {
    expect(shouldFlushWhenWorkAppears({
      online: true,
      remainingQueue: 0,
      remainingPending: 1
    })).toBe(true)
  })

  it('returns false when offline even if work exists', () => {
    expect(shouldFlushWhenWorkAppears({
      online: false,
      remainingQueue: 2,
      remainingPending: 3
    })).toBe(false)
  })

  it('returns false when online but no work exists', () => {
    expect(shouldFlushWhenWorkAppears({
      online: true,
      remainingQueue: 0,
      remainingPending: 0
    })).toBe(false)
  })
})
