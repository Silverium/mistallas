import { useLocalStorage } from '@vueuse/core'
import { useOnline } from '@vueuse/core'

const OFFLINE_SYNCED_ROUTE_PREFIXES = ['/purchases', '/measurements'] as const

export function isOfflineSyncedRoute(path: string) {
  return OFFLINE_SYNCED_ROUTE_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

export function hasOfflineSyncMarker() {
  if (!import.meta.client) {
    return false
  }

  return Boolean(localStorage.getItem('offline-last-synced'))
}

export function canUseOfflineRoute(path: string) {
  if (!import.meta.client) {
    return false
  }

  return !navigator.onLine && hasOfflineSyncMarker() && isOfflineSyncedRoute(path)
}

export function useOfflineRouteAccess() {
  const route = useRoute()
  const lastSyncedAt = useLocalStorage<string | null>('offline-last-synced', null)
  const isOnline = useOnline()

  return computed(() => {
    if (!import.meta.client) {
      return false
    }

    return !isOnline.value && Boolean(lastSyncedAt.value) && isOfflineSyncedRoute(route.path)
  })
}
