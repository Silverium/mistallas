<script setup lang="ts">
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
}

const toast = useToast()

const deferredInstallPrompt = ref<BeforeInstallPromptEvent | null>(null)
const canInstallPwa = ref(false)
const isInstallDialogOpen = ref(false)
const isInstallingPwa = ref(false)
const isIosDevice = ref(false)
const isMobileDevice = ref(false)
const isStandaloneApp = ref(false)

const canShowInstallButton = computed(() => {
  return !isStandaloneApp.value
})

const installButtonLabel = computed(() => {
  if (canInstallPwa.value) {
    return 'Instalar en 1 toque'
  }

  if (isIosDevice.value || isMobileDevice.value) {
    return 'Añadir a inicio'
  }

  return 'Instalar app'
})

const handleBeforeInstallPrompt = (event: Event) => {
  const installEvent = event as BeforeInstallPromptEvent
  installEvent.preventDefault()
  deferredInstallPrompt.value = installEvent
  canInstallPwa.value = true
}

const handleAppInstalled = () => {
  deferredInstallPrompt.value = null
  canInstallPwa.value = false
  isStandaloneApp.value = true

  toast.add({
    title: 'Mis Tallas instalada',
    description: 'Ya puedes abrir la app desde la pantalla de inicio.',
    color: 'success'
  })
}

const handleInstallPwa = async () => {
  if (canInstallPwa.value && deferredInstallPrompt.value) {
    isInstallingPwa.value = true

    try {
      await deferredInstallPrompt.value.prompt()
      await deferredInstallPrompt.value.userChoice
    }
    finally {
      deferredInstallPrompt.value = null
      canInstallPwa.value = false
      isInstallingPwa.value = false
    }

    return
  }

  isInstallDialogOpen.value = true
}

const closeInstallDialog = () => {
  isInstallDialogOpen.value = false
}

onMounted(() => {
  const userAgent = navigator.userAgent.toLowerCase()
  const isIpadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const standaloneByNavigator = Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

  isIosDevice.value = /iphone|ipad|ipod/.test(userAgent) || isIpadDesktopMode
  isMobileDevice.value = /android|iphone|ipad|ipod|mobile/.test(userAgent) || isIpadDesktopMode
  isStandaloneApp.value = window.matchMedia('(display-mode: standalone)').matches || standaloneByNavigator

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.removeEventListener('appinstalled', handleAppInstalled)
})
</script>

<template>
  <div
    v-if="canShowInstallButton"
    class="flex items-center"
  >
    <UButton
      icon="i-lucide-smartphone"
      color="primary"
      variant="soft"
      :loading="isInstallingPwa"
      :disabled="isInstallingPwa"
      @click="handleInstallPwa"
    >
      {{ installButtonLabel }}
    </UButton>

    <UModal v-model:open="isInstallDialogOpen">
      <template #content>
        <div class="space-y-4 p-4 sm:p-6">
          <h3 class="text-lg font-semibold">
            Añadir Mis Tallas a la pantalla de inicio
          </h3>

          <p class="text-sm text-muted">
            Instálala como app para abrirla rápido desde el inicio y usarla como una app nativa.
          </p>

          <p class="text-sm text-muted">
            En este dispositivo no se pudo abrir la instalación en 1 toque, pero puedes instalarla manualmente con estos pasos:
          </p>

          <div
            v-if="isIosDevice"
            class="space-y-2 text-sm"
          >
            <p class="font-medium">
              En iPhone/iPad (Safari):
            </p>
            <ol class="list-decimal pl-5 space-y-1 text-muted">
              <li>Pulsa el botón Compartir de Safari.</li>
              <li>Selecciona “Añadir a pantalla de inicio”.</li>
              <li>Confirma con “Añadir”.</li>
            </ol>
          </div>

          <div
            v-else
            class="space-y-2 text-sm"
          >
            <p class="font-medium">
              En Android u ordenador:
            </p>
            <ol class="list-decimal pl-5 space-y-1 text-muted">
              <li>Abre el menú del navegador (⋮ o ⋯).</li>
              <li>Elige “Instalar app” o “Añadir a pantalla de inicio”.</li>
              <li>También puedes pulsar el botón de instalar que aparece en la barra de direcciones (si está disponible).</li>
              <li>Confirma la instalación.</li>
            </ol>
          </div>

          <div class="flex justify-end">
            <UButton
              color="neutral"
              variant="soft"
              @click="closeInstallDialog"
            >
              Cerrar
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
