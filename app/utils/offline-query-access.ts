export function shouldEnableOfflineProtectedQuery(
  isHydrated: boolean,
  loggedIn: boolean,
  offlineRouteAccess: boolean
) {
  return isHydrated && (loggedIn || offlineRouteAccess)
}
