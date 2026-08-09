import { useLocalStorage } from '@vueuse/core'
import { extractIconQueriesFromSources } from '~/utils/offline-icon-prefetch'
import { useEffectiveSession } from '~/composables/useEffectiveSession'

const iconSourceModules = import.meta.glob('../{app.vue,pages/**/*.vue}', {
  eager: true,
  import: 'default',
  query: '?raw'
}) as Record<string, string>

const iconQueries = extractIconQueriesFromSources(
  Object.values(iconSourceModules),
  ['lucide', 'simple-icons']
)

export default defineNuxtPlugin(() => {
  const { app } = useRuntimeConfig()
  const route = useRoute()
  const { loggedIn, liveLoggedIn } = useEffectiveSession()
  const { syncAll, isSyncing, status } = useSyncAll()
  const offlineData = useOfflineDataStore()
  const baseURL = app?.baseURL?.replace(/\/$/, '') ?? ''
  const swControlReloadKey = 'offline-sw-control-reload'
  const lastSyncedAt = useLocalStorage<string | null>('offline-last-synced', null)
  const offlineIconsStatus = useLocalStorage<'idle' | 'warming' | 'ready' | 'error'>('offline-icons-status', 'idle')
  const offlineIconsReadyAt = useLocalStorage<string | null>('offline-icons-ready-at', null)
  const offlineResourcesStatus = useLocalStorage<'idle' | 'warming' | 'ready' | 'error'>('offline-resources-status', 'idle')
  const offlineResourcesReadyAt = useLocalStorage<string | null>('offline-resources-ready-at', null)
  const offlinePagesStatus = useLocalStorage<'idle' | 'warming' | 'ready' | 'error'>('offline-pages-status', 'idle')
  const offlinePagesReadyAt = useLocalStorage<string | null>('offline-pages-ready-at', null)
  const rootPurchasesWarmupDone = useLocalStorage<boolean>('offline-root-purchases-warmup-v1', false)
  const isWarmingOfflineData = ref(false)
  const isWarmingRootPurchases = ref(false)

  const clearLegacyPersistedStateCookies = () => {
    const legacyCookieKeys = [
      'offlineData',
      'offlineQueue',
      'pinia-offlineData',
      'pinia-offlineQueue',
      'pinia-persistedstate-offlineData',
      'pinia-persistedstate-offlineQueue'
    ]

    for (const key of legacyCookieKeys) {
      document.cookie = `${key}=; Max-Age=0; path=/; SameSite=Lax`
    }
  }

  const resourceRoutePaths = ['/']
  const resourceAssetEntries = [
    {
      fetchPaths: ['/favicon/favicon.ico'],
      cachePath: '/favicon/favicon.ico'
    }
  ]
  const offlineRoutePaths = ['/purchases', '/measurements']

  const ensureServiceWorkerControl = async () => {
    if (!('serviceWorker' in window) || !navigator.onLine) {
      return
    }

    if (navigator.serviceWorker.controller) {
      sessionStorage.removeItem(swControlReloadKey)
      return
    }

    try {
      const registration = await navigator.serviceWorker.ready

      if (!registration.active || navigator.serviceWorker.controller) {
        return
      }

      if (sessionStorage.getItem(swControlReloadKey) === '1') {
        return
      }

      // Without controller ownership, a hard refresh can still fall through to
      // the browser's native offline interstitial even after the SW finished
      // installing. Reload once so the current tab is definitively controlled.
      sessionStorage.setItem(swControlReloadKey, '1')
      window.location.reload()
    }
    catch {
      // Keep this non-blocking; readiness badges stay conservative if SW setup
      // cannot be finalized for any reason.
    }
  }

  const prefetchIcons = async () => {
    if (!navigator.onLine) {
      return
    }

    offlineIconsStatus.value = 'warming'

    const fetches = Object.entries(iconQueries)
      .filter(([, icons]) => icons.length > 0)
      .map(async ([collection, icons]) => {
        const url = `${baseURL}/api/_nuxt_icon/${collection}.json?icons=${icons.join(',')}`
        const response = await fetch(url, { credentials: 'same-origin' })

        if (!response.ok) {
          throw new Error(`Icon prefetch failed: ${collection}`)
        }
      })

    const results = await Promise.allSettled(fetches)
    const hasFailure = results.some(result => result.status === 'rejected')

    if (hasFailure) {
      offlineIconsStatus.value = 'error'
      return
    }

    offlineIconsStatus.value = 'ready'
    offlineIconsReadyAt.value = new Date().toLocaleString('es')
  }

  const hasOfflineDataCache = () => {
    return Object.keys(offlineData.purchasePages).length > 0
  }

  const warmOfflineData = async (force = false) => {
    if (!liveLoggedIn.value || !navigator.onLine) {
      return
    }

    if (!force && hasOfflineDataCache()) {
      if (status.value === 'idle') {
        status.value = 'done'
      }
      return
    }

    if (isWarmingOfflineData.value) {
      return
    }

    isWarmingOfflineData.value = true

    try {
      await syncAll({ force })
    }
    catch {
      // Keep this non-blocking: primary UX still relies on live requests.
    }
    finally {
      isWarmingOfflineData.value = false
    }
  }

  const prefetchRouteDocument = async (path: string) => {
    if (!('caches' in window)) {
      return
    }

    const url = `${baseURL}${path}`
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        Accept: 'text/html'
      }
    }).catch(() => null)

    if (!response?.ok) {
      throw new Error(`Failed to fetch route document: ${path}`)
    }

    const cache = await caches.open('navigation-cache')
    await cache.put(new Request(url, { credentials: 'same-origin' }), response.clone())
  }

  const prefetchStaticAsset = async ({ fetchPaths, cachePath }: { fetchPaths: string[], cachePath: string }) => {
    if (!('caches' in window)) {
      return
    }

    let response: Response | null = null
    let resolvedPath: string | null = null

    for (const fetchPath of fetchPaths) {
      const candidateResponse = await fetch(`${baseURL}${fetchPath}`, {
        credentials: 'same-origin'
      }).catch(() => null)

      if (candidateResponse?.ok) {
        response = candidateResponse
        resolvedPath = fetchPath
        break
      }
    }

    if (!response || !resolvedPath) {
      throw new Error(`Failed to fetch static asset: ${fetchPaths.join(', ')}`)
    }

    const cache = await caches.open('static-assets-cache')
    await cache.put(new Request(`${baseURL}${cachePath}`, { credentials: 'same-origin' }), response.clone())
  }

  const warmOfflineResources = async () => {
    if (!navigator.onLine) {
      return
    }

    offlineResourcesStatus.value = 'warming'

    const results = await Promise.allSettled([
      ...resourceRoutePaths.map(prefetchRouteDocument),
      ...resourceAssetEntries.map(prefetchStaticAsset)
    ])
    const hasFailure = results.some(result => result.status === 'rejected')

    if (hasFailure) {
      offlineResourcesStatus.value = 'error'
      return
    }

    offlineResourcesStatus.value = 'ready'
    offlineResourcesReadyAt.value = new Date().toLocaleString('es')
  }

  const warmOfflineRoutes = async () => {
    if (!loggedIn.value || !lastSyncedAt.value || !navigator.onLine) {
      return
    }

    offlinePagesStatus.value = 'warming'

    const results = await Promise.allSettled([
      ...offlineRoutePaths.map(prefetchRouteDocument),
      ...offlineRoutePaths.map(path => preloadRouteComponents(path))
    ])
    const hasFailure = results.some(result => result.status === 'rejected')

    if (hasFailure) {
      offlinePagesStatus.value = 'error'
      return
    }

    offlinePagesStatus.value = 'ready'
    offlinePagesReadyAt.value = new Date().toLocaleString('es')
  }

  type PurchasesApiResponse = {
    purchases?: Array<{ id?: number | string, photoSlots?: unknown[] }>
    pagination?: {
      page?: number
      totalPages?: number
    }
  }

  const fetchAllPurchasesForPhotoWarmup = async () => {
    const purchases: Array<{ id?: number | string, photoSlots?: unknown[] }> = []
    let page = 1
    let totalPages = 1

    do {
      const response = await $fetch<PurchasesApiResponse>(`/api/purchases?page=${page}&limit=500`)
      purchases.push(...(response.purchases ?? []))
      totalPages = Math.max(1, Number(response.pagination?.totalPages ?? 1))
      page += 1
    } while (page <= totalPages)

    return purchases
  }

  const warmPurchasePhotoImages = async (purchases: Array<{ id?: number | string, photoSlots?: unknown[] }>) => {
    const urls = new Set<string>()

    for (const purchase of purchases) {
      const purchaseId = purchase.id
      if (typeof purchaseId !== 'number' && typeof purchaseId !== 'string') {
        continue
      }

      const normalizedPurchaseId = Number(purchaseId)
      if (!Number.isFinite(normalizedPurchaseId) || normalizedPurchaseId <= 0) {
        continue
      }

      const slots = Array.isArray(purchase.photoSlots) ? purchase.photoSlots : []
      for (const rawSlot of slots) {
        const slot = Number(rawSlot)
        if (!Number.isFinite(slot) || slot <= 0) {
          continue
        }

        urls.add(`/api/purchases/${normalizedPurchaseId}/photos/${slot}`)
      }
    }

    if (!urls.size) {
      return true
    }

    const results = await Promise.allSettled(
      [...urls].map(url => fetch(url, { credentials: 'same-origin' }))
    )

    return results.every(result => result.status === 'fulfilled' && result.value.ok)
  }

  const warmRootPurchasesExperience = async () => {
    if (rootPurchasesWarmupDone.value || isWarmingRootPurchases.value) {
      return
    }

    if (!navigator.onLine || !loggedIn.value || route.path !== '/') {
      return
    }

    isWarmingRootPurchases.value = true

    try {
      await warmOfflineData()

      const routeWarmupResults = await Promise.allSettled([
        prefetchRouteDocument('/purchases'),
        preloadRouteComponents('/purchases')
      ])
      const routeWarmupOk = routeWarmupResults.every(result => result.status === 'fulfilled')

      const purchases = await fetchAllPurchasesForPhotoWarmup()
      const photosWarmupOk = await warmPurchasePhotoImages(purchases)

      if (routeWarmupOk && photosWarmupOk) {
        rootPurchasesWarmupDone.value = true
      }
    }
    catch {
      // Best-effort warmup only. We intentionally keep retries available.
    }
    finally {
      isWarmingRootPurchases.value = false
    }
  }

  const warmOfflineAssets = () => {
    void warmOfflineData()
    void warmOfflineResources()
    void warmOfflineRoutes()
  }

  const scheduleWarmup = () => {
    void ensureServiceWorkerControl()
    void prefetchIcons()

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(warmOfflineAssets)
    }
    else {
      setTimeout(warmOfflineAssets, 0)
    }
  }

  clearLegacyPersistedStateCookies()

  watch([loggedIn, lastSyncedAt], scheduleWarmup, { immediate: true })

  watch([loggedIn, () => route.path], ([nextLoggedIn, path]) => {
    if (!nextLoggedIn || path !== '/') {
      return
    }

    void warmRootPurchasesExperience()
  }, { immediate: true })

  watch([loggedIn, isSyncing], ([nextLoggedIn, nextIsSyncing]) => {
    if (!nextLoggedIn || nextIsSyncing || !navigator.onLine) {
      return
    }

    if (!lastSyncedAt.value || !hasOfflineDataCache()) {
      void warmOfflineData(true)
    }
  }, { immediate: true })

  window.addEventListener('online', () => {
    void ensureServiceWorkerControl()
    void warmOfflineData(true)
    void warmRootPurchasesExperience()
    scheduleWarmup()
  })
})
