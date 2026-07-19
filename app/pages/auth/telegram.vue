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
  script.setAttribute('data-auth-url', config.callbackUrl)
  script.setAttribute('data-request-access', 'write')

  container.appendChild(script)
}

watch(
  () => data.value?.botUsername,
  async () => {
    await nextTick()
    mountTelegramWidget()
  }
)

onMounted(() => {
  mountTelegramWidget()
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
          v-if="data?.origin"
          class="text-xs text-muted text-center"
        >
          Origen configurado: <code>{{ data.origin }}</code>
        </p>
      </div>
    </UCard>
  </div>
</template>
