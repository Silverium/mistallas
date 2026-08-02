import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockUseEffectiveSession = vi.fn()
const mockCanUseOfflineRoute = vi.fn()

vi.mock('~/composables/useEffectiveSession', () => ({
  useEffectiveSession: mockUseEffectiveSession
}))

vi.mock('~/utils/offline-route-access', () => ({
  canUseOfflineRoute: mockCanUseOfflineRoute
}))

describe('auth middleware', () => {
  const fetchMock = vi.fn()
  const navigateToMock = vi.fn((path: string) => path)

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    vi.stubGlobal('defineNuxtRouteMiddleware', (handler: unknown) => handler)
    vi.stubGlobal('useUserSession', vi.fn(async () => ({ fetch: fetchMock })))
    vi.stubGlobal('navigateTo', navigateToMock)
  })

  it('allows navigation immediately when live session is logged in (regression guard)', async () => {
    mockUseEffectiveSession.mockReturnValue({ loggedIn: ref(true), liveLoggedIn: ref(true) })
    mockCanUseOfflineRoute.mockReturnValue(false)

    const middleware = (await import('./auth')).default as (to: { path: string }) => Promise<unknown>
    const result = await middleware({ path: '/purchases' })

    expect(result).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('validates session online when only offline snapshot reports logged in', async () => {
    mockUseEffectiveSession
      .mockReturnValueOnce({ loggedIn: ref(true), liveLoggedIn: ref(false) })
      .mockReturnValueOnce({ loggedIn: ref(false), liveLoggedIn: ref(false) })
    mockCanUseOfflineRoute.mockReturnValue(false)
    fetchMock.mockResolvedValue(undefined)

    const middleware = (await import('./auth')).default as (to: { path: string }) => Promise<unknown>
    const result = await middleware({ path: '/purchases' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith('/')
    expect(result).toBe('/')
  })

  it('does not redirect when first check is logged out but second effective-session check becomes logged in', async () => {
    mockUseEffectiveSession
      .mockReturnValueOnce({ loggedIn: ref(false), liveLoggedIn: ref(false) })
      .mockReturnValueOnce({ loggedIn: ref(true), liveLoggedIn: ref(true) })
    mockCanUseOfflineRoute.mockReturnValue(false)
    fetchMock.mockResolvedValue(undefined)

    const middleware = (await import('./auth')).default as (to: { path: string }) => Promise<unknown>
    const result = await middleware({ path: '/purchases' })

    expect(result).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('redirects to root when effective session is still logged out after fetch', async () => {
    mockUseEffectiveSession
      .mockReturnValueOnce({ loggedIn: ref(false), liveLoggedIn: ref(false) })
      .mockReturnValueOnce({ loggedIn: ref(false), liveLoggedIn: ref(false) })
    mockCanUseOfflineRoute.mockReturnValue(false)
    fetchMock.mockResolvedValue(undefined)

    const middleware = (await import('./auth')).default as (to: { path: string }) => Promise<unknown>
    const result = await middleware({ path: '/purchases' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith('/')
    expect(result).toBe('/')
  })
})
