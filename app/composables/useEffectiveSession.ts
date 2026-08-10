import type { User } from '#auth-utils'
import { useLocalStorage } from '@vueuse/core'

function cloneUser(user: User): User {
  return JSON.parse(JSON.stringify(user)) as User
}

export function useEffectiveSession() {
  const { loggedIn: liveLoggedIn, user: liveUser, clear: clearSession } = useUserSession()
  const offlineUser = useLocalStorage<User | null>('offline-user-snapshot', null)
  // Tracks which user id the offline store/query cache were last refreshed
  // for. Reset to null on logout so the next login (even by the same user)
  // always triggers a refresh, while reloads/navigations during an already
  // active session don't wipe data that was just fetched.
  const refreshedForUserId = useLocalStorage<string | null>('cache-refreshed-user-id', null)

  if (import.meta.client) {
    watch([liveLoggedIn, liveUser], ([loggedIn, user]) => {
      if (loggedIn && user) {
        offlineUser.value = cloneUser(user)

        if (refreshedForUserId.value !== user.id) {
          refreshedForUserId.value = user.id
          // A previous session (possibly a different user on a shared device)
          // may have left stale purchases/measurements behind. Drop the
          // offline fallback store and invalidate the query cache so this
          // login always starts from freshly fetched data.
          useOfflineDataStore().clear()
          void useQueryCache().invalidateQueries(undefined, 'all')
        }
      }
    }, { immediate: true, deep: true })
  }

  const loggedIn = computed(() => {
    if (liveLoggedIn.value) {
      return true
    }

    return Boolean(offlineUser.value)
  })

  const user = computed(() => {
    if (liveUser.value) {
      return liveUser.value
    }

    return offlineUser.value ?? undefined
  })

  const isOffline = computed(() => import.meta.client && !navigator.onLine)

  const clear = async () => {
    offlineUser.value = null
    refreshedForUserId.value = null
    await clearSession()
  }

  return {
    loggedIn,
    user,
    clear,
    liveLoggedIn,
    liveUser,
    offlineUser,
    isOffline
  }
}
