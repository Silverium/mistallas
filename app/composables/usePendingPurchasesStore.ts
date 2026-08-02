import { defineStore } from 'pinia'
import { ref } from 'vue'

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

export interface PendingPurchase {
  id: string
  brand: string
  category: string
  productType: string
  sizeLabel: string
  fitFeedback?: string | null
  notes?: string | null
  price?: number | null
  purchasedAt: string | Date
  isPending: true
}

/**
 * Store for purchases that are pending upload (created while offline).
 * These purchases are displayed immediately in the UI with a pending indicator,
 * and are removed once they are successfully synced to the server.
 */
export const usePendingPurchasesStore = defineStore('pendingPurchases', () => {
  const pendingPurchases = ref<PendingPurchase[]>([])

  function addPurchase(purchase: Omit<PendingPurchase, 'id' | 'isPending'>) {
    pendingPurchases.value.push({
      ...purchase,
      id: crypto.randomUUID(),
      isPending: true
    })
  }

  function removePurchaseByBrand(brand: string, category: string, productType: string, sizeLabel: string) {
    pendingPurchases.value = pendingPurchases.value.filter(p =>
      !(p.brand === brand && p.category === category && p.productType === productType && p.sizeLabel === sizeLabel)
    )
  }

  function clear() {
    pendingPurchases.value = []
  }

  return {
    pendingPurchases,
    addPurchase,
    removePurchaseByBrand,
    clear
  }
}, {
  persist: {
    storage: safeLocalStorage
  }
})
