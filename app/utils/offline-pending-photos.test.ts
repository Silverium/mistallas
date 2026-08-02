import { describe, it, expect } from 'vitest'
import { getQueuedPendingPhotoPreviews } from './offline-pending-photos'

describe('getQueuedPendingPhotoPreviews', () => {
  it('extracts queued photo previews for a purchase id', () => {
    const queue = [
      {
        id: 'a1',
        method: 'POST',
        url: '/api/purchases/12/photos',
        body: {
          fileBase64: 'data:image/webp;base64,AAAA',
          mimeType: 'image/webp'
        }
      },
      {
        id: 'a2',
        method: 'PATCH',
        url: '/api/purchases/12',
        body: {}
      },
      {
        id: 'a3',
        method: 'POST',
        url: '/api/purchases/13/photos',
        body: {
          fileBase64: 'data:image/webp;base64,BBBB',
          mimeType: 'image/webp'
        }
      }
    ]

    const previews = getQueuedPendingPhotoPreviews(queue, 12)

    expect(previews).toEqual([
      {
        id: 'queue-a1',
        previewUrl: 'data:image/webp;base64,AAAA'
      }
    ])
  })

  it('builds data url when queue stores raw base64 payload', () => {
    const queue = [
      {
        id: 'raw1',
        method: 'POST',
        url: '/api/purchases/55/photos',
        body: {
          fileBase64: 'CCCC',
          mimeType: 'image/jpeg'
        }
      }
    ]

    const previews = getQueuedPendingPhotoPreviews(queue, 55)

    expect(previews).toEqual([
      {
        id: 'queue-raw1',
        previewUrl: 'data:image/jpeg;base64,CCCC'
      }
    ])
  })

  it('supports absolute URLs in queued photo upload endpoints', () => {
    const queue = [
      {
        id: 'abs1',
        method: 'POST',
        url: 'http://localhost:8787/api/purchases/302/photos',
        body: {
          fileBase64: 'data:image/webp;base64,DDDD',
          mimeType: 'image/webp'
        }
      }
    ]

    const previews = getQueuedPendingPhotoPreviews(queue, 302)

    expect(previews).toEqual([
      {
        id: 'queue-abs1',
        previewUrl: 'data:image/webp;base64,DDDD'
      }
    ])
  })

  it('ignores malformed queue entries without image payload', () => {
    const queue = [
      {
        id: 'bad1',
        method: 'POST',
        url: '/api/purchases/90/photos',
        body: {
          fileBase64: 1234
        }
      },
      {
        id: 'bad2',
        method: 'POST',
        url: '/api/purchases/90/photos',
        body: {}
      }
    ]

    const previews = getQueuedPendingPhotoPreviews(queue, 90)
    expect(previews).toEqual([])
  })
})
