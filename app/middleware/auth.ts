export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn, fetch } = await useUserSession()

  if (!loggedIn.value) {
    await fetch()
  }

  if (!loggedIn.value) {
    return navigateTo('/')
  }
})
