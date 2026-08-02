import { describe, expect, it } from 'vitest'
import { shouldEnableOfflineProtectedQuery } from './offline-query-access'

describe('shouldEnableOfflineProtectedQuery', () => {
  it('enables query for offline navigation when hydrated and offline route access is granted', () => {
    expect(shouldEnableOfflineProtectedQuery(true, false, true)).toBe(true)
  })

  it('enables query for authenticated user when hydrated', () => {
    expect(shouldEnableOfflineProtectedQuery(true, true, false)).toBe(true)
  })

  it('disables query before hydration', () => {
    expect(shouldEnableOfflineProtectedQuery(false, true, true)).toBe(false)
  })

  it('disables query when not authenticated and no offline route access', () => {
    expect(shouldEnableOfflineProtectedQuery(true, false, false)).toBe(false)
  })
})
