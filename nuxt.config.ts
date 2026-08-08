import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
) as { version?: string }

const appVersion = process.env.NUXT_PUBLIC_APP_VERSION || packageJson.version || '0.0.0'

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
      stripePublishableKey: '',
      appVersion
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
          './assets/main.css',
          './app.vue',
          './pages/*.vue',
          './composables/*.ts',
          './queries/*.ts'
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
    // Local kill switch: disable SW registration entirely.
    disable: process.env.NUXT_DISABLE_PWA === 'true',
    // One-shot cleanup mode: unregister active SW and delete caches.
    selfDestroying: process.env.NUXT_PWA_SELF_DESTROY === 'true',
    registerType: 'prompt',
    strategies: 'injectManifest',
    srcDir: 'public',
    filename: 'sw.ts',
    manifest: {
      name: 'Mis Tallas',
      short_name: 'Mis Tallas',
      start_url: '/',
      scope: '/',
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [
        { src: '/favicon/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
        { src: '/favicon/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/favicon/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/favicon/web-app-manifest-512x512.png',
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
    injectManifest: {
      // Exclude the 2.9 MB heic-to WASM chunk from the SW precache.
      // It is a lazy (dynamic) import only used when uploading HEIC photos;
      // forcing it into the precache would cost every user 2.9 MB on first load.
      globIgnores: ['**/heic-to.*.js', '**/social-image.old.png'],
      maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,woff,json}']
    },
    devOptions: { enabled: false }
  }
})
