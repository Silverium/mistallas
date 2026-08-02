type QueuedMutationLike = {
  id: string
  method: string
  url: string
  body?: unknown
}

export type PendingPhotoPreviewItem = {
  id: string // ← LOCAL UUID for tracking (from PendingPhoto.id), NOT server photoId
  previewUrl: string
}

function extractRawBase64(value: string): string {
  if (value.includes(',')) {
    return value.split(',').pop() || ''
  }

  return value
}

function normalizeDataUrl(value: string, mimeType?: string): string | null {
  if (!value) {
    return null
  }

  if (value.startsWith('data:image/')) {
    return value
  }

  const mime = typeof mimeType === 'string' && mimeType.startsWith('image/')
    ? mimeType
    : 'image/webp'

  const base64 = extractRawBase64(value)
  if (!base64) {
    return null
  }

  return `data:${mime};base64,${base64}`
}

export function getQueuedPendingPhotoPreviews(queue: QueuedMutationLike[], purchaseId: number): PendingPhotoPreviewItem[] {
  const endpointPattern = new RegExp(`/api/purchases/${purchaseId}/photos(?:\\?|$)`)

  return queue
    .filter((entry) => {
      if (entry.method.toUpperCase() !== 'POST') {
        return false
      }

      return endpointPattern.test(entry.url)
    })
    .map((entry) => {
      const body = entry.body as { fileBase64?: unknown; mimeType?: unknown } | undefined
      const fileBase64 = typeof body?.fileBase64 === 'string' ? body.fileBase64 : ''
      const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : undefined
      const previewUrl = normalizeDataUrl(fileBase64, mimeType)

      if (!previewUrl) {
        return null
      }

      return {
        id: `queue-${entry.id}`,
        previewUrl
      }
    })
    .filter((item): item is PendingPhotoPreviewItem => item !== null)
}
