import { describe, it, expect } from 'vitest'
import { extractIconQueriesFromSources } from './offline-icon-prefetch'

describe('extractIconQueriesFromSources', () => {
  it('collects icon names per collection and sorts/deduplicates them', () => {
    const sources = [
      '<UButton icon="i-lucide-plus" /><UButton icon="i-lucide-filter" />',
      '<UButton icon="i-lucide-plus" /><UButton icon="i-simple-icons-github" />',
      '<UButton :icon="ready ? \'i-lucide-check-circle\' : \'i-lucide-alert-circle\'" />'
    ]

    const result = extractIconQueriesFromSources(sources, ['lucide', 'simple-icons'])

    expect(result).toEqual({
      lucide: ['alert-circle', 'check-circle', 'filter', 'plus'],
      'simple-icons': ['github']
    })
  })

  it('does not confuse collection names that contain hyphens', () => {
    const sources = [
      '<UButton icon="i-simple-icons-x" />',
      '<UButton icon="i-lucide-alert-circle" />'
    ]

    const result = extractIconQueriesFromSources(sources, ['lucide', 'simple-icons'])

    expect(result['simple-icons']).toEqual(['x'])
    expect(result.lucide).toEqual(['alert-circle'])
  })
})