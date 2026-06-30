export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    '@nuxthub/core',
    'nuxt-auth-utils',
    '@pinia/nuxt',
    '@pinia/colada-nuxt'
  ],
  devtools: {
    enabled: process.env.NUXT_DEV_SERVER === 'true'
  },
  css: ['~/assets/main.css'],
  runtimeConfig: {
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    adminUserIds: process.env.ADMIN_USER_IDS || 'soldeplat@gmail.com,10578392',
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
  // Development config
  eslint: {
    config: {
      stylistic: {
        quotes: 'single',
        commaDangle: 'never'
      }
    }
  }
})
