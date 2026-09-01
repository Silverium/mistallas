<script setup lang="ts">
import { calculateMultiWordSearchScore } from '~/utils/fuzzy-search'
import { getSpanishApiErrorMessage, isNuxtZodError } from '~/utils/errors'
import { blobToBase64, compressImage } from '~/utils/image-compression'
import { measurementSpecs } from '~/utils/measurementSpecs'
import PurchasePhotoUploadGrid from '../components/purchases/PurchasePhotoUploadGrid.vue'
import { buildOfflinePurchasesResult } from '~/utils/offline-purchases'
import { getQueuedPendingPhotoPreviews } from '~/utils/offline-pending-photos'
import { shouldEnableOfflineProtectedQuery } from '~/utils/offline-query-access'
import { useSyncedStringQueryParam } from '~/utils/query-param'
import { useEffectiveSession } from '~/composables/useEffectiveSession'
import { isOfflineQueuedError } from '~/composables/useOfflineFetch'
import { useOfflineQueueStore } from '~/composables/useOfflineQueue'
import type { OfflineCategory } from '~/composables/useOfflineData'
import { usePendingPhotosStore } from '~/composables/usePendingPhotosStore'
import { usePendingPurchasesStore } from '~/composables/usePendingPurchasesStore'
import { useOfflineRouteAccess } from '~/utils/offline-route-access'

definePageMeta({
  middleware: 'auth'
})

type Purchase = {
  id: number | string
  brand: string
  category: string
  productType: string
  sizeLabel: string
  purchasedAt: string | Date
  fitFeedback?: string | null
  notes?: string | null
  price?: number | null
  photoSlots?: number[]
  isPending?: boolean
}

type MeasurementFieldKey = typeof measurementSpecs[number]['key']
type MeasurementSnapshot = Partial<Record<MeasurementFieldKey, number | null>>

type Measurement = {
  id: number
  recordedAt: string | Date
  [key: string]: unknown
}

type ComparisonResult = {
  snapshotAtPurchase?: MeasurementSnapshot
  currentMeasurement?: MeasurementSnapshot
  offline?: boolean
  highlights?: {
    weight?: string | null
  }
  comparison?: {
    weightKg?: {
      before: number | null
      now: number | null
      delta: number | null
    }
  }
  error?: string
  availableMeasurements?: Measurement[]
}

const toast = useToast()
const queryCache = useQueryCache()
const offlineFetch = useOfflineFetch()
const offlineQueue = useOfflineQueueStore()
const pendingPhotos = usePendingPhotosStore()
const pendingPurchases = usePendingPurchasesStore()

const form = reactive({
  brand: '',
  category: '',
  productType: '',
  sizeLabel: '',
  fitFeedback: '',
  notes: '',
  price: ''
})

const selectedComparison = ref<ComparisonResult | null>(null)
const selectedPurchase = ref<Purchase | null>(null)
const selectedPhotoPurchaseId = ref<number | null>(null)
const selectedPreviewPurchase = ref<Purchase | null>(null)
const selectedPreviewSlot = ref<number | null>(null)
const photoInput = ref<HTMLInputElement | null>(null)
const directUploadPurchaseId = ref<number | string | null>(null)
const currentEditingPurchase = ref<Purchase | null>(null)
const historyFilter = useSyncedStringQueryParam('filter')
const editingPurchaseId = ref<number | null>(null)
const deletingPurchaseId = ref<number | null>(null)
const isAddPurchaseDialogOpen = ref(false)
const isEditPurchaseDialogOpen = ref(false)
const isDeletePurchaseDialogOpen = ref(false)
const pendingDeletionPurchase = ref<Purchase | null>(null)
const isDeletePhotoDialogOpen = ref(false)
const pendingDeletionPhoto = ref<{ purchaseId: number, slot: number } | null>(null)

type PendingPhotoPreview = {
  id: string
  source: 'local' | 'queue'
  file: File
  previewUrl: string
}

type RowDiff = {
  key: string
  label: string
  unit: string
  before: number
  now: number
  delta: number
}

const { loggedIn } = useEffectiveSession()
const route = useRoute()
const router = useRouter()
const isHydrated = ref(false)
const offlineRouteAccess = useOfflineRouteAccess()
const offlineStore = useOfflineDataStore()
const globalOnlineState = useState<boolean>('network-online', () => import.meta.client ? navigator.onLine : true)
const syncVersion = useState<number>('network-sync-version', () => 0)
const syncedPhotoPurchases = useState<number[]>('network-synced-photo-purchase-ids', () => [])
const isClientOffline = ref(import.meta.client ? !globalOnlineState.value : false)
const onlineRecoveryVersion = ref(0)
const connectivityPollTimer = ref<number | null>(null)
const needsOnlineRefetch = ref(false)
const isHandlingOnlineRecovery = ref(false)
const lastOnlineRecoveryAttemptAt = ref(0)
const optimisticPhotoSlotsByPurchase = ref<Record<number | string, number[]>>({})
const queuedPhotoCandidates = ref<number[]>([])
const showScrollToTopButton = ref(false)

const purchasesPage = 1
const purchasesFetchLimit = 100
const ONLINE_RECOVERY_RETRY_MS = 3_000

const updateScrollToTopVisibility = () => {
  if (!import.meta.client) {
    return
  }

  showScrollToTopButton.value = window.scrollY > 280
}

const scrollToTop = () => {
  if (!import.meta.client) {
    return
  }

  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function readOfflinePurchasePagesFromStorage() {
  if (!import.meta.client) {
    return {} as Record<string, { purchases?: unknown[] }>
  }

  const candidateKeys = ['offlineData', 'pinia-offlineData', 'pinia-persistedstate-offlineData']

  for (const key of candidateKeys) {
    const raw = localStorage.getItem(key)
    if (!raw) {
      continue
    }

    try {
      const parsed = JSON.parse(raw) as { purchasePages?: Record<string, { purchases?: unknown[] }> }
      if (parsed?.purchasePages && Object.keys(parsed.purchasePages).length > 0) {
        return parsed.purchasePages
      }
    }
    catch {
      // Ignore malformed localStorage entries and continue to next key.
    }
  }

  return {} as Record<string, { purchases?: unknown[] }>
}

const effectiveOfflinePurchasePages = computed(() => {
  if (Object.keys(offlineStore.purchasePages).length > 0) {
    return offlineStore.purchasePages
  }

  return readOfflinePurchasePagesFromStorage()
})

const offlinePurchasesVersion = ref('')

watch(
  () => Object.keys(effectiveOfflinePurchasePages.value).sort().join('|'),
  (nextVersion) => {
    if (nextVersion !== offlinePurchasesVersion.value) {
      offlinePurchasesVersion.value = nextVersion
    }
  },
  { immediate: true }
)

const offlineVersionForQuery = computed(() => {
  return isClientOffline.value ? offlinePurchasesVersion.value : 'online'
})

const { data: onlineMeasurements } = useQuery({
  key: () => ['measurements', isClientOffline.value ? 'offline' : 'online'],
  query: async () => {
    try {
      return await useRequestFetch()('/api/measurements') as unknown[]
    }
    catch {
      // In client-navigation offline transitions, measurements endpoint can
      // fail through SW/network races. Keep page functional with cached data.
      return (offlineStore.measurements ?? []) as unknown[]
    }
  },
  enabled: () => isHydrated.value && loggedIn.value && !isClientOffline.value
})

const measurements = computed(() => {
  if (isClientOffline.value) {
    return (offlineStore.measurements ?? []) as unknown[]
  }

  return (onlineMeasurements.value ?? []) as unknown[]
})

const hasMeasurements = computed(() => (measurements.value.length ?? 0) > 0)

const resolveSearchTerm = () => {
  const fromRoute = route.query.filter
  const routeFilter = Array.isArray(fromRoute) ? fromRoute[0] : fromRoute

  if (typeof routeFilter === 'string' && routeFilter.trim()) {
    return routeFilter.trim()
  }

  return historyFilter.value.trim()
}

const getUnfilteredOfflinePurchasePages = (purchasePages: Record<string, { purchases?: unknown[] }>) => {
  const entries = Object.entries(purchasePages)
  const unfiltered = entries.filter(([key]) => /^\d+:\d+:$/.test(key))

  if (unfiltered.length > 0) {
    return Object.fromEntries(unfiltered)
  }

  // Backward compatibility: if old cache key formats exist, still use them.
  return purchasePages
}

type PurchasesApiResponse = {
  purchases?: unknown[]
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

type FetchOnlinePurchasesPagePayload = {
  page: number
  search: string
  recovery: number
}

const fetchOnlinePurchasesPage = async (
  payload: FetchOnlinePurchasesPagePayload
): Promise<PurchasesApiResponse> => {
  const {
    page,
    search,
    recovery
  } = payload

  const params = new URLSearchParams({
    page: String(page),
    limit: String(purchasesFetchLimit)
  })

  if (search) {
    params.append('search', search)
  }

  if (recovery > 0) {
    params.append('_recovery', String(recovery))
  }

  return await useRequestFetch()(`/api/purchases?${params.toString()}`) as PurchasesApiResponse
}

const fetchAllOnlinePurchases = async (search: string, recovery: number) => {
  let page = 1
  let totalPages = 1
  let total = 0
  const allPurchases: unknown[] = []
  const pagesForCache: Array<{ page: number, response: PurchasesApiResponse }> = []

  do {
    const response = await fetchOnlinePurchasesPage({
      page,
      search,
      recovery
    })
    const purchases = response.purchases ?? []

    allPurchases.push(...purchases)
    pagesForCache.push({ page, response })

    totalPages = Math.max(1, response.pagination?.totalPages ?? 1)
    total = response.pagination?.total ?? allPurchases.length
    page += 1
  } while (page <= totalPages)

  return {
    response: {
      purchases: allPurchases,
      pagination: {
        page: purchasesPage,
        limit: allPurchases.length,
        total,
        totalPages: 1
      }
    },
    pagesForCache
  }
}

const persistPurchasePages = (
  pagesForCache: Array<{ page: number, response: PurchasesApiResponse }>,
  search: string
) => {
  // Filtered-search results are never read back for offline use (see
  // getUnfilteredOfflinePurchasePages) and caching them under a key that
  // embeds the raw search text leaks it into localStorage indefinitely
  // (e.g. a deleted purchase's brand lingering in a stale filtered page key).
  if (search) {
    return
  }

  for (const { page, response } of pagesForCache) {
    const pageLimit = response.pagination?.limit ?? purchasesFetchLimit

    offlineStore.setPurchasePage(page, pageLimit, search, {
      purchases: response.purchases ?? [],
      pagination: {
        page: response.pagination?.page ?? page,
        limit: pageLimit,
        total: response.pagination?.total ?? (response.purchases?.length ?? 0),
        totalPages: response.pagination?.totalPages ?? 1
      }
    })
  }
}

const getCachedPurchaseIdentity = (purchase: unknown): string | null => {
  if (!purchase || typeof purchase !== 'object') {
    return null
  }

  const id = (purchase as { id?: unknown }).id
  return id != null ? String(id) : null
}

// Keep the unfiltered offline baseline fresh even when the fetch that produced
// this data was filtered (e.g. the UI filter was set right after creating a
// purchase, before an unfiltered refetch could land). Without this, the
// offline cache can get stuck missing/outdated purchases indefinitely because
// nothing else ever re-runs an unfiltered fetch until the user clears the filter.
const upsertPurchasesIntoUnfilteredCache = (purchases: unknown[]) => {
  if (!purchases.length) {
    return
  }

  const unfilteredKeys = Object.keys(offlineStore.purchasePages).filter(key => /^\d+:\d+:$/.test(key))
  if (!unfilteredKeys.length) {
    return
  }

  const knownIds = new Set<string>()

  for (const key of unfilteredKeys) {
    const pageData = offlineStore.purchasePages[key]
    const existingPurchases = Array.isArray(pageData?.purchases) ? pageData.purchases : []
    let changed = false

    const nextPurchases = existingPurchases.map((existing: unknown) => {
      const identity = getCachedPurchaseIdentity(existing)
      if (identity) {
        knownIds.add(identity)
      }

      const fresh = identity ? purchases.find(p => getCachedPurchaseIdentity(p) === identity) : undefined
      if (!fresh) {
        return existing
      }

      changed = true
      return fresh
    })

    if (!changed) {
      continue
    }

    const [pagePart, limitPart] = key.split(':')
    offlineStore.setPurchasePage(Number.parseInt(pagePart ?? '1', 10), Number.parseInt(limitPart ?? String(purchasesFetchLimit), 10), '', {
      purchases: nextPurchases,
      pagination: pageData!.pagination
    })
  }

  const missingPurchases = purchases.filter((purchase) => {
    const identity = getCachedPurchaseIdentity(purchase)
    return identity !== null && !knownIds.has(identity)
  })

  if (!missingPurchases.length) {
    return
  }

  const firstKey = unfilteredKeys[0]!
  const firstPage = offlineStore.purchasePages[firstKey]
  const [pagePart, limitPart] = firstKey.split(':')
  const page = Number.parseInt(pagePart ?? '1', 10)
  const limit = Number.parseInt(limitPart ?? String(purchasesFetchLimit), 10)
  const mergedPurchases = [...(Array.isArray(firstPage?.purchases) ? firstPage.purchases : []), ...missingPurchases]

  offlineStore.setPurchasePage(page, limit, '', {
    purchases: mergedPurchases,
    pagination: {
      page: firstPage?.pagination?.page ?? page,
      limit: firstPage?.pagination?.limit ?? limit,
      total: mergedPurchases.length,
      totalPages: firstPage?.pagination?.totalPages ?? 1
    }
  })
}

const warmedPhotoUrls = useState<Record<string, true>>('offline-warmed-purchase-photo-urls', () => ({}))

const warmPurchasePhotoCache = (purchases: unknown[]) => {
  if (!import.meta.client || !navigator.onLine || purchases.length === 0) {
    return
  }

  const nextUrls: string[] = []

  for (const purchase of purchases) {
    if (!purchase || typeof purchase !== 'object') {
      continue
    }

    const record = purchase as { id?: unknown, photoSlots?: unknown }
    const purchaseId = record.id
    const slots = Array.isArray(record.photoSlots) ? record.photoSlots : []

    for (const rawSlot of slots) {
      const slot = Number(rawSlot)
      if (!Number.isFinite(slot) || slot <= 0) {
        continue
      }

      const url = buildPhotoUrl(typeof purchaseId === 'number' || typeof purchaseId === 'string' ? purchaseId : '', slot)
      if (!url || warmedPhotoUrls.value[url]) {
        continue
      }

      warmedPhotoUrls.value[url] = true
      nextUrls.push(url)
    }
  }

  if (nextUrls.length === 0) {
    return
  }

  for (const url of nextUrls) {
    void fetch(url, {
      credentials: 'same-origin'
    }).catch(() => {
      // Best-effort warm cache only.
    })
  }
}

const toMeasurementSnapshot = (measurement: Measurement | null | undefined): MeasurementSnapshot | undefined => {
  if (!measurement) {
    return undefined
  }

  const snapshot: MeasurementSnapshot = {}
  for (const spec of measurementSpecs) {
    const value = measurement[spec.key]
    snapshot[spec.key] = typeof value === 'number' ? value : null
  }

  return snapshot
}

const { data: purchasesResponse, refresh: refreshPurchases } = useQuery({
  key: () => [
    'purchases',
    resolveSearchTerm(),
    offlineVersionForQuery.value,
    onlineRecoveryVersion.value,
    pendingPurchases.pendingPurchases.length
  ],
  query: async () => {
    const searchTerm = resolveSearchTerm()
    const buildOfflineResult = () => {
      const unfilteredOfflinePages = getUnfilteredOfflinePurchasePages(effectiveOfflinePurchasePages.value)
      const estimatedOfflineCount = Object.values(unfilteredOfflinePages).reduce((sum, pageData) => {
        return sum + (Array.isArray(pageData?.purchases) ? pageData.purchases.length : 0)
      }, 0)

      return buildOfflinePurchasesResult(
        unfilteredOfflinePages,
        searchTerm,
        purchasesPage,
        Math.max(estimatedOfflineCount, purchasesFetchLimit),
        calculateMultiWordSearchScore,
        pendingPurchases.pendingPurchases
      )
    }

    // Offline search: use cached purchases and apply fuzzy search locally.
    // Keep this branch first so online fetch path does not depend reactively
    // on offline store writes (which can otherwise create refetch loops).
    if (isClientOffline.value) {
      const result = buildOfflineResult()
      return result
    }

    try {
      const { response, pagesForCache } = await fetchAllOnlinePurchases(searchTerm, onlineRecoveryVersion.value)

      // Persist unfiltered page snapshots only — they are the source of
      // truth for offline history. Filtered fetches are skipped inside
      // persistPurchasePages to avoid leaking search text into the cache.
      persistPurchasePages(pagesForCache, searchTerm)
      // Even when this fetch was filtered, patch its purchases into the
      // unfiltered baseline so the offline cache doesn't go stale/miss new
      // purchases while the filter happens to be active.
      upsertPurchasesIntoUnfilteredCache(response.purchases ?? [])
      warmPurchasePhotoCache(response.purchases ?? [])

      for (let i = offlineQueue.queue.length - 1; i >= 0; i--) {
        const queuedItem = offlineQueue.queue[i]!
        const queuedUrl = typeof queuedItem.url === 'string' ? queuedItem.url : ''
        const isPhotoUpload = queuedUrl.includes('/photos')
        const hasUuidPurchaseId = /\/api\/purchases\/[a-f0-9-]{36}\/photos/.test(queuedUrl)
        if (isPhotoUpload && hasUuidPurchaseId) {
          offlineQueue.dequeue(queuedItem.id)
        }
      }

      // Remove pending purchases that have been synced to the server by matching on purchase details
      // A pending purchase is considered synced if we find a matching purchase in the response
      // with the same brand, category, productType, and sizeLabel.
      // Also update any queued photo uploads to use the real synced purchase ID.
      const optimisticPendingPurchases: Array<(typeof pendingPurchases.pendingPurchases)[number]> = []

      if (pendingPurchases.pendingPurchases.length > 0 && (response.purchases?.length ?? 0) > 0) {
        for (const pending of pendingPurchases.pendingPurchases) {
          const syncedPurchase = response.purchases?.find((p: unknown) => {
            if (!p || typeof p !== 'object') return false
            const purchase = p as Record<string, unknown>
            const match = (
              purchase.brand === pending.brand
              && purchase.category === pending.category
              && purchase.productType === pending.productType
              && purchase.sizeLabel === pending.sizeLabel
            )
            return match
          }) as Record<string, unknown> | undefined

          if (syncedPurchase) {
            // Convert ID to number if it's a string
            const syncedPurchaseId = syncedPurchase.id
            let realPurchaseId: number | string = typeof syncedPurchaseId === 'number' || typeof syncedPurchaseId === 'string'
              ? syncedPurchaseId
              : pending.id
            if (typeof realPurchaseId === 'string') {
              const parsed = parseInt(realPurchaseId, 10)
              realPurchaseId = Number.isFinite(parsed) ? parsed : pending.id
            }

            const tempPendingPurchaseIdStr = pending.id as string

            // Fix queued photo uploads: replace temp purchase ID with real purchase ID
            // This fixes queued photo uploads for pending purchases that now have real IDs
            const photoUrlPattern = `/api/purchases/${tempPendingPurchaseIdStr}/photos`
            const photosToRequeue: Array<{ id: string, method: string, body: unknown }> = []

            for (let i = offlineQueue.queue.length - 1; i >= 0; i--) {
              const queuedItem = offlineQueue.queue[i]!
              if (queuedItem.url === photoUrlPattern) {
                // Dequeue the old photo upload
                photosToRequeue.push({
                  id: queuedItem.id,
                  method: queuedItem.method,
                  body: queuedItem.body
                })
                offlineQueue.dequeue(queuedItem.id)
              }
            }

            // Re-enqueue with the correct purchase ID
            for (const photo of photosToRequeue) {
              offlineQueue.enqueue({
                method: photo.method as 'POST' | 'PATCH' | 'DELETE',
                url: `/api/purchases/${realPurchaseId}/photos`,
                body: photo.body
              })
            }

            // Migrate pending photos from temp UUID ID to real numeric ID
            // This handles photos stored locally but not yet queued for upload
            const pendingPhotosForTempId = pendingPhotos.getPhotosByPurchaseId(tempPendingPurchaseIdStr)
            if (pendingPhotosForTempId.length > 0) {
              // Check how many photos the synced purchase already has
              const syncedPurchase = response.purchases?.find((p: unknown) => {
                if (!p || typeof p !== 'object') return false
                const purchase = p as Record<string, unknown>
                return (
                  purchase.brand === pending.brand
                  && purchase.category === pending.category
                  && purchase.productType === pending.productType
                  && purchase.sizeLabel === pending.sizeLabel
                )
              }) as Record<string, unknown> | undefined

              const existingPhotoSlotsOnSyncedPurchase = (syncedPurchase?.photoSlots as number[])?.length ?? 0
              const maxPhotosPerPurchase = 3
              let photosQueuedFromThisPending = 0

              for (const photo of pendingPhotosForTempId) {
                // For THIS specific purchase, check if we have room for more photos
                // Only queue if: existing photos + photos we're queuing from this pending purchase < 3
                const totalPhotosForThisPurchase = existingPhotoSlotsOnSyncedPurchase + photosQueuedFromThisPending

                if (totalPhotosForThisPurchase < maxPhotosPerPurchase) {
                  // Migrate the photo to use the real purchase ID
                  pendingPhotos.migratePhotoToNewPurchaseId(photo.id, realPurchaseId)
                  // Queue the photo for upload with the real purchase ID
                  offlineQueue.enqueue({
                    method: 'POST',
                    url: `/api/purchases/${realPurchaseId}/photos`,
                    body: {
                      fileBase64: photo.fileBase64,
                      mimeType: photo.mimeType
                    }
                  })
                  photosQueuedFromThisPending++
                }
                else {
                  // Remove photos that can't be uploaded due to this purchase's limit
                  pendingPhotos.removePhoto(photo.id)
                }
              }
            }

            pendingPurchases.removePurchaseByBrand(
              pending.brand,
              pending.category,
              pending.productType,
              pending.sizeLabel
            )
          }
          else {
            // Pending purchase was created offline but not found on server
            // Skip migration for now - will retry on next sync
            // Photos will remain in pending store with UUID purchase ID
            optimisticPendingPurchases.push(pending)
          }
        }
      }

      if (pendingPurchases.pendingPurchases.length > 0 && optimisticPendingPurchases.length > 0) {
        return buildOfflinePurchasesResult(
          { '1:100:': { purchases: response.purchases ?? [] } },
          searchTerm,
          purchasesPage,
          Math.max((response.purchases?.length ?? 0) + optimisticPendingPurchases.length, purchasesFetchLimit),
          calculateMultiWordSearchScore,
          optimisticPendingPurchases
        )
      }

      // UX guard: after reconnect, transient empty online responses should not
      // blank a previously available cached history list.
      if ((response.purchases?.length ?? 0) === 0) {
        const offlineResult = buildOfflineResult()
        if ((offlineResult.purchases?.length ?? 0) > 0) {
          return offlineResult
        }
      }

      // UX guard: after reconnect, transient empty online responses should not
      // blank a previously available cached history list.
      if ((response.purchases?.length ?? 0) === 0) {
        const offlineResult = buildOfflineResult()
        if ((offlineResult.purchases?.length ?? 0) > 0) {
          return offlineResult
        }
      }

      return response
    }
    catch {
      // Fallback to cached purchases if network fails during client-side navigation.
      if (Object.keys(effectiveOfflinePurchasePages.value).length > 0) {
        return buildOfflineResult()
      }
      throw new Error('No cached purchases available')
    }
  },
  enabled: () => shouldEnableOfflineProtectedQuery(isHydrated.value, loggedIn.value, offlineRouteAccess.value)
})

const { data: categoriesResponse } = useQuery({
  key: () => ['purchase-categories'],
  query: async () => {
    try {
      const response = await $fetch<{ categories: OfflineCategory[] }>('/api/purchases/categories')
      offlineStore.setCategories(response.categories)
      return response
    }
    catch {
      return { categories: offlineStore.getCategories() }
    }
  },
  enabled: () => shouldEnableOfflineProtectedQuery(isHydrated.value, loggedIn.value, offlineRouteAccess.value)
})

// Custom categories the user creates in this session but that haven't come
// back from the server yet (e.g. offline, or before the next refetch).
const localCustomCategoryOptions = ref<{ label: string, value: string, verified: boolean }[]>([])

const categoryOptions = computed(() => {
  const fetched = (categoriesResponse.value?.categories ?? []).map(category => ({
    label: category.name,
    value: category.name,
    verified: category.verified
  }))
  const fetchedValues = new Set(fetched.map(category => category.value.toLowerCase()))
  const localOnly = localCustomCategoryOptions.value.filter(category => !fetchedValues.has(category.value.toLowerCase()))

  return [...fetched, ...localOnly]
})

const verifiedCategoryNames = computed(() => new Set(
  (categoriesResponse.value?.categories ?? [])
    .filter(category => category.verified)
    .map(category => category.name.toLowerCase())
))

function isCategoryVerified(name: string): boolean {
  return verifiedCategoryNames.value.has(name.toLowerCase())
}

function handleCreateCategory(value: string) {
  localCustomCategoryOptions.value.push({ label: value, value, verified: false })
  form.category = value
}

watch(globalOnlineState, async (online, wasOnline) => {
  if (online === wasOnline) {
    return
  }

  if (online) {
    await handleBrowserOnline()
    return
  }

  await handleBrowserOffline()
})

watch(syncVersion, async (current, previous) => {
  if (current === previous) {
    return
  }

  if (!import.meta.client) {
    return
  }

  if (navigator.onLine) {
    isClientOffline.value = false

    promoteQueuedPhotoCandidates()

    onlineRecoveryVersion.value += 1
    await refreshPurchases()

    // Upload any pending photos for synced purchases after query completes
    await uploadPendingPhotosForSyncedPurchases()

    if (offlineQueue.queue.length === 0 && pendingPhotos.pendingPhotos.length === 0 && pendingPurchases.pendingPurchases.length > 0) {
      pendingPurchases.clear()
    }
  }
})

const applyConnectivityState = async (nextOffline: boolean) => {
  const wasOffline = isClientOffline.value
  if (wasOffline === nextOffline) {
    return
  }

  isClientOffline.value = nextOffline

  if (nextOffline) {
    needsOnlineRefetch.value = true
  }
}

// globalOnlineState is the single source of truth for connectivity (maintained
// by useNetworkStatus.ts from real SW/network signals, never from a raw
// navigator.onLine read — that flag can report "online" while the browser is
// still genuinely offline, e.g. right after a reload under network emulation).
// These handlers only react to it; they must not write it or re-derive it from
// navigator.onLine themselves, or they can flip the page online while every
// real request is still failing.
const handleBrowserOffline = async () => {
  await applyConnectivityState(true)
}

const handleBrowserOnline = async () => {
  if (isHandlingOnlineRecovery.value) {
    return
  }

  const now = Date.now()
  if (now - lastOnlineRecoveryAttemptAt.value < ONLINE_RECOVERY_RETRY_MS) {
    return
  }

  lastOnlineRecoveryAttemptAt.value = now

  isHandlingOnlineRecovery.value = true

  try {
    await applyConnectivityState(false)

    onlineRecoveryVersion.value += 1
    needsOnlineRefetch.value = false

    await queryCache.invalidateQueries({ key: ['purchases'] })
  }
  finally {
    isHandlingOnlineRecovery.value = false
  }
}

const shouldRetryOnlineRecoveryNow = () => {
  const now = Date.now()
  if (now - lastOnlineRecoveryAttemptAt.value < ONLINE_RECOVERY_RETRY_MS) {
    return false
  }
  return true
}

const triggerOnlineRecoveryRetry = () => {
  // Only retry a stalled refetch once globalOnlineState itself says we're
  // online — never based on navigator.onLine, which is unreliable here.
  if (!globalOnlineState.value) {
    return
  }

  if (!needsOnlineRefetch.value) {
    return
  }

  if (isHandlingOnlineRecovery.value) {
    return
  }

  if (!shouldRetryOnlineRecoveryNow()) {
    return
  }

  void handleBrowserOnline()
}

onMounted(() => {
  isHydrated.value = true

  if (import.meta.client) {
    isClientOffline.value = !globalOnlineState.value
    window.addEventListener('scroll', updateScrollToTopVisibility, { passive: true })
    updateScrollToTopVisibility()

    connectivityPollTimer.value = window.setInterval(() => {
      triggerOnlineRecoveryRetry()
    }, 1000)
  }
})

onBeforeUnmount(() => {
  if (import.meta.client) {
    window.removeEventListener('scroll', updateScrollToTopVisibility)

    if (connectivityPollTimer.value != null) {
      window.clearInterval(connectivityPollTimer.value)
      connectivityPollTimer.value = null
    }
  }
})

const { mutate: addPurchase, isLoading: addingPurchase } = useMutation({
  mutation: () => offlineFetch('/api/purchases', {
    method: 'POST',
    body: {
      brand: form.brand,
      category: form.category,
      productType: form.productType,
      sizeLabel: form.sizeLabel,
      fitFeedback: form.fitFeedback || undefined,
      notes: form.notes || undefined,
      price: form.price ? Number(form.price) : undefined
    }
  }),
  async onSuccess(response: unknown) {
    // When a purchase is successfully created, check if it matches any pending purchase
    // If it does, migrate photos from the pending purchase to the real one

    const responseObj = response as { purchase?: { id?: number | string, brand?: string, category?: string, productType?: string, sizeLabel?: string } } | { id?: number | string, brand?: string, category?: string, productType?: string, sizeLabel?: string }
    const newPurchase = 'purchase' in responseObj ? responseObj.purchase : responseObj

    if (newPurchase && typeof newPurchase === 'object' && 'id' in newPurchase) {
      const savedPurchase = newPurchase as { id: number | string, brand?: string, category?: string, productType?: string, sizeLabel?: string }
      const realPurchaseId = savedPurchase.id
      const brand = savedPurchase.brand || form.brand
      const category = savedPurchase.category || form.category
      const productType = savedPurchase.productType || form.productType
      const sizeLabel = savedPurchase.sizeLabel || form.sizeLabel

      // Find matching pending purchase
      const matchingPendingPurchase = pendingPurchases.pendingPurchases.find(
        p =>
          p.brand === brand
          && p.category === category
          && p.productType === productType
          && p.sizeLabel === sizeLabel
      )

      if (matchingPendingPurchase) {
        const tempPurchaseId = matchingPendingPurchase.id as string
        const pendingPhotosWithUuid = pendingPhotos.getPhotosByPurchaseId(tempPurchaseId)

        if (pendingPhotosWithUuid.length > 0) {
          // Migrate all photos to the real purchase ID
          for (const photo of pendingPhotosWithUuid) {
            pendingPhotos.migratePhotoToNewPurchaseId(photo.id, realPurchaseId)

            // Queue the photo for upload with the real purchase ID
            offlineQueue.enqueue({
              method: 'POST',
              url: `/api/purchases/${realPurchaseId}/photos`,
              body: {
                fileBase64: photo.fileBase64,
                mimeType: photo.mimeType
              }
            })
          }
        }

        // Remove the pending purchase since it's now synced
        pendingPurchases.removePurchaseByBrand(brand, category, productType, sizeLabel)
      }
    }

    await queryCache.invalidateQueries({ key: ['purchases'] })

    resetForm()
    toast.add({ title: 'Compra guardada con snapshot de medidas.' })
  },
  onError(err) {
    if (isOfflineQueuedError(err)) {
      // Add to pending purchases when queued offline
      pendingPurchases.addPurchase({
        brand: form.brand,
        category: form.category,
        productType: form.productType,
        sizeLabel: form.sizeLabel,
        fitFeedback: form.fitFeedback || null,
        notes: form.notes || null,
        price: form.price ? Number(form.price) : undefined,
        purchasedAt: new Date()
      })

      toast.add({ title: 'Sin conexión — se sincronizará al reconectarte.' })
      resetForm()
      return
    }
    if (isNuxtZodError(err)) {
      const title = err.data?.data.issues.map(issue => issue.message).join('\n')
      if (title) {
        toast.add({ title, color: 'error' })
      }
      return
    }

    const message = err && typeof err === 'object' && 'data' in err
      ? (err.data as { message?: string } | undefined)?.message
      : undefined
    toast.add({ title: message ?? 'No se pudo guardar la compra. ¿Ya registraste una medida?', color: 'error' })
  }
})

const { mutate: editPurchase, isLoading: editingPurchase } = useMutation({
  mutation: (purchaseId: number) => offlineFetch(`/api/purchases/${purchaseId}`, {
    method: 'PATCH',
    body: {
      brand: form.brand,
      category: form.category,
      productType: form.productType,
      sizeLabel: form.sizeLabel,
      fitFeedback: form.fitFeedback || undefined,
      notes: form.notes || undefined,
      price: form.price ? Number(form.price) : undefined
    }
  }),
  async onSuccess(_data) {
    await queryCache.invalidateQueries({ key: ['purchases'] })

    resetForm()
    toast.add({ title: 'Compra actualizada correctamente.' })
  },
  onError(err) {
    if (isOfflineQueuedError(err)) {
      toast.add({ title: 'Sin conexión — se sincronizará al reconectarte.' })
      resetForm()
      return
    }
    if (isNuxtZodError(err)) {
      const title = err.data?.data.issues.map(issue => issue.message).join('\n')
      if (title) {
        toast.add({ title, color: 'error' })
      }
      return
    }

    const message = err && typeof err === 'object' && 'data' in err
      ? (err.data as { message?: string } | undefined)?.message
      : undefined
    toast.add({ title: message ?? 'No se pudo actualizar la compra.', color: 'error' })
  }
})

const removePurchaseFromOfflineCache = (purchase: Purchase) => {
  const purchaseId = String(purchase.id)
  const purchaseBrand = purchase.brand
  const purchaseCategory = purchase.category
  const purchaseProductType = purchase.productType
  const purchaseSizeLabel = purchase.sizeLabel

  for (const [key, pageData] of Object.entries(offlineStore.purchasePages)) {
    const purchases = Array.isArray(pageData?.purchases) ? pageData.purchases : []
    const filteredPurchases = purchases.filter((item) => {
      if (!item || typeof item !== 'object') {
        return true
      }

      const record = item as {
        id?: unknown
        brand?: unknown
        category?: unknown
        productType?: unknown
        sizeLabel?: unknown
      }

      const matchesId = String(record.id ?? '') === purchaseId
      const matchesFingerprint = String(record.brand ?? '') === purchaseBrand
        && String(record.category ?? '') === purchaseCategory
        && String(record.productType ?? '') === purchaseProductType
        && String(record.sizeLabel ?? '') === purchaseSizeLabel

      return !(matchesId || matchesFingerprint)
    })

    if (filteredPurchases.length === purchases.length) {
      continue
    }

    const [pagePart, limitPart, ...searchParts] = key.split(':')
    const parsedPage = Number.parseInt(pagePart ?? '', 10)
    const parsedLimit = Number.parseInt(limitPart ?? '', 10)
    const page = Number.isFinite(parsedPage) ? parsedPage : 1
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : purchasesFetchLimit
    const search = searchParts.join(':')
    const removedCount = purchases.length - filteredPurchases.length

    if (filteredPurchases.length === 0) {
      Reflect.deleteProperty(offlineStore.purchasePages, key)
      continue
    }

    offlineStore.setPurchasePage(page, limit, search, {
      purchases: filteredPurchases,
      pagination: {
        page: pageData.pagination?.page ?? page,
        limit: pageData.pagination?.limit ?? limit,
        total: Math.max(0, (pageData.pagination?.total ?? purchases.length) - removedCount),
        totalPages: pageData.pagination?.totalPages ?? 1
      }
    })
  }
}

const { mutate: removePurchase, isLoading: deletingPurchase } = useMutation({
  mutation: (purchase: Purchase) => offlineFetch(`/api/purchases/${purchase.id}`, {
    method: 'DELETE'
  }),
  async onSuccess(_deleted, purchase) {
    removePurchaseFromOfflineCache(purchase)
    pendingPurchases.removePurchaseByBrand(
      purchase.brand,
      purchase.category,
      purchase.productType,
      purchase.sizeLabel
    )
    await queryCache.invalidateQueries({ key: ['purchases'] })

    if (selectedPurchase.value?.id === purchase.id) {
      selectedPurchase.value = null
      selectedComparison.value = null
    }

    if (selectedPhotoPurchaseId.value === purchase.id) {
      selectedPhotoPurchaseId.value = null
    }

    if (editingPurchaseId.value === purchase.id) {
      resetForm()
    }

    toast.add({ title: 'Compra eliminada.' })
  },
  onSettled() {
    deletingPurchaseId.value = null
  },
  onError(err) {
    if (isOfflineQueuedError(err)) {
      toast.add({ title: 'Sin conexión — se sincronizará al reconectarte.' })
      return
    }
    toast.add({ title: 'No se pudo eliminar la compra.', color: 'error' })
  }
})

const { mutate: comparePurchase, isLoading: comparing } = useMutation({
  mutation: (purchase: Purchase) => offlineFetch<ComparisonResult>(`/api/purchases/${purchase.id}/compare`),
  onSuccess(data, purchase) {
    selectedComparison.value = data
    selectedPurchase.value = purchase
  },
  onError(err, purchase) {
    if (isOfflineQueuedError(err)) {
      // Show available measurements while offline
      const availableMeasurements = (measurements.value ?? []) as Measurement[]

      // Find the measurement closest to the purchase date
      const purchaseDate = new Date(purchase.purchasedAt).getTime()
      let closestMeasurement: Measurement | null = null
      let closestDistance = Infinity

      for (const m of availableMeasurements) {
        const measurementDate = new Date(m.recordedAt).getTime()
        const distance = Math.abs(measurementDate - purchaseDate)
        if (distance < closestDistance) {
          closestDistance = distance
          closestMeasurement = m
        }
      }

      const currentMeasurement = availableMeasurements[0]

      selectedComparison.value = {
        availableMeasurements,
        currentMeasurement: toMeasurementSnapshot(currentMeasurement),
        snapshotAtPurchase: toMeasurementSnapshot(closestMeasurement),
        comparison: undefined,
        offline: true
      }
      selectedPurchase.value = purchase
      toast.add({ title: 'Sin conexión — mostrando medidas locales.' })
      return
    }
    // Real error
    selectedComparison.value = {
      error: getSpanishApiErrorMessage(err) ?? 'No se pudo generar la comparación.'
    }
    selectedPurchase.value = purchase
  }
})

const { mutate: linkMeasurementToPurchase, isLoading: linkingMeasurement } = useMutation({
  mutation: (payload: { purchaseId: number, measurementId: number }) =>
    offlineFetch<{ success: boolean, snapshot: MeasurementSnapshot }>(
      `/api/purchases/${payload.purchaseId}/link-measurement`,
      {
        method: 'POST',
        body: { measurementId: payload.measurementId }
      }
    ),
  async onSuccess(_data, payload) {
    if (selectedPurchase.value?.id === payload.purchaseId) {
      // Refresh the comparison after linking
      await comparePurchase(selectedPurchase.value)
    }
    toast.add({ title: 'Medida vinculada correctamente.' })
  },
  onError(err) {
    if (isOfflineQueuedError(err)) {
      toast.add({ title: 'Sin conexión — se sincronizará al reconectarte.' })
      return
    }
    toast.add({ title: 'No se pudo vincular la medida.', color: 'error' })
  }
})

const triggerPhotoPicker = () => {
  photoInput.value?.click()
}

const canAddPhoto = (purchase: Purchase): boolean => {
  const actualPhotos = getMergedPhotoSlots(purchase).length
  const pendingCount = getPendingPhotosForPurchase(purchase.id).length
  return actualPhotos + pendingCount < 3
}

const openEditAndAddPhoto = (purchase: Purchase) => {
  if (!canAddPhoto(purchase)) {
    toast.add({ title: 'Máximo de 3 fotos por compra alcanzado.', color: 'error' })
    return
  }
  directUploadPurchaseId.value = purchase.id
  triggerPhotoPicker()
}

const buildPhotoUrl = (purchaseId: number | string, slot: number) => {
  // Guard: only build URLs for synced (numeric) purchases
  if (typeof purchaseId === 'string' || !Number.isFinite(Number(purchaseId))) {
    return ''
  }
  return `/api/purchases/${purchaseId}/photos/${slot}`
}

const openPreview = (purchase: Purchase, slot: number) => {
  selectedPreviewPurchase.value = purchase
  selectedPreviewSlot.value = slot
}

const closePreview = () => {
  selectedPreviewPurchase.value = null
  selectedPreviewSlot.value = null
}

const previewSlots = computed(() => selectedPreviewPurchase.value?.photoSlots ?? [])

const PREVIEW_CLOSE_DRAG_THRESHOLD = 0.22

type PreviewCarouselApi = {
  scrollTo: (index: number, jump?: boolean) => void
}

type PreviewCarouselExposed = {
  emblaApi?: {
    value?: PreviewCarouselApi
  }
}

const previewCarousel = ref<PreviewCarouselExposed | null>(null)
const previewDragPercentage = ref(0)

const selectedPreviewSlotIndex = computed(() => {
  if (selectedPreviewSlot.value == null) {
    return 0
  }

  const index = previewSlots.value.findIndex(slot => slot === selectedPreviewSlot.value)
  return index >= 0 ? index : 0
})

const scrollPreviewCarouselToSelectedSlot = () => {
  const emblaApi = previewCarousel.value?.emblaApi?.value
  if (!emblaApi) {
    return
  }

  emblaApi.scrollTo(selectedPreviewSlotIndex.value, true)
}

const handlePreviewCarouselSelect = (index: number) => {
  const slot = previewSlots.value[index]
  if (slot == null) {
    return
  }

  selectedPreviewSlot.value = slot
}

const handlePreviewDrawerDrag = (percentageDragged: number) => {
  previewDragPercentage.value = percentageDragged
}

const handlePreviewDrawerRelease = () => {
  const hasDraggedEnoughToClose = Math.abs(previewDragPercentage.value) >= PREVIEW_CLOSE_DRAG_THRESHOLD
  previewDragPercentage.value = 0

  if (hasDraggedEnoughToClose) {
    closePreview()
  }
}

const isPreviewOpen = computed({
  get: () => Boolean(selectedPreviewPurchase.value && selectedPreviewSlot.value != null),
  set: (isOpen: boolean) => {
    if (!isOpen) {
      closePreview()
    }
  }
})

watch(isPreviewOpen, (open) => {
  if (open) {
    nextTick(() => {
      scrollPreviewCarouselToSelectedSlot()
    })
    return
  }

  previewDragPercentage.value = 0
})

watch(selectedPreviewSlot, (nextSlot, previousSlot) => {
  if (nextSlot == null || nextSlot === previousSlot || !isPreviewOpen.value) {
    return
  }

  nextTick(() => {
    scrollPreviewCarouselToSelectedSlot()
  })
})

type PreparedPhotoUpload = {
  compressedBlob: Blob
  mimeType: string
  fileBase64: string
}

const preparePhotoUpload = async (file: File): Promise<PreparedPhotoUpload> => {
  const compressedBlob = await compressImage(file)
  const mimeType = compressedBlob.type || 'image/webp'
  const fileBase64 = await blobToBase64(compressedBlob)

  return {
    compressedBlob,
    mimeType,
    fileBase64
  }
}

const uploadPhotoForPurchase = async (purchaseId: number | string, photo: PreparedPhotoUpload) => {
  // For pending purchases (UUID string IDs), we can't upload to the API yet
  // Just store in pending photos store for later upload after purchase syncs
  // Check: if it's a string, or if it's not a finite number, it's a pending purchase
  const isPendingPurchaseId = typeof purchaseId === 'string' || !Number.isFinite(Number(purchaseId))

  if (isPendingPurchaseId) {
    // This is a pending purchase - store locally only, NEVER try to upload to API
    pendingPhotos.addPhoto(String(purchaseId), photo.compressedBlob, photo.mimeType, photo.fileBase64)
    return
  }

  // For real purchases (numeric IDs), upload through the API
  const numericId = Number(purchaseId)
  if (!Number.isFinite(numericId)) {
    // Safety check: if purchaseId is not a finite number, it's not a valid real purchase ID
    // This should never happen if the isPendingPurchaseId check worked, but let's be safe
    throw new Error('Invalid purchase ID for photo upload')
  }

  await offlineFetch(`/api/purchases/${numericId}/photos`, {
    method: 'POST',
    body: {
      fileBase64: photo.fileBase64,
      mimeType: photo.mimeType
    }
  })

  await queryCache.invalidateQueries({ key: ['purchases'] })
  toast.add({ title: 'Foto subida' })
}

const onPhotoInputChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  // Direct upload from list view
  if (directUploadPurchaseId.value != null) {
    const purchaseId = directUploadPurchaseId.value
    directUploadPurchaseId.value = null

    let preparedPhoto: PreparedPhotoUpload
    try {
      preparedPhoto = await preparePhotoUpload(file)
    }
    catch {
      toast.add({ title: 'Error al procesar la foto', color: 'error' })
      return
    }

    try {
      await uploadPhotoForPurchase(purchaseId, preparedPhoto)
      // For pending purchases, uploadPhotoForPurchase returns early without error
      // Check if this was a pending purchase and show appropriate message
      if (typeof purchaseId === 'string' || !Number.isFinite(purchaseId)) {
        toast.add({ title: 'Foto guardada localmente - se subirá cuando la compra se sincronice.' })
      }
    }
    catch (_err) {
      if (isOfflineQueuedError(_err)) {
        // Add to pending photos store for preview
        pendingPhotos.addPhoto(purchaseId, preparedPhoto.compressedBlob, preparedPhoto.mimeType, preparedPhoto.fileBase64)
        const numericPurchaseId = Number(purchaseId)
        if (Number.isFinite(numericPurchaseId) && !queuedPhotoCandidates.value.includes(numericPurchaseId)) {
          queuedPhotoCandidates.value = [...queuedPhotoCandidates.value, numericPurchaseId]
        }
        toast.add({ title: 'Sin conexión — la foto se subirá al reconectarte.' })
        return
      }
      toast.add({
        title: getSpanishApiErrorMessage(_err) ?? 'Error al subir foto',
        color: 'error'
      })
    }
  }
  // Pending upload from edit dialog
  else if (editingPurchaseId.value) {
    const purchaseId = editingPurchaseId.value

    // Check if we can add more pending photos
    const pendingCount = pendingPhotos.getPhotosByPurchaseId(purchaseId).length
    const uploadedCount = editingPurchasePhotoSlots.value.length
    if (uploadedCount + pendingCount >= 3) {
      toast.add({ title: 'Máximo de 3 fotos permitidas.', color: 'error' })
      return
    }

    let preparedPhoto: PreparedPhotoUpload
    try {
      preparedPhoto = await preparePhotoUpload(file)
    }
    catch {
      toast.add({ title: 'Error al procesar la foto', color: 'error' })
      return
    }

    try {
      await uploadPhotoForPurchase(purchaseId, preparedPhoto)
      // For pending purchases, uploadPhotoForPurchase returns early without error
      // Check if this was a pending purchase and show appropriate message
      if (typeof purchaseId === 'string' || !Number.isFinite(purchaseId)) {
        toast.add({ title: 'Foto guardada localmente - se subirá cuando la compra se sincronice.' })
      }
    }
    catch (err) {
      if (isOfflineQueuedError(err)) {
        pendingPhotos.addPhoto(purchaseId, preparedPhoto.compressedBlob, preparedPhoto.mimeType, preparedPhoto.fileBase64)
        if (!queuedPhotoCandidates.value.includes(purchaseId)) {
          queuedPhotoCandidates.value = [...queuedPhotoCandidates.value, purchaseId]
        }
        toast.add({ title: 'Sin conexión — la foto se subirá al reconectarte.' })
        return
      }

      toast.add({
        title: getSpanishApiErrorMessage(err) ?? 'Error al subir foto',
        color: 'error'
      })
    }
  }

  input.value = ''
}

const openDeletePhotoDialog = (purchaseId: number, slot: number) => {
  pendingDeletionPhoto.value = { purchaseId, slot }
  isDeletePhotoDialogOpen.value = true
}

const closeDeletePhotoDialog = () => {
  isDeletePhotoDialogOpen.value = false
  pendingDeletionPhoto.value = null
}

const confirmDeletePhoto = async () => {
  if (!pendingDeletionPhoto.value) return
  const { purchaseId, slot } = pendingDeletionPhoto.value
  closeDeletePhotoDialog()
  await deletePhoto(purchaseId, slot)
}

const deletePhoto = async (purchaseId: number, slot: number) => {
  try {
    await offlineFetch(`/api/purchases/${purchaseId}/photos/${slot}`, {
      method: 'DELETE'
    })
    await queryCache.invalidateQueries({ key: ['purchases'] })

    if (selectedPreviewPurchase.value?.id === purchaseId && selectedPreviewSlot.value === slot) {
      const nextSlot = (selectedPreviewPurchase.value.photoSlots ?? []).filter(currentSlot => currentSlot !== slot)[0]
      selectedPreviewSlot.value = nextSlot ?? null

      if (!nextSlot) {
        closePreview()
      }
    }

    toast.add({ title: 'Foto eliminada' })
  }
  catch (err) {
    if (isOfflineQueuedError(err)) {
      toast.add({ title: 'Sin conexión — se sincronizará al reconectarte.' })
      return
    }
    toast.add({ title: 'Error al eliminar foto', color: 'error' })
  }
}

const purchaseList = computed(() => (purchasesResponse.value?.purchases ?? []) as Purchase[])

const getMergedPhotoSlots = (purchase: Purchase) => {
  const persisted = Array.isArray(purchase.photoSlots)
    ? purchase.photoSlots
      .map(slot => Number(slot))
      .filter(slot => Number.isFinite(slot) && slot > 0)
    : []

  const pendingPreviewCount = getPendingPhotosForPurchase(purchase.id).length
  const hasPendingPreviews = pendingPreviewCount > 0
  const hasQueuedCandidate = queuedPhotoCandidates.value.includes(Number(purchase.id))

  // Only use optimistic slots for synced (numeric ID) purchases
  // For pending purchases (UUID), we should only show pending photos from the store
  const isPendingPurchase = typeof purchase.id === 'string' || !Number.isFinite(Number(purchase.id))
  // IMPORTANT: while a photo is still pending/queued and visible as a preview,
  // do NOT also inject optimistic uploaded slots, otherwise UI shows
  // broken/duplicated slots (uploaded placeholder + pending preview).
  const optimistic = !isPendingPurchase && !hasPendingPreviews && hasQueuedCandidate
    ? (optimisticPhotoSlotsByPurchase.value[purchase.id] ?? [])
    : []

  return Array.from(new Set([...persisted, ...optimistic])).sort((a, b) => a - b)
}

const addOptimisticUploadedSlot = (purchaseId: number) => {
  const purchase = purchaseList.value.find(item => Number(item.id) === Number(purchaseId))
  if (!purchase) {
    return false
  }

  // Guard: only add optimistic slots for synced (numeric ID) purchases
  const isPendingPurchase = typeof purchase.id === 'string' || !Number.isFinite(Number(purchase.id))
  if (isPendingPurchase) {
    return false
  }

  const merged = getMergedPhotoSlots(purchase)
  if (merged.length >= 3) {
    return false
  }

  const nextSlot = [1, 2, 3].find(slot => !merged.includes(slot))
  if (nextSlot == null) {
    return false
  }

  const currentOptimistic = optimisticPhotoSlotsByPurchase.value[purchase.id] ?? []
  optimisticPhotoSlotsByPurchase.value = {
    ...optimisticPhotoSlotsByPurchase.value,
    [purchase.id]: [...currentOptimistic, nextSlot].sort((a, b) => a - b)
  }

  return true
}

const uploadPendingPhotosForSyncedPurchases = async () => {
  const allPendingPhotos = [...pendingPhotos.pendingPhotos]
  if (allPendingPhotos.length === 0) {
    return
  }

  const photosToUpload: Array<{ purchaseId: number | string, photo: typeof allPendingPhotos[0] }> = []

  // Separate photos by purchase ID and check if they should be uploaded
  for (const photo of allPendingPhotos) {
    const purchaseId = photo.purchaseId
    const isNumericId = typeof purchaseId === 'number' || Number.isFinite(Number(purchaseId))
    const numericId = Number(purchaseId)

    // Only upload photos for synced (numeric ID) purchases
    if (isNumericId && Number.isFinite(numericId) && numericId > 0) {
      // Check if this purchase exists in the list
      const purchase = purchaseList.value.find(p => Number(p.id) === numericId)
      if (purchase) {
        photosToUpload.push({ purchaseId: numericId, photo })
      }
      else {
        // Purchase not found, might still be syncing - keep trying
      }
    }
    else {
      // This is a pending purchase (UUID ID), keep the photo for later
    }
  }

  // Queue photos for upload
  for (const { purchaseId, photo } of photosToUpload) {
    // Check if already queued
    const alreadyQueued = offlineQueue.queue.some(item =>
      item.url === `/api/purchases/${purchaseId}/photos`
      && (item.body as { fileBase64?: unknown } | undefined)?.fileBase64 === photo.fileBase64
    )

    if (!alreadyQueued) {
      offlineQueue.enqueue({
        method: 'POST',
        url: `/api/purchases/${purchaseId}/photos`,
        body: {
          fileBase64: photo.fileBase64,
          mimeType: photo.mimeType
        }
      })
    }
  }

  // Trigger upload of queued photos by invalidating queries
  // This will cause the queue to process when useOfflineFetch runs
  if (photosToUpload.length > 0) {
    // Force a small delay to ensure queue items are in place before attempting flush
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

const promoteQueuedPhotoCandidates = () => {
  if (queuedPhotoCandidates.value.length === 0) {
    return
  }

  const unresolvedCandidates: number[] = []
  for (const purchaseId of queuedPhotoCandidates.value) {
    const promoted = addOptimisticUploadedSlot(purchaseId)
    if (!promoted) {
      unresolvedCandidates.push(purchaseId)
    }
  }

  queuedPhotoCandidates.value = unresolvedCandidates
}

const pruneStaleOptimisticPhotoSlots = () => {
  const next: Record<number | string, number[]> = {}

  for (const key in optimisticPhotoSlotsByPurchase.value) {
    const purchaseId = Number(key)
    if (isNaN(purchaseId)) {
      // This is a non-numeric key, skip it (shouldn't happen but be safe)
      continue
    }

    if (!Number.isFinite(purchaseId) || purchaseId <= 0) {
      continue
    }

    const optimisticSlots = optimisticPhotoSlotsByPurchase.value[purchaseId] ?? []
    if (!optimisticSlots.length) {
      continue
    }

    const hasPendingPreviews = getPendingPhotosForPurchase(purchaseId).length > 0
    const hasQueuedCandidate = queuedPhotoCandidates.value.includes(purchaseId)

    // Keep optimistic slots only for purchases that no longer show pending
    // previews but are still marked as recently synced candidates.
    if (!hasPendingPreviews && hasQueuedCandidate) {
      next[purchaseId] = optimisticSlots
    }
  }

  optimisticPhotoSlotsByPurchase.value = next
}

const isSubmitting = computed(() => addingPurchase.value || editingPurchase.value)

const closeComparisonDialog = () => {
  selectedPurchase.value = null
  selectedComparison.value = null
}

const isComparisonDialogOpen = computed({
  get: () => Boolean(selectedPurchase.value && selectedComparison.value),
  set: (isOpen: boolean) => {
    if (!isOpen) {
      closeComparisonDialog()
    }
  }
})

const resetForm = () => {
  form.brand = ''
  form.category = ''
  form.productType = ''
  form.sizeLabel = ''
  form.fitFeedback = ''
  form.notes = ''
  form.price = ''
  editingPurchaseId.value = null
  currentEditingPurchase.value = null
  selectedPhotoPurchaseId.value = null
  isEditPurchaseDialogOpen.value = false
  isAddPurchaseDialogOpen.value = false
  // Clear photos with purchaseId 0 (temporary photos for new purchases)
  const photosWithId0 = pendingPhotos.getPhotosByPurchaseId(0)
  for (const photo of photosWithId0) {
    pendingPhotos.removePhoto(photo.id)
  }
}

const closeEditModal = () => {
  resetForm()
}

const isEditModalOpen = computed({
  get: () => isEditPurchaseDialogOpen.value,
  set: (value: boolean) => {
    if (!value) {
      // Only reset when modal is closing, not when opening
      closeEditModal()
    }
    else {
      isEditPurchaseDialogOpen.value = true
    }
  }
})

const startAddingPurchase = () => {
  resetForm()
  isAddPurchaseDialogOpen.value = true
}

const startEditing = (purchase: Purchase) => {
  isEditPurchaseDialogOpen.value = true
  currentEditingPurchase.value = purchase
  editingPurchaseId.value = Number(purchase.id)
  selectedPhotoPurchaseId.value = Number(purchase.id)
  // Clear photos with purchaseId 0 (temporary photos for new purchases)
  const photosWithId0 = pendingPhotos.getPhotosByPurchaseId(0)
  for (const photo of photosWithId0) {
    pendingPhotos.removePhoto(photo.id)
  }
  form.brand = purchase.brand
  form.category = purchase.category
  form.productType = purchase.productType
  form.sizeLabel = purchase.sizeLabel
  form.fitFeedback = purchase.fitFeedback ?? ''
  form.notes = purchase.notes ?? ''
  form.price = purchase.price != null ? String(purchase.price) : ''
}

const savePurchase = () => {
  if (editingPurchaseId.value) {
    editPurchase(editingPurchaseId.value)
    return
  }

  addPurchase()
}

const executePurchaseDeletion = (purchase: Purchase) => {
  const isPendingLocalPurchase = typeof purchase.id === 'string' || !Number.isFinite(Number(purchase.id))
  if (isPendingLocalPurchase) {
    pendingPhotos.clearPhotosByPurchaseId(purchase.id)
    pendingPurchases.removePurchaseByBrand(
      purchase.brand,
      purchase.category,
      purchase.productType,
      purchase.sizeLabel
    )
    resetForm()
    toast.add({ title: 'Compra pendiente eliminada.' })
    return
  }

  deletingPurchaseId.value = Number(purchase.id)
  removePurchase(purchase)
}

const openDeletePurchaseDialog = (purchase: Purchase) => {
  pendingDeletionPurchase.value = purchase
  isDeletePurchaseDialogOpen.value = true
}

const closeDeletePurchaseDialog = () => {
  isDeletePurchaseDialogOpen.value = false
  pendingDeletionPurchase.value = null
}

const confirmDeletePurchase = () => {
  if (!pendingDeletionPurchase.value) {
    return
  }

  executePurchaseDeletion(pendingDeletionPurchase.value)
  closeDeletePurchaseDialog()
}

const deleteCurrentEditingPurchase = () => {
  if (!currentEditingPurchase.value) {
    return
  }

  const purchase = currentEditingPurchase.value
  openDeletePurchaseDialog(purchase)
}

const editingPurchaseRecord = computed<Purchase | null>(() => {
  if (editingPurchaseId.value == null) {
    return null
  }

  const livePurchase = purchaseList.value.find(item => Number(item.id) === editingPurchaseId.value)
  return livePurchase ?? currentEditingPurchase.value
})

const editingPurchasePhotoSlots = computed(() => {
  const slots = editingPurchaseRecord.value?.photoSlots ?? []

  return slots
    .map(slot => Number(slot))
    .filter(slot => Number.isFinite(slot) && slot > 0)
    .sort((a, b) => a - b)
})

const pendingPhotosPreviews = computed<PendingPhotoPreview[]>(() => {
  const purchaseId = editingPurchaseId.value
  if (!purchaseId) {
    return []
  }

  const queuedPreviews = getQueuedPendingPhotoPreviews(offlineQueue.queue, purchaseId)
  if (queuedPreviews.length > 0) {
    return queuedPreviews.map(photo => ({
      id: photo.id,
      source: 'queue',
      file: {} as File,
      previewUrl: photo.previewUrl
    }))
  }

  const localPreviews = pendingPhotos.getPhotoPreviewsByPurchaseId(purchaseId)
  return localPreviews.map(photo => ({
    id: photo.id,
    source: 'local',
    file: {} as File,
    previewUrl: photo.previewUrl
  }))
})

const canAddPhotoInEditModal = computed(() => {
  return editingPurchasePhotoSlots.value.length + pendingPhotosPreviews.value.length < 3
})

const buildEditingPhotoUrl = (slot: number) => {
  if (editingPurchaseId.value == null) {
    return ''
  }

  return buildPhotoUrl(editingPurchaseId.value, slot)
}

const handleEditModalUploadedPhotoDelete = (slot: number) => {
  if (editingPurchaseId.value == null) {
    return
  }

  openDeletePhotoDialog(editingPurchaseId.value, slot)
}

const removePendingPhoto = (index: number) => {
  const preview = pendingPhotosPreviews.value[index]
  if (!preview) {
    return
  }

  if (preview.source === 'queue') {
    const queueId = preview.id.startsWith('queue-') ? preview.id.replace(/^queue-/, '') : preview.id
    offlineQueue.dequeue(queueId)
    return
  }

  if (preview.source === 'local') {
    pendingPhotos.removePhoto(preview.id)
  }
}

const getPendingPhotosForPurchase = (purchaseId: number | string) => {
  const numericId = Number(purchaseId)
  const queuedPending = getQueuedPendingPhotoPreviews(offlineQueue.queue, numericId)
  if (queuedPending.length > 0) {
    return queuedPending
  }

  const localPending = pendingPhotos.getPhotoPreviewsByPurchaseId(purchaseId)
  return localPending
}

const fmt = (value: number, unit: string) => `${value.toFixed(1)} ${unit}`

watch(syncedPhotoPurchases, (ids) => {
  if (!ids.length) {
    return
  }

  const candidates = new Set(queuedPhotoCandidates.value)
  for (const purchaseId of ids) {
    if (!addOptimisticUploadedSlot(purchaseId)) {
      candidates.add(purchaseId)
    }
  }

  queuedPhotoCandidates.value = [...candidates]
})

watch(purchaseList, () => {
  pruneStaleOptimisticPhotoSlots()
  promoteQueuedPhotoCandidates()
})

const diffRows = computed<RowDiff[]>(() => {
  const snapshot = selectedComparison.value?.snapshotAtPurchase
  const current = selectedComparison.value?.currentMeasurement

  if (!snapshot || !current) {
    return []
  }

  return measurementSpecs.flatMap((spec) => {
    const before = snapshot[spec.key]
    const now = current[spec.key]

    if (before == null || now == null) {
      return []
    }

    if (before === now) {
      return []
    }

    return [{
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      before,
      now,
      delta: Number((now - before).toFixed(1))
    }]
  })
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <label for="purchase-photo-input" class="sr-only">
      Subir foto de compra
    </label>
    <input id="purchase-photo-input" ref="photoInput" type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" class="hidden"
      @change="onPhotoInputChange">

    <div>
      <h2 class="text-lg font-semibold">
        Compras
      </h2>
      <p class="text-sm text-muted">
        Guarda compras para comparar tus tallas de ese momento con las actuales.
      </p>
      <div class="mt-3">
        <UButton type="button" icon="i-lucide-plus" @click="startAddingPurchase">
          Añadir compra
        </UButton>
        <div v-if="!hasMeasurements" class="space-y-2">
          <p class="text-sm text-muted">
            Necesitas registrar al menos una medida corporal para poder comparar cómo ha cambiado tu cuerpo después de
            la compra.
          </p>
          <UButton type="button" icon="i-lucide-plus" @click="() => { void router.push('/measurements') }">
            Añadir medidas
          </UButton>
        </div>
      </div>
    </div>

    <div class="space-y-2">
      <h3 class="font-medium">
        Historial de compras
      </h3>
      <UInput v-model="historyFilter" icon="i-lucide-filter"
        placeholder="Filtrar por marca, categoría, prenda, talla o notas" />
      <ul class="divide-y divide-gray-200 dark:divide-gray-800">
        <li v-for="purchase in purchaseList" :key="purchase.id" :data-db-id="purchase.id" class="py-3 space-y-3">
          <div data-testid="purchase-info">
            <div class="flex items-center gap-2">
              <p data-testid="purchase-summary" class="font-medium">
                {{ purchase.brand }} · {{ purchase.productType }} · Talla {{ purchase.sizeLabel }}
              </p>
              <UBadge v-if="purchase.isPending" color="warning" variant="subtle"
                data-testid="purchase-pending-indicator">
                Pendiente
              </UBadge>
            </div>
            <p data-testid="purchase-details" class="text-sm text-muted">
              {{ purchase.category }}
              <UBadge :color="isCategoryVerified(purchase.category) ? 'primary' : 'neutral'" variant="subtle" size="xs"
                :icon="isCategoryVerified(purchase.category) ? 'i-lucide-badge-check' : 'i-lucide-badge-question-mark'"
                :title="isCategoryVerified(purchase.category) ? 'Verificada' : 'Personalizada'">
              </UBadge>
              · {{ new Date(purchase.purchasedAt).toLocaleDateString() }}<template v-if="purchase.price != null">
                · {{ purchase.price.toFixed(2) }} €
              </template>
            </p>
            <p v-if="purchase.notes || purchase.fitFeedback" class="text-sm text-muted">
              {{ purchase.notes || purchase.fitFeedback }}
            </p>

            <div
              v-if="purchase.photoSlots?.length || canAddPhoto(purchase) || getPendingPhotosForPurchase(purchase.id).length > 0"
              class="mt-2">
              <PurchasePhotoUploadGrid :uploaded-slots="getMergedPhotoSlots(purchase)"
                :pending-previews="getPendingPhotosForPurchase(purchase.id)"
                :build-photo-src="(slot: number) => buildPhotoUrl(purchase.id, slot)" :fill-empty-slots="true"
                :can-add-photo="canAddPhoto(purchase)" :enable-uploaded-preview="true"
                @preview-uploaded="(slot: number) => openPreview(purchase, slot)"
                @add-empty-slot="openEditAndAddPhoto(purchase)" />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <UButton variant="soft" color="neutral" icon="i-lucide-pencil"
              class="h-10 w-full justify-center text-center sm:h-10" @click="startEditing(purchase)">
              Editar
            </UButton>
            <UButton variant="soft" icon="i-lucide-git-compare" class="h-10 w-full justify-center text-center sm:h-10"
              :loading="comparing && selectedPurchase?.id === purchase.id" :disabled="!hasMeasurements"
              @click="comparePurchase(purchase)">
              Comparar medidas
            </UButton>
            <UButton variant="soft" color="error" icon="i-lucide-trash"
              class="h-10 w-full justify-center text-center sm:h-10" @click="openDeletePurchaseDialog(purchase)">
              Eliminar
            </UButton>
          </div>
        </li>
      </ul>
      <p v-if="!purchaseList.length" class="text-sm text-muted">
        No hay compras que coincidan con el filtro.
      </p>
    </div>

    <!-- Add/Edit Purchase Dialog -->
    <UModal v-model:open="isAddPurchaseDialogOpen">
      <template #content>
        <div class="space-y-4 p-4 sm:p-6 max-h-[85dvh] overflow-y-auto">
          <div>
            <h3 class="text-lg font-medium">
              Añadir compra
            </h3>
          </div>

          <form class="grid grid-cols-1 sm:grid-cols-2 gap-3" @submit.prevent="savePurchase()">
            <UInput v-model="form.brand" placeholder="Marca (Nike, Zara...) *" required autofocus />
            <UInputMenu v-model="form.category" :items="categoryOptions" value-key="value" label-key="label"
              create-item="always" open-on-click open-on-focus placeholder="Categoría (ropa, calzado...) *" required
              @create="handleCreateCategory">
              <template #item-label="{ item }">
                <span class="flex items-center gap-1.5">
                  {{ item.label }}
                  <UBadge :color="item.verified ? 'primary' : 'neutral'" variant="subtle" size="xs" :icon="item.verified ? 'i-lucide-badge-check' : 'i-lucide-badge-question-mark'">
                    {{ item.verified ? 'Verificada' : 'Personalizada' }}
                  </UBadge>
                </span>
              </template>
            </UInputMenu>
            <UInput v-model="form.productType" placeholder="Tipo de prenda (t-shirt, jeans...) *" required />
            <UInput v-model="form.sizeLabel" placeholder="Talla (S, M, L, 42...) *" required />
            <UInput v-model="form.fitFeedback" placeholder="Feedback de ajuste (opcional)" />
            <UInput v-model="form.price" type="number" min="0" step="0.01" placeholder="Precio (opcional)" />
            <UInput v-model="form.notes" class="sm:col-span-2" placeholder="Notas (opcional)" />

            <div class="sm:col-span-2 flex flex-wrap gap-2">
              <UButton type="submit" icon="i-lucide-shopping-cart" :loading="isSubmitting"
                :disabled="!form.brand || !form.category || !form.productType || !form.sizeLabel">
                Guardar compra
              </UButton>
              <UButton type="button" variant="soft" color="neutral" icon="i-lucide-x"
                @click="() => { resetForm(); isAddPurchaseDialogOpen = false }">
                Cancelar
              </UButton>
            </div>
          </form>
        </div>
      </template>
    </UModal>

    <!-- Edit Purchase Dialog -->
    <UModal v-model:open="isEditModalOpen">
      <template #content>
        <div class="space-y-4 p-4 sm:p-6 max-h-[85dvh] overflow-y-auto">
          <div class="flex items-start justify-between">
            <h3 class="text-lg font-medium">
              Editar compra
            </h3>
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" @click="closeEditModal" />
          </div>

          <form class="grid grid-cols-1 sm:grid-cols-2 gap-3" @submit.prevent="savePurchase()">
            <UInput v-model="form.brand" placeholder="Marca (Nike, Zara...) *" required autofocus />
            <UInputMenu v-model="form.category" :items="categoryOptions" value-key="value" label-key="label"
              create-item="always" open-on-click open-on-focus placeholder="Categoría (ropa, calzado...) *" required
              @create="handleCreateCategory">
              <template #item-label="{ item }">
                <span class="flex items-center gap-1.5">
                  {{ item.label }}
                  <UBadge :color="item.verified ? 'primary' : 'neutral'" variant="subtle" size="xs" :icon="item.verified ? 'i-lucide-badge-check' : 'i-lucide-badge-question-mark'">
                    {{ item.verified ? 'Verificada' : 'Personalizada' }}
                  </UBadge>
                </span>
              </template>
            </UInputMenu>
            <UInput v-model="form.productType" placeholder="Tipo de prenda (t-shirt, jeans...) *" required />
            <UInput v-model="form.sizeLabel" placeholder="Talla (S, M, L, 42...) *" required />
            <UInput v-model="form.fitFeedback" placeholder="Feedback de ajuste (opcional)" />
            <UInput v-model="form.price" type="number" min="0" step="0.01" placeholder="Precio (opcional)" />
            <UInput v-model="form.notes" class="sm:col-span-2" placeholder="Notas (opcional)" />

            <div class="sm:col-span-2">
              <USeparator />
            </div>

            <div class="sm:col-span-2">
              <PurchasePhotoUploadGrid :uploaded-slots="editingPurchasePhotoSlots"
                :pending-previews="pendingPhotosPreviews" :build-photo-src="buildEditingPhotoUrl" :show-header="true"
                :fill-empty-slots="true" :can-add-photo="canAddPhotoInEditModal" :show-delete-uploaded="true"
                :show-delete-pending="true" @add-empty-slot="triggerPhotoPicker"
                @delete-uploaded="handleEditModalUploadedPhotoDelete" @delete-pending="removePendingPhoto" />
            </div>

            <div class="sm:col-span-2 flex flex-wrap gap-2">
              <UButton type="submit" icon="i-lucide-save" :loading="isSubmitting"
                :disabled="!form.brand || !form.category || !form.productType || !form.sizeLabel">
                Guardar cambios
              </UButton>
              <UButton type="button" color="error" variant="soft" icon="i-lucide-trash"
                :loading="deletingPurchase && deletingPurchaseId === editingPurchaseId"
                @click="deleteCurrentEditingPurchase">
                Eliminar compra
              </UButton>
              <UButton type="button" variant="soft" color="neutral" icon="i-lucide-x" @click="closeEditModal">
                Cancelar
              </UButton>
            </div>
          </form>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="isDeletePurchaseDialogOpen">
      <template #content>
        <div class="space-y-4 p-4 sm:p-6">
          <h3 class="text-lg font-medium">
            Confirmar eliminación
          </h3>

          <p class="text-sm text-muted">
            ¿Seguro que quieres eliminar esta compra?
          </p>

          <div class="flex flex-wrap gap-2">
            <UButton type="button" color="error" icon="i-lucide-trash" @click="confirmDeletePurchase">
              Eliminar
            </UButton>
            <UButton type="button" color="neutral" variant="soft" @click="closeDeletePurchaseDialog">
              Cancelar
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="isDeletePhotoDialogOpen">
      <template #content>
        <div class="space-y-4 p-4 sm:p-6">
          <h3 class="text-lg font-medium">
            Confirmar eliminación
          </h3>

          <p class="text-sm text-muted">
            ¿Seguro que quieres eliminar esta foto?
          </p>

          <div class="flex flex-wrap gap-2">
            <UButton type="button" color="error" icon="i-lucide-trash" @click="confirmDeletePhoto">
              Eliminar
            </UButton>
            <UButton type="button" color="neutral" variant="soft" @click="closeDeletePhotoDialog">
              Cancelar
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="isComparisonDialogOpen">
      <template #content>
        <div v-if="selectedPurchase && selectedComparison" class="space-y-3 p-4 sm:p-5 max-h-[85dvh] overflow-y-auto">
          <div class="flex items-start justify-between gap-3">
            <h3 class="font-medium">
              Comparativa de medidas · {{ selectedPurchase.brand }} {{ selectedPurchase.productType }} ({{
                selectedPurchase.sizeLabel }})
            </h3>
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" @click="closeComparisonDialog" />
          </div>

          <UAlert v-if="selectedComparison.error" color="error" variant="soft" icon="i-lucide-alert-circle"
            :title="selectedComparison.error" />

          <UAlert v-else-if="selectedComparison.offline" color="warning" variant="soft" icon="i-lucide-wifi-off"
            title="Sin conexión"
            description="Se muestra la comparación entre tu medida más cercana a la fecha de compra y tus medidas actuales almacenadas localmente." />

          <UAlert v-else-if="selectedComparison.highlights?.weight" color="primary" variant="subtle"
            icon="i-lucide-scale" :title="selectedComparison.highlights.weight" />

          <template v-if="!selectedComparison.error">
            <UAlert v-if="!selectedComparison.snapshotAtPurchase && !selectedComparison.availableMeasurements?.length"
              color="neutral" variant="soft" icon="i-lucide-info"
              title="No hay medidas registradas para el día de la compra."
              description="Registra medidas regulares para comparar cómo ha cambiado tu cuerpo después de cada compra." />

            <div v-else-if="!selectedComparison.snapshotAtPurchase && selectedComparison.availableMeasurements?.length"
              class="space-y-3">
              <UAlert v-if="selectedComparison.offline" color="warning" variant="soft" icon="i-lucide-wifi-off"
                title="Sin conexión"
                description="La comparación completa estará disponible cuando te reconectes. Se muestran tus medidas actuales almacenadas localmente." />
              <UAlert v-else color="info" variant="soft" icon="i-lucide-info" title="Vincula una medida a esta compra"
                description="Selecciona una medida para asociarla al día de la compra y comparar cómo ha cambiado tu cuerpo." />
              <div class="space-y-2">
                <p class="text-sm font-medium">
                  Medidas disponibles:
                </p>
                <div class="space-y-2 max-h-60 overflow-y-auto">
                  <UButton v-for="measurement in selectedComparison.availableMeasurements" :key="measurement.id"
                    variant="soft" class="w-full justify-start" :loading="linkingMeasurement"
                    :disabled="selectedComparison.offline"
                    @click="linkMeasurementToPurchase({ purchaseId: Number(selectedPurchase!.id), measurementId: measurement.id })">
                    {{ new Date(measurement.recordedAt).toLocaleDateString() }} - {{ measurement.weightKg }} kg
                  </UButton>
                </div>
              </div>
            </div>

            <div v-else-if="diffRows.length"
              class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table class="min-w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th class="text-left px-3 py-2 font-medium">
                      Medida
                    </th>
                    <th class="text-left px-3 py-2 font-medium">
                      Antes
                    </th>
                    <th class="text-left px-3 py-2 font-medium">
                      Ahora
                    </th>
                    <th class="text-left px-3 py-2 font-medium">
                      Cambio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in diffRows" :key="row.key" class="border-t border-gray-200 dark:border-gray-800">
                    <td class="px-3 py-2 font-medium">
                      {{ row.label }}
                    </td>
                    <td class="px-3 py-2">
                      {{ fmt(row.before, row.unit) }}
                    </td>
                    <td class="px-3 py-2">
                      {{ fmt(row.now, row.unit) }}
                    </td>
                    <td class="px-3 py-2"
                      :class="row.delta > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'">
                      {{ row.delta > 0 ? '+' : '' }}{{ fmt(row.delta, row.unit) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <UAlert v-else color="neutral" variant="soft" icon="i-lucide-check"
              title="No hay cambios de medidas corporales entre el día de la compra y tus medidas actuales." />
          </template>

          <div class="flex justify-between w-full">
            <UButton color="success" variant="link" to="/measurements">
              Actualizar medidas
            </UButton>
            <UButton color="neutral" variant="soft" @click="closeComparisonDialog">
              Cerrar
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UDrawer v-model:open="isPreviewOpen" direction="bottom" :handle="false" :dismissible="true" :ui="{
      content: 'h-screen w-screen max-w-none rounded-none border-0 bg-black/95 p-0'
    }" @drag="handlePreviewDrawerDrag" @release="handlePreviewDrawerRelease">
      <template #content>
        <div class="relative flex h-screen w-screen flex-col bg-black/95 text-white">
          <div class="absolute right-3 top-3 z-10">
            <UButton color="neutral" variant="soft" icon="i-lucide-x" @click="closePreview">
              Cerrar
            </UButton>
          </div>

          <div class="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
            <UCarousel v-if="selectedPreviewPurchase && previewSlots.length" ref="previewCarousel" :items="previewSlots"
              :start-index="selectedPreviewSlotIndex" :drag-threshold="12" class="h-full w-full" :ui="{
                root: 'h-full w-full',
                viewport: 'h-full w-full',
                container: 'h-full w-full',
                item: 'h-full w-full flex items-center justify-center'
              }" @select="handlePreviewCarouselSelect">
              <template #default="{ item: slot }">
                <img :src="buildPhotoUrl(selectedPreviewPurchase.id, Number(slot))"
                  :alt="selectedPreviewPurchase ? `Vista ampliada de ${selectedPreviewPurchase.brand}` : 'Vista ampliada'"
                  class="max-h-full max-w-full select-none object-contain" draggable="false">
              </template>
            </UCarousel>
          </div>

          <div v-if="selectedPreviewPurchase && previewSlots.length > 1"
            class="flex items-center gap-2 overflow-x-auto border-t border-white/10 p-3">
            <button v-for="slot in previewSlots" :key="`modal-preview-${selectedPreviewPurchase.id}-${slot}`"
              type="button" class="rounded-md transition ring-2"
              :class="selectedPreviewSlot === slot ? 'ring-primary' : 'ring-transparent hover:ring-white/40'"
              :aria-label="`Ver foto ${slot}`" @click="selectedPreviewSlot = slot">
              <img :src="buildPhotoUrl(selectedPreviewPurchase.id, slot)" :alt="`Miniatura de foto ${slot}`"
                class="size-16 rounded-md object-cover" loading="lazy">
            </button>
          </div>
        </div>
      </template>
    </UDrawer>

    <UButton v-if="showScrollToTopButton" type="button" icon="i-lucide-arrow-up" color="primary" size="xl"
      class="fixed bottom-5 right-5 z-50 rounded-full shadow-lg" aria-label="Subir al inicio" @click="scrollToTop" />
  </div>
</template>
