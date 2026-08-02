<script setup lang="ts">
type PendingPreview = {
  id: string
  previewUrl: string
}

const props = withDefaults(defineProps<{
  uploadedSlots: number[]
  pendingPreviews: PendingPreview[]
  buildPhotoSrc: (slot: number) => string
  maxPhotos?: number
  canAddPhoto?: boolean
  showHeader?: boolean
  fillEmptySlots?: boolean
  enableUploadedPreview?: boolean
  showDeleteUploaded?: boolean
  showDeletePending?: boolean
}>(), {
  maxPhotos: 3,
  canAddPhoto: true,
  showHeader: false,
  fillEmptySlots: false,
  enableUploadedPreview: false,
  showDeleteUploaded: false,
  showDeletePending: false
})

const emit = defineEmits<{
  (e: 'add-empty-slot'): void
  (e: 'preview-uploaded' | 'delete-uploaded' | 'delete-pending', indexOrSlot: number): void
}>()

const totalPhotos = computed(() => props.uploadedSlots.length + props.pendingPreviews.length)

const canTriggerUpload = computed(() => {
  return props.canAddPhoto && totalPhotos.value < props.maxPhotos
})

const emptySlotCount = computed(() => {
  if (!props.fillEmptySlots) {
    return 0
  }

  return Math.max(0, props.maxPhotos - totalPhotos.value)
})

const shouldShowGrid = computed(() => {
  return props.uploadedSlots.length > 0 || props.pendingPreviews.length > 0 || emptySlotCount.value > 0
})
</script>

<template>
  <div class="space-y-2">
    <h4
      v-if="showHeader"
      class="font-medium"
    >
      Fotos ({{ totalPhotos }}/{{ maxPhotos }})
    </h4>

    <div
      v-if="shouldShowGrid"
      class="grid grid-cols-3 gap-2"
    >
      <template
        v-for="slot in uploadedSlots"
        :key="`uploaded-${slot}`"
      >
        <button
          v-if="enableUploadedPreview"
          type="button"
          class="w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary aspect-square overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
          @click="emit('preview-uploaded', slot)"
        >
          <img
            :src="buildPhotoSrc(slot)"
            :alt="`Foto ${slot}`"
            class="size-full object-cover"
          >
        </button>

        <div
          v-else
          class="relative aspect-square overflow-hidden rounded-md group"
        >
          <img
            :src="buildPhotoSrc(slot)"
            :alt="`Foto ${slot}`"
            class="size-full rounded-md object-cover"
          >
          <UButton
            v-if="showDeleteUploaded"
            class="absolute right-1 top-1 opacity-100"
            data-testid="delete-photo-button"
            color="error"
            variant="solid"
            icon="i-lucide-x"
            size="xs"
            @click="emit('delete-uploaded', slot)"
          />
        </div>
      </template>

      <div
        v-for="(pending, index) in pendingPreviews"
        :key="`pending-${pending.id}`"
        class="relative aspect-square overflow-hidden rounded-md group border-2 border-dashed border-amber-400 dark:border-amber-600"
      >
        <img
          :src="pending.previewUrl"
          alt="Foto pendiente"
          class="size-full rounded-md object-cover opacity-50"
          loading="lazy"
        >
        <div class="absolute inset-0 flex items-center justify-center bg-amber-500/30">
          <span class="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-100">Por subir</span>
        </div>
        <UButton
          v-if="showDeletePending"
          class="absolute right-1 top-1 opacity-100"
          color="error"
          variant="solid"
          icon="i-lucide-x"
          size="xs"
          @click="emit('delete-pending', index)"
        />
      </div>

      <button
        v-for="emptyIndex in emptySlotCount"
        :key="`empty-${emptyIndex}`"
        type="button"
        class="w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary h-8 sm:h-10 border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center align-center my-auto disabled:opacity-60 disabled:cursor-not-allowed"
        :disabled="!canTriggerUpload"
        aria-label="Añadir foto"
        @click="emit('add-empty-slot')"
      >
        <div class="flex items-center justify-center gap-2">
          <span class="text-2xl text-gray-400">+</span>
          <span class="text-xs text-gray-400">Foto</span>
        </div>
      </button>
    </div>
  </div>
</template>
