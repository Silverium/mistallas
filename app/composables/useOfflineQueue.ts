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

export interface QueuedMutation {
  id: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  url: string
  body?: unknown
}

export const useOfflineQueueStore = defineStore('offlineQueue', () => {
  const queue = ref<QueuedMutation[]>([])

  function enqueue(entry: Omit<QueuedMutation, 'id'>) {
    queue.value.push({ ...entry, id: crypto.randomUUID() })
  }

  function dequeue(id: string) {
    const idx = queue.value.findIndex(e => e.id === id)
    if (idx !== -1) {
      queue.value.splice(idx, 1)
    }
  }

  return { queue, enqueue, dequeue }
}, {
  persist: {
    storage: safeLocalStorage
  }
})
