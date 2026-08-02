import { blobToBase64 } from '../utils/image-compression'
import type { QueuedMutation } from './useOfflineQueue'
import type { PendingPhoto } from './usePendingPhotosStore'
import { useOfflineQueueStore } from './useOfflineQueue'
import { usePendingPhotosStore } from './usePendingPhotosStore'

type OfflineQueueLike = {
  queue: QueuedMutation[]
  dequeue: (id: string) => void
}

type PendingPhotosLike = {
  pendingPhotos: PendingPhoto[]
  removePhoto: (id: string) => void
}

type SyncRequestOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

const FLUSH_RETRY_MS = 3000
const ONLINE_WATCHDOG_MS = 2500

export function shouldAnnounceReconnection({
  online,
  wasOnline,
  hadBeenOffline
}: {
  online: boolean
  wasOnline: boolean | undefined
  hadBeenOffline: boolean
}) {
  if (!online) {
    return false
  }

  return wasOnline === false || hadBeenOffline
}

export function shouldScheduleFlushRetry({
  online,
  remainingQueue,
  remainingPending,
  progressMade
}: {
  online: boolean
  remainingQueue: number
  remainingPending: number
  progressMade: boolean
}) {
  if (!online) {
    return false
  }

  if (progressMade) {
    return false
  }

  return remainingQueue > 0 || remainingPending > 0
}

export function shouldFlushWhenWorkAppears({
  online,
  remainingQueue,
  remainingPending
}: {
  online: boolean
  remainingQueue: number
  remainingPending: number
}) {
  return online && (remainingQueue > 0 || remainingPending > 0)
}

function getErrorStatus(error: unknown): number | null {
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

function parsePathname(inputUrl: string): string {
  try {
    return new URL(inputUrl).pathname
  }
  catch {
    // Relative paths need a base URL for parsing.
    const fallbackBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    return new URL(inputUrl, fallbackBase).pathname
  }
}

function getPurchaseIdFromPhotoUploadMutation(entry: Pick<QueuedMutation, 'method' | 'url'>): number | null {
  if (entry.method.toUpperCase() !== 'POST') {
    return null
  }

  const pathname = parsePathname(entry.url)
  const match = pathname.match(/^\/api\/purchases\/(\d+)\/photos\/?$/)
  if (!match) {
    return null
  }

  const purchaseId = Number(match[1])
  return Number.isFinite(purchaseId) && purchaseId > 0 ? purchaseId : null
}

function countQueuedPhotoUploads(queue: QueuedMutation[]) {
  const counts = new Map<number, number>()

  for (const entry of queue) {
    const purchaseId = getPurchaseIdFromPhotoUploadMutation(entry)
    if (!purchaseId) {
      continue
    }

    counts.set(purchaseId, (counts.get(purchaseId) ?? 0) + 1)
  }

  return counts
}

function isMutationMethod(method: string) {
  const normalized = method.toUpperCase()
  return normalized === 'POST' || normalized === 'PATCH' || normalized === 'DELETE'
}

export async function flushOfflineWork({
  offlineQueue,
  pendingPhotos,
  request
}: {
  offlineQueue: OfflineQueueLike
  pendingPhotos: PendingPhotosLike
  request: (url: string, options: SyncRequestOptions) => Promise<unknown>
}) {
  // CRITICAL FIX: Migrate any photo uploads that still reference pending purchase UUIDs
  // These need to be removed from the queue because they'll get 400 errors
  // They should have been migrated by the purchases query, but if they're still here, drop them
  // The pending purchase will be synced and these photos will be re-uploaded from the pending store
  const uuidPhotoUploads = offlineQueue.queue.filter((entry) => {
    const isPhotoUpload = entry.url.includes('/photos')
    const hasUuidPurchaseId = /\/api\/purchases\/[a-f0-9-]{36}\/photos/.test(entry.url)
    return isPhotoUpload && hasUuidPurchaseId
  })

  for (const entry of uuidPhotoUploads) {
    offlineQueue.dequeue(entry.id)
  }

  // Backward compatibility: older app versions queued GET requests.
  // They are read operations and can block replay order forever after reconnect,
  // preventing photo upload POSTs from being processed.
  const legacyReads = offlineQueue.queue.filter(entry => !isMutationMethod(entry.method))
  for (const entry of legacyReads) {
    offlineQueue.dequeue(entry.id)
  }

  const pendingQueue = [...offlineQueue.queue]
  const syncedEntries: QueuedMutation[] = []
  const syncedPhotoPurchaseIds: number[] = []
  let droppedMutations = 0

  for (const entry of pendingQueue) {
    try {
      await request(entry.url, {
        method: entry.method,
        body: entry.body as Record<string, unknown>
      })
      offlineQueue.dequeue(entry.id)
      syncedEntries.push(entry)
    }
    catch (error) {
      const status = getErrorStatus(error)

      // Drop unrecoverable client errors so they don't block the rest of the
      // queue forever (e.g. stale edits/deletes). Continue processing.
      if (status != null && status >= 400 && status < 500) {
        offlineQueue.dequeue(entry.id)
        droppedMutations++
        continue
      }

      // Stop on network/server failures to preserve request order.
      break
    }
  }

  // If synced entries included queued photo uploads, clear exactly one pending
  // preview per synced upload (same purchase id), preserving order.
  for (const entry of syncedEntries) {
    const purchaseId = getPurchaseIdFromPhotoUploadMutation(entry)
    if (!purchaseId) {
      continue
    }

    syncedPhotoPurchaseIds.push(purchaseId)

    const pendingForPurchase = pendingPhotos.pendingPhotos.find(photo => photo.purchaseId === purchaseId)
    if (pendingForPurchase) {
      pendingPhotos.removePhoto(pendingForPurchase.id)
    }
  }

  // Fallback: upload any remaining pending photos that are not represented in
  // the queue (e.g. legacy pending records or queue corruption recovery).
  let uploadedFromPendingStore = 0
  const queuedPhotoCounts = countQueuedPhotoUploads(offlineQueue.queue)
  const pendingSnapshot = [...pendingPhotos.pendingPhotos]

  for (const photo of pendingSnapshot) {
    // Skip pending photos with UUID purchase IDs (pending purchases not yet synced to server)
    // These will be uploaded after the purchase syncs and gets a real numeric ID
    if (typeof photo.purchaseId !== 'number' || photo.purchaseId <= 0) {
      continue
    }

    const queuedCount = queuedPhotoCounts.get(photo.purchaseId) ?? 0
    if (queuedCount > 0) {
      queuedPhotoCounts.set(photo.purchaseId, queuedCount - 1)
      continue
    }

    try {
      const response = await fetch(photo.blobUrl)
      const blob = await response.blob()
      const fileBase64 = await blobToBase64(blob)

      await request(`/api/purchases/${photo.purchaseId}/photos`, {
        method: 'POST',
        body: {
          fileBase64,
          mimeType: photo.mimeType
        }
      })

      pendingPhotos.removePhoto(photo.id)
      uploadedFromPendingStore++
    }
    catch {
      // Stop on first failure to avoid skipping order-sensitive retries.
      break
    }
  }

  return {
    syncedMutations: syncedEntries.length,
    uploadedFromPendingStore,
    droppedMutations,
    syncedPhotoPurchaseIds
  }
}

function applySyncedPhotoSlotsToOfflineCache(
  offlineData: { purchasePages: Record<string, { purchases?: unknown[] }> },
  purchaseIds: number[]
) {
  if (!purchaseIds.length) {
    return
  }

  const targets = new Set(purchaseIds)

  for (const pageKey in offlineData.purchasePages) {
    const page = offlineData.purchasePages[pageKey]
    const records = page?.purchases as Array<Record<string, unknown>> | undefined
    if (!records?.length) {
      continue
    }

    for (const purchase of records) {
      const purchaseId = Number(purchase.id)
      if (!targets.has(purchaseId)) {
        continue
      }

      const currentSlots = Array.isArray(purchase.photoSlots)
        ? purchase.photoSlots
          .map(slot => Number(slot))
          .filter(slot => Number.isFinite(slot) && slot > 0) as number[]
        : []

      let nextSlot: number | null = null
      for (const slot of [1, 2, 3]) {
        if (!currentSlots.includes(slot)) {
          nextSlot = slot
          break
        }
      }

      if (nextSlot != null) {
        purchase.photoSlots = [...currentSlots, nextSlot].sort((a, b) => a - b)
      }
    }
  }
}

/**
 * Tracks network connectivity and automatically flushes the offline mutation
 * queue and uploads pending photos when the device reconnects.
 * Call once at the app root (app.vue).
 */
export function useNetworkStatus() {
  const globalOnlineState = useState<boolean>('network-online', () => import.meta.client ? navigator.onLine : true)
  const isOnline = computed(() => globalOnlineState.value)
  const syncVersion = useState<number>('network-sync-version', () => 0)
  const syncedPhotoPurchases = useState<number[]>('network-synced-photo-purchase-ids', () => [])
  const offlineData = useOfflineDataStore()
  const offlineQueue = useOfflineQueueStore()
  const pendingPhotos = usePendingPhotosStore()
  const queryCache = useQueryCache()
  const toast = useToast()
  const hadBeenOffline = ref(false)
  const observedOfflineSignal = ref(false)
  const isFlushing = ref(false)
  const flushRetryTimer = ref<number | null>(null)
  const onlineWatchdogTimer = ref<number | null>(null)
  const queuedWorkCount = computed(() => offlineQueue.queue.length + pendingPhotos.pendingPhotos.length)

  // Hydration guard: SSR initializes this state as `true` (no navigator on server).
  // On client refresh while offline, correct it synchronously during setup so the
  // first client render uses the real connectivity status.
  if (import.meta.client) {
    const initialClientOnline = navigator.onLine
    if (globalOnlineState.value !== initialClientOnline) {
      globalOnlineState.value = initialClientOnline
    }
  }

  if (!globalOnlineState.value) {
    hadBeenOffline.value = true
  }

  const clearFlushRetry = () => {
    if (!import.meta.client) {
      return
    }

    if (flushRetryTimer.value != null) {
      window.clearTimeout(flushRetryTimer.value)
      flushRetryTimer.value = null
    }
  }

  const scheduleFlushRetry = () => {
    if (!import.meta.client) {
      return
    }

    if (flushRetryTimer.value != null) {
      return
    }

    flushRetryTimer.value = window.setTimeout(() => {
      flushRetryTimer.value = null
      void flushQueue()
    }, FLUSH_RETRY_MS)
  }

  const clearOnlineWatchdog = () => {
    if (!import.meta.client) {
      return
    }

    if (onlineWatchdogTimer.value != null) {
      window.clearTimeout(onlineWatchdogTimer.value)
      onlineWatchdogTimer.value = null
    }
  }

  const scheduleOnlineWatchdog = () => {
    if (!import.meta.client) {
      return
    }

    if (!isOnline.value) {
      clearOnlineWatchdog()
      return
    }

    if (onlineWatchdogTimer.value != null) {
      return
    }

    onlineWatchdogTimer.value = window.setTimeout(async () => {
      onlineWatchdogTimer.value = null

      if (shouldFlushWhenWorkAppears({
        online: isOnline.value,
        remainingQueue: offlineQueue.queue.length,
        remainingPending: pendingPhotos.pendingPhotos.length
      })) {
        await flushQueue()
      }

      scheduleOnlineWatchdog()
    }, ONLINE_WATCHDOG_MS)
  }

  const applyBrowserOnlineState = (online: boolean) => {
    if (globalOnlineState.value === online) {
      return
    }

    globalOnlineState.value = online
  }

  const notifyServiceWorkerNetworkHint = (online: boolean) => {
    if (!import.meta.client || !('serviceWorker' in navigator)) {
      return
    }

    const controller = navigator.serviceWorker.controller
    if (!controller) {
      return
    }

    controller.postMessage({
      type: 'CLIENT_NETWORK_HINT',
      online
    })
  }

  const handleBrowserOnline = () => {
    notifyServiceWorkerNetworkHint(true)
    applyBrowserOnlineState(true)
  }

  const handleBrowserOffline = () => {
    observedOfflineSignal.value = true
    notifyServiceWorkerNetworkHint(false)
    applyBrowserOnlineState(false)
  }

  const handleServiceWorkerMessage = (event: MessageEvent) => {
    const payload = event.data as { type?: string, online?: boolean } | undefined
    if (!payload || typeof payload.type !== 'string') {
      return
    }

    if (payload.type === 'NETWORK_OFFLINE') {
      observedOfflineSignal.value = true
      applyBrowserOnlineState(false)
      return
    }

    if (payload.type === 'NETWORK_ONLINE') {
      applyBrowserOnlineState(true)
      return
    }

    if (payload.type === 'NETWORK_STATUS' && typeof payload.online === 'boolean') {
      if (!payload.online) {
        observedOfflineSignal.value = true
      }
      applyBrowserOnlineState(payload.online)
    }
  }

  const requestServiceWorkerNetworkStatus = () => {
    if (!import.meta.client || !('serviceWorker' in navigator)) {
      return
    }

    const controller = navigator.serviceWorker.controller
    if (!controller) {
      return
    }

    const channel = new MessageChannel()
    channel.port1.onmessage = handleServiceWorkerMessage
    controller.postMessage({ type: 'GET_NETWORK_STATUS' }, [channel.port2])
  }

  watch(globalOnlineState, async (online, wasOnline) => {
    if (!online) {
      clearFlushRetry()
      clearOnlineWatchdog()
      hadBeenOffline.value = true
      return
    }

    if (observedOfflineSignal.value && shouldAnnounceReconnection({
      online,
      wasOnline,
      hadBeenOffline: hadBeenOffline.value
    })) {
      toast.add({ title: 'Conexión restablecida.' })
      hadBeenOffline.value = false
      observedOfflineSignal.value = false

      // Refresh core cached lists on reconnect even when no queued mutations
      // were pending, so offline screens repopulate from live API immediately.
      await queryCache.invalidateQueries({ key: ['purchases'] })
      await queryCache.invalidateQueries({ key: ['measurements'] })
    }

    if (shouldFlushWhenWorkAppears({
      online,
      remainingQueue: offlineQueue.queue.length,
      remainingPending: pendingPhotos.pendingPhotos.length
    })) {
      await flushQueue()
    }

    scheduleOnlineWatchdog()
  })

  // Handle race conditions where work is queued shortly AFTER we are already
  // online (e.g. upload flow finishes compression while reconnection occurred).
  watch(queuedWorkCount, async () => {
    if (shouldFlushWhenWorkAppears({
      online: isOnline.value,
      remainingQueue: offlineQueue.queue.length,
      remainingPending: pendingPhotos.pendingPhotos.length
    })) {
      await flushQueue()
    }

    scheduleOnlineWatchdog()
  })

  // Flush on mount in case the device was offline during a previous session
  // and came back online before this composable was instantiated
  onMounted(async () => {
    if (import.meta.client) {
      applyBrowserOnlineState(navigator.onLine)
      window.addEventListener('online', handleBrowserOnline)
      window.addEventListener('offline', handleBrowserOffline)

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)
        requestServiceWorkerNetworkStatus()
      }
    }

    if (shouldFlushWhenWorkAppears({
      online: isOnline.value,
      remainingQueue: offlineQueue.queue.length,
      remainingPending: pendingPhotos.pendingPhotos.length
    })) {
      await flushQueue()
    }

    scheduleOnlineWatchdog()
  })

  onBeforeUnmount(() => {
    if (!import.meta.client) {
      return
    }

    window.removeEventListener('online', handleBrowserOnline)
    window.removeEventListener('offline', handleBrowserOffline)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
    }
  })

  async function flushQueue() {
    if (isFlushing.value) {
      return
    }

    isFlushing.value = true

    let result: Awaited<ReturnType<typeof flushOfflineWork>>
    try {
      result = await flushOfflineWork({
        offlineQueue,
        pendingPhotos,
        request: (url, options) => $fetch(url, {
          method: options.method,
          body: options.body as Record<string, unknown> | undefined
        })
      })
    }
    finally {
      isFlushing.value = false
    }

    const progressMade = result.syncedMutations > 0 || result.uploadedFromPendingStore > 0 || result.droppedMutations > 0
    if (shouldScheduleFlushRetry({
      online: isOnline.value,
      remainingQueue: offlineQueue.queue.length,
      remainingPending: pendingPhotos.pendingPhotos.length,
      progressMade
    })) {
      scheduleFlushRetry()
    }
    else {
      clearFlushRetry()
    }

    scheduleOnlineWatchdog()

    if (progressMade) {
      applySyncedPhotoSlotsToOfflineCache(offlineData, result.syncedPhotoPurchaseIds)
      syncedPhotoPurchases.value = result.syncedPhotoPurchaseIds

      await queryCache.invalidateQueries({ key: ['purchases'] })
      await queryCache.invalidateQueries({ key: ['measurements'] })
      syncVersion.value += 1
      toast.add({
        title: `${result.syncedMutations} cambio${result.syncedMutations !== 1 ? 's' : ''} sincronizado${result.syncedMutations !== 1 ? 's' : ''}.`
      })

      if (result.uploadedFromPendingStore > 0) {
        toast.add({
          title: `${result.uploadedFromPendingStore} foto${result.uploadedFromPendingStore !== 1 ? 's' : ''} sincronizada${result.uploadedFromPendingStore !== 1 ? 's' : ''}.`
        })
      }

      if (result.droppedMutations > 0) {
        toast.add({
          title: `${result.droppedMutations} cambio${result.droppedMutations !== 1 ? 's' : ''} descartado${result.droppedMutations !== 1 ? 's' : ''} por conflicto.`
        })
      }
    }
  }

  return {
    isOnline,
    pendingCount: computed(() => offlineQueue.queue.length + pendingPhotos.pendingPhotos.length)
  }
}
