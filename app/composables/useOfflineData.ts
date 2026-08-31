import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PurchasesPaginatedResponse } from '~/queries/purchases'

const safeLocalStorage = {
  getItem: (key: string) => {
    if (!import.meta.client) {
      return null
    }
    return localStorage.getItem(key)
  },
  setItem: (key: string, value: string) => {
    if (!import.meta.client) {
      return
    }
    localStorage.setItem(key, value)
  },
  removeItem: (key: string) => {
    if (!import.meta.client) {
      return
    }
    localStorage.removeItem(key)
  }
}

export interface OfflineCategory {
  id: number
  name: string
  verified: boolean
}

/**
 * Persisted store that holds a local copy of all synced API data.
 * Used as an offline fallback when network requests fail.
 * Persist to localStorage (client-side only) to avoid sending large payloads
 * as request cookies on every API call.
 */
export const useOfflineDataStore = defineStore('offlineData', () => {
  // Purchases keyed by "page:limit:search" — e.g. "1:20:" or "2:20:nike"
  const purchasePages = ref<Record<string, PurchasesPaginatedResponse>>({})
  const measurements = ref<unknown[]>([])
  const categories = ref<OfflineCategory[]>([])

  function setPurchasePage(page: number, limit: number, search: string, data: PurchasesPaginatedResponse) {
    purchasePages.value[`${page}:${limit}:${search}`] = data
  }

  function getPurchasePage(page: number, limit: number, search: string): PurchasesPaginatedResponse | undefined {
    return purchasePages.value[`${page}:${limit}:${search}`]
  }

  function setMeasurements(data: unknown[]) {
    measurements.value = data
  }

  function setCategories(data: OfflineCategory[]) {
    categories.value = data
  }

  function getCategories(): OfflineCategory[] {
    return categories.value
  }

  function clear() {
    purchasePages.value = {}
    measurements.value = []
    categories.value = []
  }

  return { purchasePages, measurements, categories, setPurchasePage, getPurchasePage, setMeasurements, setCategories, getCategories, clear }
}, {
  persist: {
    storage: safeLocalStorage
  }
})
