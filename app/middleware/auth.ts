import { canUseOfflineRoute } from '~/utils/offline-route-access'
import { useEffectiveSession } from '~/composables/useEffectiveSession'

export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, liveLoggedIn } = useEffectiveSession()
  const offlineClientMode = import.meta.client && !navigator.onLine

  if (loggedIn.value && (liveLoggedIn.value || offlineClientMode)) {
    return
  }

  const { fetch } = await useUserSession()

  if (canUseOfflineRoute(to.path)) {
    return
  }

  try {
    await fetch()
  }
  catch {
    if (canUseOfflineRoute(to.path)) {
      return
    }
  }

  // Re-evaluate after fetch attempt.
  const { loggedIn: effectiveLoggedIn } = useEffectiveSession()
  if (effectiveLoggedIn.value) {
    return
  }

  if (canUseOfflineRoute(to.path)) {
    return
  }

  return navigateTo('/')
})
