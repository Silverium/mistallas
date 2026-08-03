<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { useEffectiveSession } from '~/composables/useEffectiveSession'
import { useSyncedStringQueryParam } from '~/utils/query-param'

const { loggedIn } = useEffectiveSession()
const pwa = usePWA()
const purchasesFilter = useSyncedStringQueryParam('filter')

const openPurchasesWithFilter = () => {
  const filter = purchasesFilter.value.trim()

  return navigateTo({
    path: '/purchases',
    query: filter ? { filter } : undefined
  })
}

const { progress, isSyncing, status, label, syncAll } = useSyncAll()
const lastSyncedAt = useLocalStorage<string | null>('offline-last-synced', null)
const offlineResourcesStatus = useLocalStorage<'idle' | 'warming' | 'ready' | 'error'>('offline-resources-status', 'idle')
const offlineResourcesReadyAt = useLocalStorage<string | null>('offline-resources-ready-at', null)
const offlinePagesStatus = useLocalStorage<'idle' | 'warming' | 'ready' | 'error'>('offline-pages-status', 'idle')
const offlinePagesReadyAt = useLocalStorage<string | null>('offline-pages-ready-at', null)
const hasOfflineShell = ref(false)
const supportsServiceWorker = ref(false)

watch(() => [pwa?.offlineReady, pwa?.swActivated], ([offlineReady, swActivated]) => {
  hasOfflineShell.value = Boolean(offlineReady || swActivated || hasOfflineShell.value)
}, { immediate: true })

onMounted(async () => {
  supportsServiceWorker.value = 'serviceWorker' in navigator

  if (!supportsServiceWorker.value) {
    return
  }

  hasOfflineShell.value = Boolean(navigator.serviceWorker.controller)

  try {
    const registration = await navigator.serviceWorker.ready
    hasOfflineShell.value = Boolean(registration.active) || hasOfflineShell.value
  }
  catch {
    // In dev, PWA support is disabled by config, so `ready` may never resolve.
  }
})

const isCachingOfflineAssets = computed(() => {
  return offlineResourcesStatus.value === 'warming'
})

const hasOfflineData = computed(() => Boolean(lastSyncedAt.value) || status.value === 'done')

const isPreparingOfflinePages = computed(() => offlinePagesStatus.value === 'warming')
const areOfflinePagesReady = computed(() => offlinePagesStatus.value === 'ready')
const hasOfflineResources = computed(() => offlineResourcesStatus.value === 'ready')

const isOfflineReady = computed(() => {
  return hasOfflineShell.value
    && hasOfflineData.value
    && hasOfflineResources.value
    && areOfflinePagesReady.value
})

const handleSync = async () => {
  await syncAll()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <form
      v-if="loggedIn"
      class="flex flex-col sm:flex-row gap-2"
      @submit.prevent="openPurchasesWithFilter"
    >
      <UInput
        v-model="purchasesFilter"
        icon="i-lucide-filter"
        class="flex-1"
        placeholder="Busca una compra por marca, categoría o talla..."
      />
      <UButton
        type="submit"
        icon="i-lucide-search"
      >
        Ir a compras
      </UButton>
    </form>

    <InstallAppButton />

    <div
      v-if="loggedIn"
      class="flex flex-col gap-2"
    >
      <div class="flex items-center gap-3 flex-wrap">
        <UButton
          v-if="status === 'error'"
          icon="i-lucide-cloud-download"
          :loading="isSyncing"
          :disabled="isSyncing"
          variant="soft"
          color="neutral"
          size="sm"
          @click="handleSync"
        >
          Reintentar sync offline
        </UButton>
        <UBadge
          v-if="isOfflineReady"
          color="success"
          variant="soft"
          icon="i-lucide-badge-check"
        >
          Disponible offline
        </UBadge>
        <span
          v-if="lastSyncedAt && !isSyncing"
          class="text-xs text-muted"
        >
          Último sync: {{ lastSyncedAt }}
        </span>
        <span
          v-else-if="isSyncing"
          class="text-xs text-muted"
        >
          Preparando modo offline automáticamente…
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UBadge
          :color="hasOfflineResources ? 'success' : isCachingOfflineAssets ? 'warning' : offlineResourcesStatus === 'error' ? 'error' : 'neutral'"
          :variant="hasOfflineResources ? 'soft' : 'subtle'"
          :icon="hasOfflineResources ? 'i-lucide-check-circle' : isCachingOfflineAssets ? 'i-lucide-loader-circle' : offlineResourcesStatus === 'error' ? 'i-lucide-alert-circle' : 'i-lucide-package'"
          :class="isCachingOfflineAssets ? 'animate-pulse' : ''"
        >
          Recursos {{ hasOfflineResources ? 'listos' : isCachingOfflineAssets ? 'guardando…' : offlineResourcesStatus === 'error' ? 'con error' : 'pendientes' }}
        </UBadge>

        <UBadge
          :color="hasOfflineData ? 'success' : isSyncing ? 'warning' : status === 'error' ? 'error' : 'neutral'"
          :variant="hasOfflineData ? 'soft' : 'subtle'"
          :icon="hasOfflineData ? 'i-lucide-database-zap' : isSyncing ? 'i-lucide-loader-circle' : status === 'error' ? 'i-lucide-alert-circle' : 'i-lucide-database'"
          :class="isSyncing ? 'animate-pulse' : ''"
        >
          Datos {{ hasOfflineData ? 'listos' : isSyncing ? 'sincronizando…' : status === 'error' ? 'con error' : 'pendientes' }}
        </UBadge>

        <UBadge
          :color="areOfflinePagesReady ? 'success' : isPreparingOfflinePages ? 'warning' : offlinePagesStatus === 'error' ? 'error' : 'neutral'"
          :variant="areOfflinePagesReady ? 'soft' : 'subtle'"
          :icon="areOfflinePagesReady ? 'i-lucide-files' : isPreparingOfflinePages ? 'i-lucide-loader-circle' : offlinePagesStatus === 'error' ? 'i-lucide-alert-circle' : 'i-lucide-file-clock'"
          :class="isPreparingOfflinePages ? 'animate-pulse' : ''"
        >
          Páginas {{ areOfflinePagesReady ? 'listas' : isPreparingOfflinePages ? 'preparando…' : offlinePagesStatus === 'error' ? 'con error' : 'pendientes' }}
        </UBadge>
      </div>

      <template v-if="isSyncing || status === 'error'">
        <UProgress
          :value="isSyncing ? progress : undefined"
          :animation="isSyncing && progress === 0 ? 'carousel' : undefined"
          color="primary"
          size="sm"
        />
        <p class="text-xs text-muted">
          {{ label }}
        </p>
      </template>

      <div
        v-if="isCachingOfflineAssets"
        class="flex items-center gap-2 text-xs text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin"
        />
        <span>Guardando recursos de la app para uso sin conexión…</span>
      </div>

      <p
        v-else-if="hasOfflineResources"
        class="text-xs text-muted"
      >
        Recursos de la app listos para uso sin conexión.
        <template v-if="offlineResourcesReadyAt">
          Preparados a las {{ offlineResourcesReadyAt }}.
        </template>
      </p>

      <p
        v-else-if="offlineResourcesStatus === 'error'"
        class="text-xs text-error"
      >
        No se pudieron guardar todos los recursos base de la app para uso sin conexión. Mantén la app abierta con conexión e inténtalo de nuevo.
      </p>

      <div
        v-if="isPreparingOfflinePages"
        class="flex items-center gap-2 text-xs text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin"
        />
        <span>Preparando páginas offline (`/purchases` y `/measurements`)…</span>
      </div>

      <p
        v-else-if="areOfflinePagesReady"
        class="text-xs text-muted"
      >
        Páginas offline listas: `/purchases` y `/measurements`.
        <template v-if="offlinePagesReadyAt">
          Preparadas a las {{ offlinePagesReadyAt }}.
        </template>
      </p>

      <p
        v-else-if="offlinePagesStatus === 'error'"
        class="text-xs text-error"
      >
        No se pudieron preparar todas las páginas offline. Mantén la app abierta con conexión e inténtalo de nuevo.
      </p>

      <p
        v-if="status === 'error'"
        class="text-xs text-error"
      >
        Error al sincronizar. Asegúrate de tener conexión.
      </p>
    </div>

    <p
      v-if="!loggedIn"
      class="font-medium"
    >
      Hola: ¿Te acuerdas de la talla y modelo de pantalones que necesitas de esa marca que cambia el tallaje incluso cuando se elije otro color del pantalón?
    </p>
    <p v-if="!loggedIn">
      ¿O de la talla de zapatos que usas en esa tienda online extranjera que siempre talla diferente?
    </p>
    <p v-if="!loggedIn">
      Esta es una aplicación sencilla para gestionar tus tallas de ropa, calzado y accesorios.
      <template v-if="!loggedIn">
        Inicia sesión para comenzar a guardar y administrar tus tallas de manera segura.
      </template>
    </p>

    <USeparator />

    <p
      v-if="!loggedIn"
      class="text-sm text-muted italic"
    >
      No se almacena ninguna información personal de tu cuenta de GitHub en la base de datos.<br>
    </p>
  </div>
</template>
