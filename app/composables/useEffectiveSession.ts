import type { User } from '#auth-utils'
import { useLocalStorage } from '@vueuse/core'

function cloneUser(user: User): User {
  return JSON.parse(JSON.stringify(user)) as User
}

export function useEffectiveSession() {
  const { loggedIn: liveLoggedIn, user: liveUser, clear: clearSession } = useUserSession()
  const offlineUser = useLocalStorage<User | null>('offline-user-snapshot', null)

  if (import.meta.client) {
    watch([liveLoggedIn, liveUser], ([loggedIn, user]) => {
      if (loggedIn && user) {
        offlineUser.value = cloneUser(user)
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
