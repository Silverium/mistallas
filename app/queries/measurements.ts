import { defineQueryOptions } from '@pinia/colada'

export const measurementsQuery = defineQueryOptions({
  key: ['measurements'],
  query: () => useRequestFetch()('/api/measurements') as Promise<unknown[]>
})
