export default defineNuxtConfig({
  modules: [
    '@nuxt/icon',
    '@nuxt/ui',
    '@nuxt/eslint',
    '@nuxthub/core',
    'nuxt-auth-utils',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    '@vite-pwa/nuxt',
    'pinia-plugin-persistedstate/nuxt'
  ],
  devtools: {
    enabled: process.env.NUXT_DEV_SERVER === 'true'
  },
  css: ['~/assets/main.css'],
  runtimeConfig: {
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    adminUserIds: process.env.ADMIN_USER_IDS || 'soldeplat@gmail.com,10578392',
    tierLimits: {
      free: Number(process.env.NUXT_TIER_LIMIT_FREE ?? 200),
      premium: Number(process.env.NUXT_TIER_LIMIT_PREMIUM ?? 500),
      enterprise: process.env.NUXT_TIER_LIMIT_ENTERPRISE === 'infinity'
        ? Infinity
        : Number(process.env.NUXT_TIER_LIMIT_ENTERPRISE ?? 10000)
    },
    public: {
      stripePublishableKey: ''
    }
  },
  sourcemap: process.env.NUXT_DEV_SERVER === 'true' ? { server: true, client: true } : false,
  future: { compatibilityVersion: 4 },
  compatibilityDate: '2025-12-20',
  nitro: {
    experimental: {
      database: true // this turns on the feature
    },
    prerender: {
      routes: ['/']
    },
    database: {
      devDatabase: {
        connector: 'sqlite',
        options: { name: 'devDb' } // stored in ./.data/devDb.sqlite3
      }
    },
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    }
  },
  hub: {
    db: 'sqlite'
  },
  vite: {
    server: {
      // Pre-compile frequently used files at dev-server startup so the browser
      // doesn't wait for on-demand compilation on first request.
      warmup: {
        clientFiles: [
          // CSS entry — must be first so Tailwind CSS 4 is compiled before
          // the browser requests it, eliminating the 30-second FOUC window
          './app/assets/main.css',
          './app/app.vue',
          './app/pages/*.vue',
          './app/composables/*.ts',
          './app/queries/*.ts'
        ]
      }
    },
    build: {
      rollupOptions: {
        output: {
          // Give the heic-to WASM chunk a stable, recognisable name so Workbox
          // can exclude it from the precache via globIgnores below.
          // Without this it gets a random hash name (e.g. DV8IZESR.js) that
          // can't be targeted by a glob pattern.
          chunkFileNames(chunkInfo) {
            if (chunkInfo.name === 'heic-to') return '_nuxt/heic-to.[hash].js'
            return '_nuxt/[hash].js'
          },
          manualChunks(id: string) {
            if (id.includes('/heic-to/')) return 'heic-to'
          }
        }
      }
    }
  },
  // Development config
  eslint: {
    config: {
      stylistic: {
        quotes: 'single',
        commaDangle: 'never'
      }
    }
  },
  icon: {
    provider: 'server',
    mode: 'svg',
    fallbackToApi: false,
    collections: ['lucide', 'simple-icons'],
    clientBundle: {
      // Pre-bundle statically used icons so first render and offline navigation
      // do not depend on runtime `/api/_nuxt_icon/*` fetches.
      scan: true
    },
    serverBundle: 'local'
  },
  pwa: {
    registerType: 'autoUpdate',
    experimental: {
      enableWorkboxPayloadQueryParams: true
    },
    manifest: {
      name: 'Mis Tallas',
      short_name: 'Mis Tallas',
      start_url: '/',
      scope: '/',
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [
        { src: '/favicon/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: '/favicon/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/favicon/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/favicon/maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    },
    pwaAssets: {
      image: 'public/favicon/favicon.svg',
      overrideManifestIcons: false
    },
    workbox: {
      // We use an explicit navigation runtime cache with a handlerDidError
      // fallback to the cached `/` shell. This is more robust for this hybrid
      // SSR + offline app than relying on Workbox's generic NavigationRoute.
      navigateFallback: null,
      skipWaiting: true,
      clientsClaim: true,
      cleanupOutdatedCaches: true,
      // Exclude the 2.9 MB heic-to WASM chunk from the SW precache.
      // It is a lazy (dynamic) import only used when uploading HEIC photos;
      // forcing it into the precache would cost every user 2.9 MB on first load.
      globIgnores: ['**/heic-to.*.js', '**/social-image.old.png'],
      maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,woff,json}'],
      runtimeCaching: [
        {
          urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'navigation-cache',
            networkTimeoutSeconds: 1,
            expiration: { maxEntries: 20, maxAgeSeconds: 3600 },
            cacheableResponse: { statuses: [0, 200] },
            plugins: [
              {
                // Strip query params from navigation cache keys so that
                // /purchases?filter=foo resolves to the same cached entry as
                // /purchases. Navigation HTML is identical regardless of query
                // params (routing/data fetching is handled client-side).
                cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
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
          }
        },
        // Cache web fonts so they are served instantly on repeat visits
        {
          urlPattern: /\.(?:woff2?|ttf|otf|eot)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'fonts-cache',
            expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] }
          }
        },
        {
          urlPattern: /\/api\/purchases/,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-purchases',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 200, maxAgeSeconds: 604800 },
            cacheableResponse: { statuses: [0, 200] }
          }
        },
        // Cache purchase photo images aggressively - they should always be available offline
        {
          urlPattern: /\/api\/purchases\/\d+\/photos\/\d+$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'purchase-photos',
            expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
            cacheableResponse: { statuses: [0, 200] }
          }
        },
        {
          urlPattern: /\/api\/measurements/,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-measurements',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 200, maxAgeSeconds: 604800 },
            cacheableResponse: { statuses: [0, 200] }
          }
        },
        {
          urlPattern: /\/api\/_nuxt_icon\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'api-nuxt-icon',
            matchOptions: {
              ignoreSearch: true
            },
            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            cacheableResponse: { statuses: [0, 200] }
          }
        },
        {
          urlPattern: /\/favicon\/favicon\.ico$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'static-assets-cache',
            expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            cacheableResponse: { statuses: [0, 200] }
          }
        }
      ]
    },
    devOptions: { enabled: false }
  }
})
