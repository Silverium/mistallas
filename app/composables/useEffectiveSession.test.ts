import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, watch, type Ref } from 'vue'

type MockUser = {
  id: string
  login: string
  role: 'user' | 'admin'
  tier: 'free' | 'premium' | 'enterprise'
}

const storage = new Map<string, Ref<unknown>>()

vi.mock('@vueuse/core', () => ({
  useLocalStorage: <T>(key: string, initialValue: T) => {
    if (!storage.has(key)) {
      storage.set(key, ref(initialValue))
    }
    return storage.get(key) as Ref<T>
  }
}))

describe('useEffectiveSession', () => {
  beforeEach(() => {
    storage.clear()
    vi.resetModules()
  })

  it('keeps user authenticated from offline snapshot when live session disappears', async () => {
    const liveLoggedIn = ref(false)
    const liveUser = ref<MockUser | undefined>(undefined)
    const clearSession = vi.fn(async () => {})

    const offlineSnapshot = {
      id: 'u1',
      login: 'solde',
      role: 'user',
      tier: 'premium'
    } satisfies MockUser

    storage.set('offline-user-snapshot', ref(offlineSnapshot))

    vi.stubGlobal('useUserSession', () => ({
      loggedIn: liveLoggedIn,
      user: liveUser,
      clear: clearSession
    }))

    vi.stubGlobal('computed', computed)
    vi.stubGlobal('watch', watch)

    const { useEffectiveSession } = await import('./useEffectiveSession')
    const session = useEffectiveSession()

    // Simulate offline refresh where live session is unavailable
    liveLoggedIn.value = false
    liveUser.value = undefined
    await nextTick()

    expect(session.loggedIn.value).toBe(true)
    expect(session.user.value?.login).toBe(offlineSnapshot.login)
  })

  it('clears offline snapshot on explicit logout', async () => {
    const liveLoggedIn = ref(true)
    const liveUser = ref<MockUser | undefined>({
      id: 'u2',
      login: 'maria',
      role: 'user',
      tier: 'free'
    })
    const clearSession = vi.fn(async () => {})

    vi.stubGlobal('useUserSession', () => ({
      loggedIn: liveLoggedIn,
      user: liveUser,
      clear: clearSession
    }))

    vi.stubGlobal('computed', computed)
    vi.stubGlobal('watch', watch)

    const { useEffectiveSession } = await import('./useEffectiveSession')
    const session = useEffectiveSession()
    await nextTick()

    await session.clear()
    liveLoggedIn.value = false
    liveUser.value = undefined
    await nextTick()

    expect(clearSession).toHaveBeenCalledTimes(1)
    expect(session.loggedIn.value).toBe(false)
    expect(session.user.value).toBeUndefined()
  })

  it('stays signed in across online refresh and switches to live user when session resolves', async () => {
    const liveLoggedIn = ref(false)
    const liveUser = ref<MockUser | undefined>(undefined)
    const clearSession = vi.fn(async () => {})

    const cachedUser = {
      id: 'u3',
      login: 'cached-user',
      role: 'user',
      tier: 'free'
    } satisfies MockUser

    const liveResolvedUser = {
      id: 'u3',
      login: 'live-user',
      role: 'user',
      tier: 'premium'
    } satisfies MockUser

    storage.set('offline-user-snapshot', ref(cachedUser))

    vi.stubGlobal('useUserSession', () => ({
      loggedIn: liveLoggedIn,
      user: liveUser,
      clear: clearSession
    }))

    vi.stubGlobal('computed', computed)
    vi.stubGlobal('watch', watch)

    const { useEffectiveSession } = await import('./useEffectiveSession')
    const session = useEffectiveSession()

    // During initial refresh hydration, live session may not be ready yet.
    await nextTick()
    expect(session.loggedIn.value).toBe(true)
    expect(session.user.value?.login).toBe('cached-user')

    // Once online session resolves, effective session should remain signed in
    // and reflect the live user data.
    liveLoggedIn.value = true
    liveUser.value = liveResolvedUser
    await nextTick()

    expect(session.loggedIn.value).toBe(true)
    expect(session.user.value?.login).toBe('live-user')
  })
})
