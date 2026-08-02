import { defineQueryOptions } from '@pinia/colada'

export const measurementsQuery = defineQueryOptions({
  key: ['measurements'],
  query: async () => {
    try {
      return await useRequestFetch()('/api/measurements') as unknown[]
    }
    catch {
      const offlineStore = useOfflineDataStore()
      if (offlineStore.measurements.length > 0) {
        return offlineStore.measurements
      }

      // Keep the app usable during offline/client-navigation races.
      return []
    }
  }
})
