import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOfflineFetch, isOfflineQueuedError } from './useOfflineFetch'
import { useOfflineQueueStore } from './useOfflineQueue'
import { getQueuedPendingPhotoPreviews } from '../utils/offline-pending-photos'

describe('offline existing purchase photo upload flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('navigator', { onLine: false })
  })

  it('queues absolute /api/purchases/:id/photos upload when offline and returns OfflineQueuedError (not API error)', async () => {
    const requestFetchMock = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as { useRequestFetch?: unknown }).useRequestFetch = vi.fn(() => requestFetchMock)

    const offlineFetch = useOfflineFetch()

    let capturedError: unknown
    try {
      await offlineFetch('http://localhost:8787/api/purchases/302/photos', {
        method: 'POST',
        body: {
          fileBase64: 'data:image/webp;base64,AAAA',
          mimeType: 'image/webp'
        }
      })
    }
    catch (error) {
      capturedError = error
    }

    expect(isOfflineQueuedError(capturedError)).toBe(true)
    expect(requestFetchMock).not.toHaveBeenCalled()

    const queue = useOfflineQueueStore()
    expect(queue.queue).toHaveLength(1)
    expect(queue.queue[0]).toMatchObject({
      method: 'POST',
      url: 'http://localhost:8787/api/purchases/302/photos'
    })
  })

  it('does not queue GET requests while offline', async () => {
    const requestFetchMock = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as { useRequestFetch?: unknown }).useRequestFetch = vi.fn(() => requestFetchMock)

    const offlineFetch = useOfflineFetch()

    await expect(
      offlineFetch('http://localhost:8787/api/purchases?page=1', {
        method: 'GET'
      })
    ).rejects.toEqual({ offline: true })

    const queue = useOfflineQueueStore()
    expect(queue.queue).toHaveLength(0)
    expect(requestFetchMock).not.toHaveBeenCalled()
  })

  it('keeps pending preview discoverable from queue after simulated refresh', async () => {
    const requestFetchMock = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as { useRequestFetch?: unknown }).useRequestFetch = vi.fn(() => requestFetchMock)

    const offlineFetch = useOfflineFetch()
    await expect(
      offlineFetch('http://localhost:8787/api/purchases/302/photos', {
        method: 'POST',
        body: {
          fileBase64: 'data:image/webp;base64,BBBB',
          mimeType: 'image/webp'
        }
      })
    ).rejects.toEqual({ offline: true })

    const firstStore = useOfflineQueueStore()
    const persistedSnapshot = JSON.parse(JSON.stringify(firstStore.queue)) as Array<{
      id: string
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
      url: string
      body?: unknown
    }>

    // Simulate browser refresh -> new app instance hydrates queue from persistence
    setActivePinia(createPinia())
    const refreshedStore = useOfflineQueueStore()
    refreshedStore.queue.push(...persistedSnapshot)

    const previews = getQueuedPendingPhotoPreviews(refreshedStore.queue, 302)
    expect(previews).toHaveLength(1)
    expect(previews[0]).toEqual({
      id: `queue-${persistedSnapshot[0].id}`,
      previewUrl: 'data:image/webp;base64,BBBB'
    })
  })

  it('queues request when runtime fetch fails with network error even if navigator reports online', async () => {
    vi.stubGlobal('navigator', { onLine: true })

    const requestFetchMock = vi.fn().mockRejectedValue(new Error('fetch failed'))
    ;(globalThis as { useRequestFetch?: unknown }).useRequestFetch = vi.fn(() => requestFetchMock)

    const offlineFetch = useOfflineFetch()

    await expect(
      offlineFetch('http://localhost:8787/api/purchases/302/photos', {
        method: 'POST',
        body: {
          fileBase64: 'data:image/webp;base64,CCCC',
          mimeType: 'image/webp'
        }
      })
    ).rejects.toEqual({ offline: true })

    const queue = useOfflineQueueStore()
    expect(queue.queue).toHaveLength(1)
    expect(queue.queue[0]).toMatchObject({
      method: 'POST',
      url: 'http://localhost:8787/api/purchases/302/photos'
    })
  })

  it('does not queue HTTP application errors', async () => {
    vi.stubGlobal('navigator', { onLine: true })

    const apiError = Object.assign(new Error('Bad Request'), { statusCode: 400 })
    const requestFetchMock = vi.fn().mockRejectedValue(apiError)
    ;(globalThis as { useRequestFetch?: unknown }).useRequestFetch = vi.fn(() => requestFetchMock)

    const offlineFetch = useOfflineFetch()

    await expect(
      offlineFetch('http://localhost:8787/api/purchases/302/photos', {
        method: 'POST',
        body: {
          fileBase64: 'data:image/webp;base64,DDDD',
          mimeType: 'image/webp'
        }
      })
    ).rejects.toBe(apiError)

    const queue = useOfflineQueueStore()
    expect(queue.queue).toHaveLength(0)
  })

  it('queues status=0 failures for photo upload endpoint', async () => {
    vi.stubGlobal('navigator', { onLine: true })

    const transportError = Object.assign(new Error('Load failed'), { status: 0 })
    const requestFetchMock = vi.fn().mockRejectedValue(transportError)
    ;(globalThis as { useRequestFetch?: unknown }).useRequestFetch = vi.fn(() => requestFetchMock)

    const offlineFetch = useOfflineFetch()

    await expect(
      offlineFetch('http://localhost:8787/api/purchases/301/photos', {
        method: 'POST',
        body: {
          fileBase64: 'data:image/webp;base64,FFFF',
          mimeType: 'image/webp'
        }
      })
    ).rejects.toEqual({ offline: true })

    const queue = useOfflineQueueStore()
    expect(queue.queue).toHaveLength(1)
    expect(queue.queue[0]).toMatchObject({
      method: 'POST',
      url: 'http://localhost:8787/api/purchases/301/photos'
    })
  })

  it('queues wrapped transport errors with statusCode=500 when message indicates internet disconnected', async () => {
    vi.stubGlobal('navigator', { onLine: true })

    const transportWrapped = Object.assign(new Error('TypeError: Failed to fetch (net::ERR_INTERNET_DISCONNECTED)'), {
      statusCode: 500,
      data: null
    })
    const requestFetchMock = vi.fn().mockRejectedValue(transportWrapped)
    ;(globalThis as { useRequestFetch?: unknown }).useRequestFetch = vi.fn(() => requestFetchMock)

    const offlineFetch = useOfflineFetch()

    await expect(
      offlineFetch('http://localhost:8787/api/purchases/301/photos', {
        method: 'POST',
        body: {
          fileBase64: 'data:image/webp;base64,GGGG',
          mimeType: 'image/webp'
        }
      })
    ).rejects.toEqual({ offline: true })

    const queue = useOfflineQueueStore()
    expect(queue.queue).toHaveLength(1)
    expect(queue.queue[0]).toMatchObject({
      method: 'POST',
      url: 'http://localhost:8787/api/purchases/301/photos'
    })
  })

  it('queues photo upload parser failures even when status is 200', async () => {
    vi.stubGlobal('navigator', { onLine: true })

    const parserError = Object.assign(new Error('Unexpected token < in JSON at position 0'), {
      status: 200,
      response: { status: 200 }
    })
    const requestFetchMock = vi.fn().mockRejectedValue(parserError)
    ;(globalThis as { useRequestFetch?: unknown }).useRequestFetch = vi.fn(() => requestFetchMock)

    const offlineFetch = useOfflineFetch()

    await expect(
      offlineFetch('http://localhost:8787/api/purchases/302/photos', {
        method: 'POST',
        body: {
          fileBase64: 'data:image/webp;base64,HHHH',
          mimeType: 'image/webp'
        }
      })
    ).rejects.toEqual({ offline: true })

    const queue = useOfflineQueueStore()
    expect(queue.queue).toHaveLength(1)
    expect(queue.queue[0]).toMatchObject({
      method: 'POST',
      url: 'http://localhost:8787/api/purchases/302/photos'
    })
  })

  it('queues status-less mutation errors even if navigator reports online', async () => {
    vi.stubGlobal('navigator', { onLine: true })

    // Simulates parser/fallback errors that happen in some offline-refresh
    // browser states where there is no HTTP status on the thrown error.
    const requestFetchMock = vi.fn().mockRejectedValue(new Error('Unexpected token < in JSON at position 0'))
    ;(globalThis as { useRequestFetch?: unknown }).useRequestFetch = vi.fn(() => requestFetchMock)

    const offlineFetch = useOfflineFetch()

    await expect(
      offlineFetch('http://localhost:8787/api/purchases/302/photos', {
        method: 'POST',
        body: {
          fileBase64: 'data:image/webp;base64,EEEE',
          mimeType: 'image/webp'
        }
      })
    ).rejects.toEqual({ offline: true })

    const queue = useOfflineQueueStore()
    expect(queue.queue).toHaveLength(1)
    expect(queue.queue[0]).toMatchObject({
      method: 'POST',
      url: 'http://localhost:8787/api/purchases/302/photos'
    })
  })
})
