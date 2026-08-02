/// <reference lib="WebWorker" />

import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string, revision: string | null }>
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

clientsClaim()
cleanupOutdatedCaches()

// self.__WB_MANIFEST is the default injection point
precacheAndRoute(
  self.__WB_MANIFEST,
  {
    urlManipulation: ({ url }) => {
      const urls: URL[] = []
      if (url.pathname.endsWith('_payload.json')) {
        const newUrl = new URL(url.href)
        newUrl.search = ''
        urls.push(newUrl)
      }
      return urls
    }
  }
)

// Navigation handling for hybrid SSR + offline app:
// - network first when online
// - cache key strips query params so /purchases?filter=x can reuse cached HTML
// - fallback to cached shell when offline/network fails
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'navigation-cache',
    networkTimeoutSeconds: 1,
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 3600 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      {
        cacheKeyWillBeUsed: async ({ request }) => {
          const url = new URL(request.url)
          return url.origin + url.pathname
        },
        handlerDidError: async () => {
          return await caches.match('/')
            || await caches.match('/index.html')
            || Response.error()
        }
      }
    ]
  })
)

// Cache web fonts so they are served instantly on repeat visits.
registerRoute(
  /\.(?:woff2?|ttf|otf|eot)$/,
  new CacheFirst({
    cacheName: 'fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)

registerRoute(
  /\/api\/purchases/,
  new NetworkFirst({
    cacheName: 'api-purchases',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 604800 }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)

// Cache purchase photo images aggressively - they should always be available offline.
registerRoute(
  /\/api\/purchases\/\d+\/photos\/\d+$/,
  new CacheFirst({
    cacheName: 'purchase-photos',
    plugins: [
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)

registerRoute(
  /\/api\/measurements/,
  new NetworkFirst({
    cacheName: 'api-measurements',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 604800 }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)

registerRoute(
  /\/api\/_nuxt_icon\//,
  new CacheFirst({
    cacheName: 'api-nuxt-icon',
    matchOptions: {
      ignoreSearch: true
    },
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)

registerRoute(
  /\/favicon\/favicon\.ico$/,
  new CacheFirst({
    cacheName: 'static-assets-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)
