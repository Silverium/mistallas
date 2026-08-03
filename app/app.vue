<script setup lang="ts">
import type { DropdownMenuItem } from '#ui/types'
import { useOfflineRouteAccess } from '~/utils/offline-route-access'
import { useEffectiveSession } from '~/composables/useEffectiveSession'

const { loggedIn, user, clear } = useEffectiveSession()
const colorMode = useColorMode()
const offlineRouteAccess = useOfflineRouteAccess()

watch(loggedIn, () => {
  if (!loggedIn.value && !offlineRouteAccess.value) {
    navigateTo('/')
  }
})

const isDarkMode = computed({
  get: () => colorMode.value === 'dark',
  set: (value) => {
    colorMode.preference = value ? 'dark' : 'light'
  }
})

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value
}

useHead({
  htmlAttrs: { lang: 'es' },
  link: [
    { rel: 'icon', href: '/favicon/favicon.ico', sizes: '48x48' },
    { rel: 'icon', href: '/favicon/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    { rel: 'apple-touch-icon', href: '/favicon/apple-touch-icon.png' },
    { rel: 'manifest', href: '/manifest.webmanifest' }
  ],
  meta: [
    { name: 'apple-mobile-web-app-title', content: 'Mis Tallas' },
    { name: 'theme-color', content: '#ffffff' }
  ]
})

useSeoMeta({
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  title: 'Mis Tallas',
  description:
    'Una aplicación sencilla para gestionar tus tallas de ropa, calzado y accesorios.',
  ogImage: '/social-image.png',
  twitterImage: '/social-image.png',
  twitterCard: 'summary_large_image'
})

const items = computed(() => {
  if (!user.value) {
    return [] as DropdownMenuItem[][]
  }

  return [
    [
      {
        label: 'Ajustes de la cuenta',
        icon: 'i-lucide-user-cog',
        to: '/account'
      },
      {
        label: 'Cerrar sesión',
        icon: 'i-lucide-log-out',
        onSelect: clear
      }
    ]
  ] satisfies DropdownMenuItem[][]
})

const userDisplayName = computed(() => user.value?.login || user.value?.email || 'Usuario')

const toast = useToast()
const { isOnline: onlineStatus, pendingCount: count } = useNetworkStatus()
const isOnline = computed(() => onlineStatus.value)
const pendingCount = computed(() => count.value)

const showOfflineDetails = () => {
  let description = 'Estás sin conexión. Visualización de datos y cambios locales disponibles.'
  if (pendingCount.value > 0) {
    description += ` Tienes ${pendingCount.value} cambio${pendingCount.value !== 1 ? 's' : ''} pendiente${pendingCount.value !== 1 ? 's' : ''} que se sincronizarán cuando vuelvas a conectarte.`
  }
  toast.add({
    title: 'Sin conexión',
    description,
    color: 'warning'
  })
}

const userAvatar = computed(() => {
  if (!user.value) {
    return undefined
  }

  if (user.value.avatarUrl) {
    return user.value.avatarUrl
  }

  if (user.value.loginProvider === 'github' && user.value.login) {
    return `https://github.com/${user.value.login}.png`
  }

  return undefined
})
</script>

<template>
  <UApp>
    <Teleport to="body">
      <!-- Offline status indicator - small circle button in bottom-left -->
      <UButton
        v-if="!isOnline"
        size="lg"
        color="warning"
        variant="soft"
        aria-label="Indicador sin conexión"
        data-testid="offline-indicator"
        class="fixed bottom-4 left-4 z-50 rounded-full w-10 h-10 flex items-center justify-center"
        @click="showOfflineDetails"
      >
        <svg
          class="w-6 h-6"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" />
        </svg>
      </UButton>
    </Teleport>
    <UContainer class="flex min-h-dvh flex-col">
      <div class="mb-2 text-right">
        <UButton
          square
          variant="ghost"
          :icon="$colorMode.preference === 'dark' || $colorMode.preference === 'system'
            ? 'i-lucide-moon'
            : 'i-lucide-sun'
          "
          @click="toggleDarkMode"
        >
          {{ isDarkMode ? 'Claro' : 'Oscuro' }}
        </UButton>
      </div>

      <UCard variant="subtle">
        <template #header>
          <h3 class="text-lg font-semibold leading-6">
            <NuxtLink to="/">
              <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-home"
              >Mis Tallas</UButton>
            </NuxtLink>
          </h3>
          <div
            v-if="!loggedIn"
            class="login-glow-border"
          >
            <UDropdownMenu
              :items="[
                [
                  // { label: 'Apple', icon: 'i-simple-icons-apple', to: '/api/auth/apple', external: true },
                  { label: 'Telegram', icon: 'i-simple-icons-telegram', to: '/auth/telegram' },
                  { label: 'Google', icon: 'i-simple-icons-google', to: '/api/auth/google', external: true },
                  { label: 'GitHub', icon: 'i-simple-icons-github', to: '/api/auth/github', external: true }
                  // { label: 'Instagram', icon: 'i-simple-icons-instagram', to: '/api/auth/instagram', external: true }
                ]
              ]"
            >
              <UButton
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-log-in"
                trailing-icon="i-lucide-chevron-down"
              >
                Iniciar sesión
              </UButton>
            </UDropdownMenu>
          </div>
          <div
            v-else
            class="flex flex-wrap -mx-2 sm:mx-0"
          >
            <UButton
              to="/purchases"
              icon="i-lucide-shopping-bag"
              label="Compras"
              :color="$route.path === '/purchases' ? 'primary' : 'neutral'"
              variant="ghost"
            />
            <UButton
              to="/measurements"
              icon="i-lucide-ruler"
              label="Medidas"
              :color="$route.path === '/measurements' ? 'primary' : 'neutral'"
              variant="ghost"
            />
            <UButton
              to="/todos"
              :prefetch="false"
              icon="i-lucide-list"
              label="Tareas"
              :color="$route.path === '/todos' ? 'primary' : 'neutral'"
              variant="ghost"
            />
            <UButton
              to="/optimistic-todos"
              :prefetch="false"
              icon="i-lucide-sparkles"
              label="Tareas Optimistas"
              :color="$route.path === '/optimistic-todos' ? 'primary' : 'neutral'"
              variant="ghost"
            />
            <UButton
              v-if="user?.role === 'admin'"
              to="/admin"
              :prefetch="false"
              icon="i-lucide-shield"
              label="Admin"
              :color="$route.path.startsWith('/admin') ? 'primary' : 'neutral'"
              variant="ghost"
            />
            <UDropdownMenu
              v-if="user"
              :items="items"
            >
              <UButton
                color="neutral"
                variant="ghost"
                trailing-icon="i-lucide-chevron-down"
              >
                <UAvatar
                  :src="userAvatar"
                  :alt="userDisplayName"
                  size="3xs"
                />
                {{ userDisplayName }}
              </UButton>
            </UDropdownMenu>
          </div>
        </template>
        <NuxtPage />
      </UCard>

      <footer class="text-center mt-auto">
        <NuxtLink
          href="https://github.com/silverium/mistallas"
          target="_blank"
          class="text-sm text-neutral-500 hover:text-neutral-700"
        >
          <UButton
            color="neutral"
            variant="link"
            icon="i-lucide-github"
          />
        </NuxtLink>
        ·
        <ULink
          to="https://x.com/soldesilver"
          target="_blank"
          class="text-sm text-neutral-500 hover:text-neutral-700"
        >
          <UButton
            color="neutral"
            variant="link"
            icon="i-simple-icons-x"
          />
        </ULink>
      </footer>
    </UContainer>
  </UApp>
</template>

<style lang="postcss">
body {
  font-family: var(--font-sans);
  color: #0a0a0a;
  background-color: #fafafa;
}

html.dark body {
  color: #fafafa;
  background-color: #0a0a0a;
}
</style>
