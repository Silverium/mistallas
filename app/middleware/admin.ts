// Admin route middleware - check user role
import { defineNuxtRouteMiddleware } from '#app'

export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn } = await useUserSession()

  if (!loggedIn.value) {
    return navigateTo('/')
  }

  try {
    const profile = await useRequestFetch()('/api/account/profile') as { role?: 'user' | 'admin' }
    if (profile?.role !== 'admin') {
      return navigateTo('/')
    }
  }
  catch {
    return navigateTo('/')
  }
})
