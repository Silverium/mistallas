<script setup lang="ts">
interface TelegramAuthConfig {
  botUsername: string
  callbackUrl: string
  origin: string
}

const requestFetch = useRequestFetch()

const { data, pending, error } = await useAsyncData<TelegramAuthConfig>(
  'telegram-auth-config',
  () => requestFetch('/api/auth/telegram/config')
)

const widgetContainer = ref<HTMLElement | null>(null)
const isSigningIn = ref(false)
const authRuntimeError = ref('')

type TelegramWidgetUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

function mountTelegramWidget() {

  if (!import.meta.client) {
    return
  }

  const container = widgetContainer.value
  const config = data.value

  if (!container || !config?.botUsername) {
    return
  }

  container.innerHTML = ''

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://telegram.org/js/telegram-widget.js?24'
  script.setAttribute('data-telegram-login', config.botUsername)
  script.setAttribute('data-size', 'large')
  script.setAttribute('data-onauth', 'onTelegramAuth(user)')
  script.setAttribute('data-request-access', 'write')

	console.log(`%cconfig ${config?.origin}`, 'background-color: gold;', config);
  container.appendChild(script)
}

async function handleTelegramAuth(user: TelegramWidgetUser) {
  isSigningIn.value = true
  authRuntimeError.value = ''

  try {
    const response = await requestFetch<{ success: boolean, redirectTo?: string }>('/api/auth/telegram', {
      method: 'POST',
      body: {
        id: String(user.id),
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        photo_url: user.photo_url,
        auth_date: String(user.auth_date),
        hash: user.hash
      }
    })

    await navigateTo(response.redirectTo || '/purchases')
  }
  catch (err) {
    const message = err instanceof Error
      ? err.message
      : 'No se pudo iniciar sesión con Telegram'
    authRuntimeError.value = message
    isSigningIn.value = false
  }
}

watch(
  () => data.value?.botUsername,
  async () => {
    await nextTick()
    mountTelegramWidget()
  }
)

onMounted(() => {
  if (import.meta.client) {
    // Telegram widget expects a global callback name from data-onauth
    ;(window as unknown as { onTelegramAuth?: (user: TelegramWidgetUser) => void }).onTelegramAuth = handleTelegramAuth
  }

  mountTelegramWidget()
})

onBeforeUnmount(() => {
  if (import.meta.client) {
    delete (window as unknown as { onTelegramAuth?: (user: TelegramWidgetUser) => void }).onTelegramAuth
  }
})

const errorMessage = computed(() => {
  if (!error.value) {
    return ''
  }

  const status = (error.value as { statusCode?: number }).statusCode
  const message = (error.value as { message?: string }).message || 'No se pudo cargar el inicio de sesión con Telegram'

  return status ? `${message} (HTTP ${status})` : message
})
</script>

<template>
  <div class="mx-auto max-w-xl py-10">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">
            Inicia sesión con Telegram
          </h2>
          <UButton
            to="/"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-left"
          >
            Volver
          </UButton>
        </div>
      </template>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        :title="errorMessage"
      />

      <UAlert
        v-else-if="authRuntimeError"
        color="error"
        variant="soft"
        :title="authRuntimeError"
      />

      <div
        v-else
        class="space-y-4"
      >
        <div
          v-if="pending"
          class="space-y-3"
        >
          <p class="text-sm text-muted">
            Cargando widget de Telegram...
          </p>
          <div class="flex justify-center">
            <USkeleton class="h-10 w-[260px] rounded-lg" />
          </div>
        </div>

        <div
          ref="widgetContainer"
          class="flex justify-center min-h-12"
        />

        <p
          v-if="isSigningIn"
          class="text-sm text-center text-muted"
        >
          Verificando sesión de Telegram...
        </p>
      </div>
    </UCard>
  </div>
</template>
