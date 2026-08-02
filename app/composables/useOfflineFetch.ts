import { useOfflineQueueStore } from './useOfflineQueue'

export interface OfflineQueuedError {
  offline: true
}

function isMutationMethod(method: string) {
  return method === 'POST' || method === 'PATCH' || method === 'DELETE'
}

function parsePathname(inputUrl: string): string {
  try {
    return new URL(inputUrl).pathname
  }
  catch {
    const fallbackBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    return new URL(inputUrl, fallbackBase).pathname
  }
}

function isPhotoUploadEndpoint(url: string) {
  const pathname = parsePathname(url)
  return /^\/api\/purchases\/\d+\/photos\/?$/.test(pathname)
}

function extractHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const candidate = error as Record<string, unknown>
  const status = candidate.status
  if (typeof status === 'number' && Number.isFinite(status)) {
    return status
  }

  const statusCode = candidate.statusCode
  if (typeof statusCode === 'number' && Number.isFinite(statusCode)) {
    return statusCode
  }

  return null
}

function hasHttpStatus(error: unknown) {
  const status = extractHttpStatus(error)
  // status=0 should be treated as a transport/network failure.
  return status != null && status > 0
}

function isLikelyNetworkFailure(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as Record<string, unknown>
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : ''
  const code = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : ''
  const cause = candidate.cause
  const causeCode = cause && typeof cause === 'object' && typeof (cause as Record<string, unknown>).code === 'string'
    ? String((cause as Record<string, unknown>).code).toLowerCase()
    : ''

  const hasNetworkSignature = (
    message.includes('err_internet_disconnected')
    || message.includes('internet_disconnected')
    || message.includes('failed to fetch')
    || message.includes('fetch failed')
    || message.includes('network')
    || message.includes('load failed')
    || code.includes('err_internet_disconnected')
    || causeCode.includes('err_internet_disconnected')
  )

  if (hasNetworkSignature && (message.includes('err_internet_disconnected') || code.includes('err_internet_disconnected') || causeCode.includes('err_internet_disconnected'))) {
    return true
  }

  // HTTP responses should not be treated as offline queueable failures.
  const status = extractHttpStatus(error)
  if (status === 0) {
    return true
  }

  if (status != null && status > 0) {
    // Some wrappers map transport failures to 500 without a real response.
    const hasResponseObject = 'response' in candidate && candidate.response != null
    const hasResponseData = 'data' in candidate && candidate.data != null
    if (!hasResponseObject && !hasResponseData && hasNetworkSignature) {
      return true
    }
    return false
  }

  return hasNetworkSignature
}

function isLikelyJsonParseFailure(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as Record<string, unknown>
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : ''

  return (
    message.includes('unexpected token')
    || message.includes('json')
    || message.includes('not valid json')
  )
}

export function isOfflineQueuedError(err: unknown): err is OfflineQueuedError {
  return (
    !!err
    && typeof err === 'object'
    && 'offline' in err
    && (err as Record<string, unknown>).offline === true
  )
}

/**
 * Drop-in replacement for `useRequestFetch()` that queues requests
 * when the device is offline and throws an
 * `OfflineQueuedError` so callers can react accordingly.
 */
export function useOfflineFetch() {
  const requestFetch = useRequestFetch()
  const offlineQueue = useOfflineQueueStore()

  const queueMutation = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    body: unknown
  ) => {
    if (!isMutationMethod(method)) {
      return
    }

    offlineQueue.enqueue({
      method,
      url,
      body
    })
  }

  return async function offlineFetch<T = unknown>(
    url: string,
    options?: { method?: string; body?: unknown } & Record<string, unknown>
  ): Promise<T> {
    const method = String(options?.method ?? 'GET').toUpperCase() as 'GET' | 'POST' | 'PATCH' | 'DELETE'
    const isMutation = isMutationMethod(method)

    if (!navigator.onLine) {
      queueMutation(method, url, options?.body)
      return Promise.reject({ offline: true } satisfies OfflineQueuedError)
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await requestFetch<T>(url, options as any)
    }
    catch (error) {
      // Handle runtime network failures even when navigator.onLine is stale.
      const isStatuslessFailure = !hasHttpStatus(error)
      const isPhotoUpload = isPhotoUploadEndpoint(url)
      const isLikelyOfflineParseFailure = isPhotoUpload && isMutation && isLikelyJsonParseFailure(error)

      if (!navigator.onLine || isLikelyNetworkFailure(error) || (isMutation && isStatuslessFailure) || isLikelyOfflineParseFailure) {
        queueMutation(method, url, options?.body)
        throw { offline: true } satisfies OfflineQueuedError
      }

      throw error
    }
  }
}
