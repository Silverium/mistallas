<script setup lang="ts">
import type { DropdownMenuItem } from '#ui/types'

const { loggedIn, user, clear } = useUserSession()
const colorMode = useColorMode()

watch(loggedIn, () => {
  if (!loggedIn.value) {
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
    { rel: 'icon', type: 'image/png', href: '/favicon/favicon-96x96.png', sizes: '96x96' },
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon/favicon.svg' },
    { rel: 'shortcut icon', href: '/favicon/favicon.ico' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicon/apple-touch-icon.png' },
    { rel: 'manifest', href: '/favicon/site.webmanifest' }
  ],
  meta: [
    { name: 'apple-mobile-web-app-title', content: 'Mis Tallas' }
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
</script>

<template>
  <UApp>
    <UContainer class="min-h-screen flex flex-col">
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
          <UDropdownMenu
            v-if="!loggedIn"
            :items="[
              [
                { label: 'Google', icon: 'i-simple-icons-google', to: '/api/auth/google', external: true },
                { label: 'GitHub', icon: 'i-simple-icons-github', to: '/api/auth/github', external: true }
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
              icon="i-lucide-list"
              label="Tareas"
              :color="$route.path === '/todos' ? 'primary' : 'neutral'"
              variant="ghost"
            />
            <UButton
              to="/optimistic-todos"
              icon="i-lucide-sparkles"
              label="Tareas Optimistas"
              :color="$route.path === '/optimistic-todos' ? 'primary' : 'neutral'"
              variant="ghost"
            />
            <UButton
              v-if="user?.role === 'admin'"
              to="/admin/users"
              icon="i-lucide-shield"
              label="Usuarios"
              :color="$route.path.startsWith('/admin/users') ? 'primary' : 'neutral'"
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
                  :src="`https://github.com/${user.login}.png`"
                  :alt="user.login"
                  size="3xs"
                />
                {{ user.login }}
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
            icon="prime:twitter"
          />
        </ULink>
      </footer>
    </UContainer>
  </UApp>
</template>

<style lang="postcss">
body {
  @apply font-sans text-neutral-950 bg-neutral-50 dark:bg-neutral-950 dark:text-neutral-50;
}
</style>
