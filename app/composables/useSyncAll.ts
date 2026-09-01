import type { PurchasesApiResponse } from '~~/shared/types/purchases'
import { useLocalStorage } from '@vueuse/core'
import type { OfflineCategory } from './useOfflineData'

export type SyncStatus = 'idle' | 'syncing' | 'done' | 'error'

export function useSyncAll() {
  const progress = useState<number>('offline-sync-progress', () => 0)
  const isSyncing = useState<boolean>('offline-sync-is-syncing', () => false)
  const status = useState<SyncStatus>('offline-sync-status', () => 'idle')
  const label = useState<string>('offline-sync-label', () => '')
  const lastSyncedAt = useLocalStorage<string | null>('offline-last-synced', null)

  async function syncAll(options?: { force?: boolean }) {
    if (isSyncing.value) {
      return
    }

    isSyncing.value = true
    status.value = 'syncing'
    progress.value = 0
    label.value = 'Iniciando...'

    const offlineData = useOfflineDataStore()
    const hasCachedPurchases = Object.keys(offlineData.purchasePages).length > 0

    if (!options?.force && lastSyncedAt.value && hasCachedPurchases) {
      status.value = 'done'
      progress.value = 100
      label.value = '¡Todo sincronizado!'
      isSyncing.value = false
      return
    }

    try {
      // Step 1: measurements — 0 → 10%
      label.value = 'Sincronizando medidas...'
      const measurementData = await $fetch<unknown[]>('/api/measurements')
      offlineData.setMeasurements(measurementData)
      progress.value = 10

      // Step 2: categories — 10 → 20%
      label.value = 'Sincronizando categorías...'
      const categoryResult = await $fetch<{ categories: OfflineCategory[] }>('/api/purchases/categories')
      offlineData.setCategories(categoryResult.categories)
      progress.value = 20

      // Step 3: all purchases — 20 → 100%
      label.value = 'Sincronizando compras...'
      const purchaseResult = await $fetch<PurchasesApiResponse>('/api/purchases?limit=1000')

      offlineData.setPurchasePage(1, 1000, '', purchaseResult)
      progress.value = 100
      label.value = '¡Todo sincronizado!'
      status.value = 'done'
      lastSyncedAt.value = new Date().toLocaleString('es')
    }
    catch {
      status.value = 'error'
      label.value = 'Error al sincronizar'
    }
    finally {
      isSyncing.value = false
    }
  }

  return { progress, isSyncing, status, label, syncAll }
}
