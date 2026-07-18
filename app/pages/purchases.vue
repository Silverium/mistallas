<script setup lang="ts">
import { purchasesQuery } from '~/queries/purchases'
import { getSpanishApiErrorMessage, isNuxtZodError } from '~/utils/errors'
import { blobToBase64, compressImage } from '~/utils/image-compression'
import { measurementSpecs } from '~/utils/measurementSpecs'
import { useSyncedStringQueryParam } from '~/utils/query-param'

definePageMeta({
  middleware: 'auth'
})

type Purchase = {
  id: number
  brand: string
  category: string
  productType: string
  sizeLabel: string
  purchasedAt: string | Date
  fitFeedback?: string | null
  notes?: string | null
  price?: number | null
  photoSlots?: number[]
}

type MeasurementFieldKey = typeof measurementSpecs[number]['key']
type MeasurementSnapshot = Partial<Record<MeasurementFieldKey, number | null>>

type ComparisonResult = {
  snapshotAtPurchase?: MeasurementSnapshot
  currentMeasurement?: MeasurementSnapshot
  highlights?: {
    weight?: string | null
  }
  comparison?: {
    weightKg?: {
      before: number | null
      now: number | null
      delta: number | null
    }
  }
}

type PurchasePhoto = {
  id: number
  slot: number
  mimeType: string
  width: number | null
  height: number | null
  bytes: number | null
  createdAt: string | Date | null
}

const toast = useToast()
const queryCache = useQueryCache()
const requestFetch = useRequestFetch()

const form = reactive({
  brand: '',
  category: '',
  productType: '',
  sizeLabel: '',
  fitFeedback: '',
  notes: '',
  price: ''
})

const selectedComparison = ref<ComparisonResult | null>(null)
const selectedPurchase = ref<Purchase | null>(null)
const selectedPhotoPurchaseId = ref<number | null>(null)
const selectedPreviewPurchase = ref<Purchase | null>(null)
const selectedPreviewSlot = ref<number | null>(null)
const photoInput = ref<HTMLInputElement | null>(null)
const directUploadPurchaseId = ref<number | null>(null)
const historyFilter = useSyncedStringQueryParam('filter')
const editingPurchaseId = ref<number | null>(null)
const deletingPurchaseId = ref<number | null>(null)
const isAddPurchaseDialogOpen = ref(false)
const isEditPurchaseDialogOpen = ref(false)
const pendingPhotosToUpload = ref<File[]>([])

type PendingPhotoPreview = {
  file: File
  previewUrl: string
}

type RowDiff = {
  key: string
  label: string
  unit: string
  before: number
  now: number
  delta: number
}

const { loggedIn } = useUserSession()

const { data: purchases } = useQuery({
  ...purchasesQuery,
  enabled: () => loggedIn.value
})

const { mutate: addPurchase, isLoading: addingPurchase } = useMutation({
  mutation: () => requestFetch('/api/purchases', {
    method: 'POST',
    body: {
      brand: form.brand,
      category: form.category,
      productType: form.productType,
      sizeLabel: form.sizeLabel,
      fitFeedback: form.fitFeedback || undefined,
      notes: form.notes || undefined,
      price: form.price ? Number(form.price) : undefined
    }
  }),
  async onSuccess(data: { purchase: Purchase }) {
    await queryCache.invalidateQueries(purchasesQuery)

    // Upload pending photos after purchase is created
    if (pendingPhotosToUpload.value.length > 0) {
      await uploadPendingPhotos(data.purchase.id)
    }

    resetForm()
    toast.add({ title: 'Compra guardada con snapshot de medidas.' })
  },
  onError(err) {
    if (isNuxtZodError(err)) {
      const title = err.data?.data.issues.map(issue => issue.message).join('\n')
      if (title) {
        toast.add({ title, color: 'error' })
      }
      return
    }

    const message = err && typeof err === 'object' && 'data' in err
      ? (err.data as { message?: string } | undefined)?.message
      : undefined
    toast.add({ title: message ?? 'No se pudo guardar la compra. ¿Ya registraste una medida?', color: 'error' })
  }
})

const { mutate: editPurchase, isLoading: editingPurchase } = useMutation({
  mutation: (purchaseId: number) => requestFetch(`/api/purchases/${purchaseId}`, {
    method: 'PATCH',
    body: {
      brand: form.brand,
      category: form.category,
      productType: form.productType,
      sizeLabel: form.sizeLabel,
      fitFeedback: form.fitFeedback || undefined,
      notes: form.notes || undefined,
      price: form.price ? Number(form.price) : undefined
    }
  }),
  async onSuccess(data: Purchase) {
    await queryCache.invalidateQueries(purchasesQuery)

    // Upload pending photos after purchase is updated
    if (pendingPhotosToUpload.value.length > 0) {
      await uploadPendingPhotos(data.id)
    }

    resetForm()
    toast.add({ title: 'Compra actualizada correctamente.' })
  },
  onError(err) {
    if (isNuxtZodError(err)) {
      const title = err.data?.data.issues.map(issue => issue.message).join('\n')
      if (title) {
        toast.add({ title, color: 'error' })
      }
      return
    }

    const message = err && typeof err === 'object' && 'data' in err
      ? (err.data as { message?: string } | undefined)?.message
      : undefined
    toast.add({ title: message ?? 'No se pudo actualizar la compra.', color: 'error' })
  }
})

const { mutate: removePurchase, isLoading: deletingPurchase } = useMutation({
  mutation: (purchase: Purchase) => requestFetch(`/api/purchases/${purchase.id}`, {
    method: 'DELETE'
  }),
  async onSuccess(_deleted, purchase) {
    await queryCache.invalidateQueries(purchasesQuery)

    if (selectedPurchase.value?.id === purchase.id) {
      selectedPurchase.value = null
      selectedComparison.value = null
    }

    if (selectedPhotoPurchaseId.value === purchase.id) {
      selectedPhotoPurchaseId.value = null
    }

    if (editingPurchaseId.value === purchase.id) {
      resetForm()
    }

    toast.add({ title: 'Compra eliminada.' })
  },
  onSettled() {
    deletingPurchaseId.value = null
  },
  onError() {
    toast.add({ title: 'No se pudo eliminar la compra.', color: 'error' })
  }
})

const { mutate: comparePurchase, isLoading: comparing } = useMutation({
  mutation: (purchase: Purchase) => requestFetch<ComparisonResult>(`/api/purchases/${purchase.id}/compare`),
  onSuccess(data, purchase) {
    selectedComparison.value = data
    selectedPurchase.value = purchase
  },
  onError() {
    toast.add({ title: 'No se pudo generar la comparación.', color: 'error' })
  }
})

const { data: photoList, refresh: refreshPhotos, isLoading: photosLoading } = useQuery({
  key: ['purchase-photos'],
  query: async () => {
    if (!selectedPhotoPurchaseId.value) {
      return [] as PurchasePhoto[]
    }

    return requestFetch<PurchasePhoto[]>(`/api/purchases/${selectedPhotoPurchaseId.value}/photos`)
  },
  enabled: () => !!selectedPhotoPurchaseId.value
})

const triggerPhotoPicker = () => {
  photoInput.value?.click()
}

const openEditAndAddPhoto = async (purchase: Purchase) => {
  directUploadPurchaseId.value = purchase.id
  triggerPhotoPicker()
}

const buildPhotoUrl = (purchaseId: number, slot: number) => `/api/purchases/${purchaseId}/photos/${slot}`

const openPreview = (purchase: Purchase, slot: number) => {
  selectedPreviewPurchase.value = purchase
  selectedPreviewSlot.value = slot
}

const closePreview = () => {
  selectedPreviewPurchase.value = null
  selectedPreviewSlot.value = null
}

const previewSlots = computed(() => selectedPreviewPurchase.value?.photoSlots ?? [])

const previewImageSrc = computed(() => {
  const purchase = selectedPreviewPurchase.value
  const slot = selectedPreviewSlot.value

  if (!purchase || slot == null) {
    return null
  }

  return buildPhotoUrl(purchase.id, slot)
})

const isPreviewOpen = computed({
  get: () => Boolean(selectedPreviewPurchase.value && selectedPreviewSlot.value != null),
  set: (isOpen: boolean) => {
    if (!isOpen) {
      closePreview()
    }
  }
})

const uploadPhotoFile = async (purchaseId: number, file: File) => {
  try {
    const compressedBlob = await compressImage(file)
    const fileBase64 = await blobToBase64(compressedBlob)

    await requestFetch(`/api/purchases/${purchaseId}/photos`, {
      method: 'POST',
      body: {
        fileBase64,
        mimeType: compressedBlob.type || 'image/webp'
      }
    })
  }
  catch (_err) {
    toast.add({
      title: getSpanishApiErrorMessage(_err) ?? 'Error al subir foto',
      color: 'error'
    })
    throw _err
  }
}

const uploadPendingPhotos = async (purchaseId: number) => {
  if (!purchaseId || pendingPhotosToUpload.value.length === 0) {
    return
  }

  try {
    // Upload all pending photos sequentially
    for (const file of pendingPhotosToUpload.value) {
      await uploadPhotoFile(purchaseId, file)
    }

    // After all uploads succeed, refresh and notify
    await queryCache.invalidateQueries(purchasesQuery)
    if (pendingPhotosToUpload.value.length === 1) {
      toast.add({ title: 'Foto subida' })
    }
    else {
      toast.add({ title: `${pendingPhotosToUpload.value.length} fotos subidas` })
    }
    pendingPhotosToUpload.value = []
    await refreshPhotos()
  }
  catch (_err) {
    toast.add({
      title: getSpanishApiErrorMessage(_err) ?? 'Error al subir fotos',
      color: 'error'
    })
  }
}

const onPhotoInputChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  // Direct upload from list view
  if (directUploadPurchaseId.value) {
    const purchaseId = directUploadPurchaseId.value
    directUploadPurchaseId.value = null

    try {
      const compressedBlob = await compressImage(file)
      const fileBase64 = await blobToBase64(compressedBlob)

      await requestFetch(`/api/purchases/${purchaseId}/photos`, {
        method: 'POST',
        body: {
          fileBase64,
          mimeType: compressedBlob.type || 'image/webp'
        }
      })

      await queryCache.invalidateQueries(purchasesQuery)
      toast.add({ title: 'Foto subida' })
      await refreshPhotos()
    }
    catch (_err) {
      toast.add({
        title: getSpanishApiErrorMessage(_err) ?? 'Error al subir foto',
        color: 'error'
      })
    }
  }
  // Pending upload from edit dialog
  else if (editingPurchaseId.value) {
    pendingPhotosToUpload.value.push(file)
    toast.add({ title: 'Foto agregada (se subirá al guardar)' })
  }

  input.value = ''
}

const deletePhoto = async (purchaseId: number, slot: number) => {
  if (!confirm('¿Eliminar esta foto?')) return

  try {
    await requestFetch(`/api/purchases/${purchaseId}/photos/${slot}`, {
      method: 'DELETE'
    })
    await queryCache.invalidateQueries(purchasesQuery)

    if (selectedPreviewPurchase.value?.id === purchaseId && selectedPreviewSlot.value === slot) {
      const nextSlot = (selectedPreviewPurchase.value.photoSlots ?? []).filter(currentSlot => currentSlot !== slot)[0]
      selectedPreviewSlot.value = nextSlot ?? null

      if (!nextSlot) {
        closePreview()
      }
    }

    toast.add({ title: 'Foto eliminada' })
    await refreshPhotos()
  }
  catch {
    toast.add({ title: 'Error al eliminar foto', color: 'error' })
  }
}

const purchaseList = computed(() => (purchases.value ?? []) as Purchase[])

const isSubmitting = computed(() => addingPurchase.value || editingPurchase.value)

const closeComparisonDialog = () => {
  selectedPurchase.value = null
  selectedComparison.value = null
}

const isComparisonDialogOpen = computed({
  get: () => Boolean(selectedPurchase.value && selectedComparison.value),
  set: (isOpen: boolean) => {
    if (!isOpen) {
      closeComparisonDialog()
    }
  }
})

const resetForm = () => {
  form.brand = ''
  form.category = ''
  form.productType = ''
  form.sizeLabel = ''
  form.fitFeedback = ''
  form.notes = ''
  form.price = ''
  editingPurchaseId.value = null
  selectedPhotoPurchaseId.value = null
  isEditPurchaseDialogOpen.value = false
  isAddPurchaseDialogOpen.value = false
  // Revoke preview URLs to free memory
  pendingPhotosPreviews.value.forEach((preview) => {
    URL.revokeObjectURL(preview.previewUrl)
  })
  pendingPhotosToUpload.value = []
}

const closeEditModal = () => {
  resetForm()
}

const isEditModalOpen = computed({
  get: () => isEditPurchaseDialogOpen.value,
  set: (value: boolean) => {
    if (!value) {
      // Only reset when modal is closing, not when opening
      closeEditModal()
    }
    else {
      isEditPurchaseDialogOpen.value = true
    }
  }
})

const startAddingPurchase = () => {
  resetForm()
  pendingPhotosToUpload.value = []
  isAddPurchaseDialogOpen.value = true
}

const startEditing = (purchase: Purchase) => {
  isEditPurchaseDialogOpen.value = true
  editingPurchaseId.value = purchase.id
  selectedPhotoPurchaseId.value = purchase.id
  pendingPhotosToUpload.value = []
  form.brand = purchase.brand
  form.category = purchase.category
  form.productType = purchase.productType
  form.sizeLabel = purchase.sizeLabel
  form.fitFeedback = purchase.fitFeedback ?? ''
  form.notes = purchase.notes ?? ''
  form.price = purchase.price != null ? String(purchase.price) : ''
}

const savePurchase = () => {
  if (editingPurchaseId.value) {
    editPurchase(editingPurchaseId.value)
    return
  }

  addPurchase()
}

const confirmAndDelete = (purchase: Purchase) => {
  const confirmed = window.confirm(`¿Eliminar la compra de ${purchase.brand} (${purchase.productType}, talla ${purchase.sizeLabel})?`)
  if (!confirmed) {
    return
  }

  deletingPurchaseId.value = purchase.id
  removePurchase(purchase)
}

const filteredPurchaseList = computed(() => {
  const term = historyFilter.value.trim().toLowerCase()
  if (!term) {
    return purchaseList.value
  }

  return purchaseList.value.filter((purchase) => {
    const haystack = [
      purchase.brand,
      purchase.category,
      purchase.productType,
      purchase.sizeLabel,
      purchase.fitFeedback,
      purchase.notes
    ].filter(Boolean).join(' ').toLowerCase()

    return haystack.includes(term)
  })
})

const filteredPhotoList = computed(() => (photoList.value ?? []) as PurchasePhoto[])

const pendingPhotosPreviews = computed<PendingPhotoPreview[]>(() => {
  return pendingPhotosToUpload.value.map(file => ({
    file,
    previewUrl: URL.createObjectURL(file)
  }))
})

const removePendingPhoto = (index: number) => {
  const preview = pendingPhotosPreviews.value[index]
  if (preview) {
    URL.revokeObjectURL(preview.previewUrl)
  }
  pendingPhotosToUpload.value.splice(index, 1)
}

const fmt = (value: number, unit: string) => `${value.toFixed(1)} ${unit}`

const canAddMorePhotos = (purchase: Purchase) => {
  return (purchase.photoSlots?.length ?? 0) < 3
}

const diffRows = computed<RowDiff[]>(() => {
  const snapshot = selectedComparison.value?.snapshotAtPurchase
  const current = selectedComparison.value?.currentMeasurement

  if (!snapshot || !current) {
    return []
  }

  return measurementSpecs.flatMap((spec) => {
    const before = snapshot[spec.key]
    const now = current[spec.key]

    if (before == null || now == null) {
      return []
    }

    if (before === now) {
      return []
    }

    return [{
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      before,
      now,
      delta: Number((now - before).toFixed(1))
    }]
  })
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <label
      for="purchase-photo-input"
      class="sr-only"
    >
      Subir foto de compra
    </label>
    <input
      id="purchase-photo-input"
      ref="photoInput"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      class="hidden"
      @change="onPhotoInputChange"
    >

    <div>
      <h2 class="text-lg font-semibold">
        Compras
      </h2>
      <p class="text-sm text-muted">
        Guarda compras para comparar tus medidas de ese momento con las actuales.
      </p>
      <div class="mt-3">
        <UButton
          type="button"
          icon="i-lucide-plus"
          @click="startAddingPurchase"
        >
          Añadir compra
        </UButton>
      </div>
    </div>

    <div class="space-y-2">
      <h3 class="font-medium">
        Historial de compras
      </h3>
      <UInput
        v-model="historyFilter"
        icon="i-lucide-filter"
        placeholder="Filtrar por marca, categoría, prenda, talla o notas"
      />
      <ul class="divide-y divide-gray-200 dark:divide-gray-800">
        <li
          v-for="purchase in filteredPurchaseList"
          :key="purchase.id"
          class="py-3 space-y-3"
        >
          <div data-testid="purchase-info">
            <p
              data-testid="purchase-summary"
              class="font-medium"
            >
              {{ purchase.brand }} · {{ purchase.productType }} · Talla {{ purchase.sizeLabel }}
            </p>
            <p
              data-testid="purchase-details"
              class="text-sm text-muted"
            >
              {{ purchase.category }} · {{ new Date(purchase.purchasedAt).toLocaleDateString() }}<template v-if="purchase.price != null">
                · {{ purchase.price.toFixed(2) }} €
              </template>
            </p>
            <p
              v-if="purchase.notes || purchase.fitFeedback"
              class="text-sm text-muted"
            >
              {{ purchase.notes || purchase.fitFeedback }}
            </p>

            <div
              v-if="purchase.photoSlots?.length || canAddMorePhotos(purchase)"
              class="mt-2 grid grid-cols-3 gap-2"
            >
              <button
                v-for="slot in [1, 2, 3]"
                :key="`photo-${purchase.id}-${slot}`"
                type="button"
                :class="[
                  'w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  purchase.photoSlots?.includes(slot)
                    ? 'aspect-square overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700'
                    : 'h-8 sm:h-10 border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center align-center my-auto'
                ]"
                :aria-label="purchase.photoSlots?.includes(slot) ? `Abrir foto ${slot} de ${purchase.brand}` : `Añadir foto ${slot}`"
                @click="purchase.photoSlots?.includes(slot) ? openPreview(purchase, slot) : openEditAndAddPhoto(purchase)"
              >
                <img
                  v-if="purchase.photoSlots?.includes(slot)"
                  :src="buildPhotoUrl(purchase.id, slot)"
                  :alt="`Foto ${slot} de ${purchase.brand}`"
                  class="size-full object-cover"
                  loading="lazy"
                >
                <div
                  v-else
                  class="flex items-center justify-center gap-2"
                >
                  <span class="text-2xl text-gray-400">+</span>
                  <span class="text-xs text-gray-400">Foto</span>
                </div>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <UButton
              variant="soft"
              color="neutral"
              icon="i-lucide-pencil"
              class="h-10 w-full justify-center text-center sm:h-10"
              @click="startEditing(purchase)"
            >
              Editar
            </UButton>
            <UButton
              variant="soft"
              icon="i-lucide-git-compare"
              class="h-10 w-full justify-center text-center sm:h-10"
              :loading="comparing && selectedPurchase?.id === purchase.id"
              @click="comparePurchase(purchase)"
            >
              Comparar medidas
            </UButton>
          </div>
        </li>
      </ul>
      <p
        v-if="!filteredPurchaseList.length"
        class="text-sm text-muted"
      >
        No hay compras que coincidan con el filtro.
      </p>
    </div>

    <!-- Add/Edit Purchase Dialog -->
    <UModal v-model:open="isAddPurchaseDialogOpen">
      <template #content>
        <div class="space-y-4 p-4 sm:p-6">
          <div>
            <h3 class="text-lg font-medium">
              Añadir compra
            </h3>
          </div>

          <form
            class="grid grid-cols-1 sm:grid-cols-2 gap-3"
            @submit.prevent="savePurchase()"
          >
            <UInput
              v-model="form.brand"
              placeholder="Marca (Nike, Zara...) *"
              required
              autofocus
            />
            <UInput
              v-model="form.category"
              placeholder="Categoría (ropa, calzado...) *"
              required
            />
            <UInput
              v-model="form.productType"
              placeholder="Tipo de prenda (t-shirt, jeans...) *"
              required
            />
            <UInput
              v-model="form.sizeLabel"
              placeholder="Talla (S, M, L, 42...) *"
              required
            />
            <UInput
              v-model="form.fitFeedback"
              placeholder="Feedback de ajuste (opcional)"
            />
            <UInput
              v-model="form.price"
              type="number"
              min="0"
              step="0.01"
              placeholder="Precio (opcional)"
            />
            <UInput
              v-model="form.notes"
              class="sm:col-span-2"
              placeholder="Notas (opcional)"
            />

            <div class="sm:col-span-2 flex flex-wrap gap-2">
              <UButton
                type="submit"
                icon="i-lucide-shopping-cart"
                :loading="isSubmitting"
                :disabled="!form.brand || !form.category || !form.productType || !form.sizeLabel"
              >
                Guardar compra
              </UButton>
              <UButton
                type="button"
                variant="soft"
                color="neutral"
                icon="i-lucide-x"
                @click="() => { resetForm(); isAddPurchaseDialogOpen = false }"
              >
                Cancelar
              </UButton>
            </div>
          </form>
        </div>
      </template>
    </UModal>

    <!-- Edit Purchase Dialog -->
    <UModal v-model:open="isEditModalOpen">
      <template #content>
        <div class="space-y-4 p-4 sm:p-6 max-h-screen overflow-y-auto">
          <div class="flex items-start justify-between">
            <h3 class="text-lg font-medium">
              Editar compra
            </h3>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              @click="closeEditModal"
            />
          </div>

          <form
            class="grid grid-cols-1 sm:grid-cols-2 gap-3"
            @submit.prevent="savePurchase()"
          >
            <UInput
              v-model="form.brand"
              placeholder="Marca (Nike, Zara...) *"
              required
              autofocus
            />
            <UInput
              v-model="form.category"
              placeholder="Categoría (ropa, calzado...) *"
              required
            />
            <UInput
              v-model="form.productType"
              placeholder="Tipo de prenda (t-shirt, jeans...) *"
              required
            />
            <UInput
              v-model="form.sizeLabel"
              placeholder="Talla (S, M, L, 42...) *"
              required
            />
            <UInput
              v-model="form.fitFeedback"
              placeholder="Feedback de ajuste (opcional)"
            />
            <UInput
              v-model="form.price"
              type="number"
              min="0"
              step="0.01"
              placeholder="Precio (opcional)"
            />
            <UInput
              v-model="form.notes"
              class="sm:col-span-2"
              placeholder="Notas (opcional)"
            />

            <div class="sm:col-span-2">
              <USeparator />
            </div>

            <div class="sm:col-span-2">
              <h4 class="font-medium mb-3">
                Fotos ({{ (photoList?.length ?? 0) + pendingPhotosPreviews.length }}/3)
              </h4>
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    v-if="(photoList?.length ?? 0) + pendingPhotosPreviews.length < 3"
                    type="button"
                    icon="i-lucide-upload"
                    color="primary"
                    variant="soft"
                    @click="triggerPhotoPicker"
                  >
                    Subir foto
                  </UButton>

                  <UBadge
                    v-if="photosLoading"
                    color="neutral"
                    variant="subtle"
                  >
                    Cargando...
                  </UBadge>
                </div>

                <div
                  v-if="filteredPhotoList.length || pendingPhotosPreviews.length"
                  class="grid grid-cols-3 gap-2"
                >
                  <!-- Uploaded photos -->
                  <div
                    v-for="item in filteredPhotoList"
                    :key="`uploaded-${item.id}`"
                    class="relative aspect-square overflow-hidden rounded-md group"
                  >
                    <img
                      :src="`/api/purchases/${editingPurchaseId}/photos/${item.slot}`"
                      :alt="`Foto ${item.slot}`"
                      class="size-full rounded-md object-cover"
                      loading="lazy"
                    >
                    <UButton
                      class="absolute right-1 top-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      color="error"
                      variant="solid"
                      icon="i-lucide-x"
                      size="xs"
                      @click="deletePhoto(editingPurchaseId!, item.slot)"
                    />
                  </div>

                  <!-- Pending photo previews -->
                  <div
                    v-for="(pending, index) in pendingPhotosPreviews"
                    :key="`pending-${index}`"
                    class="relative aspect-square overflow-hidden rounded-md group border-2 border-dashed border-primary"
                  >
                    <img
                      :src="pending.previewUrl"
                      :alt="pending.file.name"
                      class="size-full rounded-md object-cover opacity-75"
                      loading="lazy"
                    >
                    <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                      <span class="text-xs font-medium text-white">Por subir</span>
                    </div>
                    <UButton
                      class="absolute right-1 top-1 opacity-100"
                      color="error"
                      variant="solid"
                      icon="i-lucide-x"
                      size="xs"
                      @click="removePendingPhoto(index)"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div class="sm:col-span-2 flex flex-wrap gap-2">
              <UButton
                type="submit"
                icon="i-lucide-save"
                :loading="isSubmitting"
                :disabled="!form.brand || !form.category || !form.productType || !form.sizeLabel"
              >
                Guardar cambios
              </UButton>
              <UButton
                type="button"
                color="error"
                variant="soft"
                icon="i-lucide-trash"
                :loading="deletingPurchase && deletingPurchaseId === editingPurchaseId"
                @click="() => { if (editingPurchaseId) { confirmAndDelete(purchaseList.find(p => p.id === editingPurchaseId)!) } }"
              >
                Eliminar compra
              </UButton>
              <UButton
                type="button"
                variant="soft"
                color="neutral"
                icon="i-lucide-x"
                @click="closeEditModal"
              >
                Cancelar
              </UButton>
            </div>
          </form>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="isComparisonDialogOpen">
      <template #content>
        <div
          v-if="selectedPurchase && selectedComparison"
          class="space-y-3 p-4 sm:p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <h3 class="font-medium">
              Comparativa de medidas · {{ selectedPurchase.brand }} {{ selectedPurchase.productType }} ({{ selectedPurchase.sizeLabel }})
            </h3>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              @click="closeComparisonDialog"
            />
          </div>

          <UAlert
            v-if="selectedComparison.highlights?.weight"
            color="primary"
            variant="subtle"
            icon="i-lucide-scale"
            :title="selectedComparison.highlights.weight"
          />

          <div
            v-if="diffRows.length"
            class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800"
          >
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 dark:bg-gray-900/40">
                <tr>
                  <th class="text-left px-3 py-2 font-medium">
                    Medida
                  </th>
                  <th class="text-left px-3 py-2 font-medium">
                    Antes
                  </th>
                  <th class="text-left px-3 py-2 font-medium">
                    Ahora
                  </th>
                  <th class="text-left px-3 py-2 font-medium">
                    Cambio
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in diffRows"
                  :key="row.key"
                  class="border-t border-gray-200 dark:border-gray-800"
                >
                  <td class="px-3 py-2 font-medium">
                    {{ row.label }}
                  </td>
                  <td class="px-3 py-2">
                    {{ fmt(row.before, row.unit) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ fmt(row.now, row.unit) }}
                  </td>
                  <td
                    class="px-3 py-2"
                    :class="row.delta > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'"
                  >
                    {{ row.delta > 0 ? '+' : '' }}{{ fmt(row.delta, row.unit) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <UAlert
            v-else
            color="neutral"
            variant="soft"
            icon="i-lucide-check"
            title="No hay cambios de medidas entre la compra y tu estado actual."
          />

          <div class="flex justify-end">
            <UButton
              color="neutral"
              variant="soft"
              @click="closeComparisonDialog"
            >
              Cerrar
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="isPreviewOpen"
      fullscreen
      :dismissible="true"
      :ui="{
        content: 'h-screen w-screen max-w-none p-0 sm:p-0'
      }"
    >
      <template #content>
        <div class="relative flex h-screen w-screen flex-col bg-black/95 text-white">
          <div class="absolute right-3 top-3 z-10">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-x"
              @click="closePreview"
            >
              Cerrar
            </UButton>
          </div>

          <div class="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
            <img
              v-if="previewImageSrc"
              :src="previewImageSrc"
              :alt="selectedPreviewPurchase ? `Vista ampliada de ${selectedPreviewPurchase.brand}` : 'Vista ampliada'"
              class="max-h-full max-w-full object-contain"
            >
          </div>

          <div
            v-if="selectedPreviewPurchase && previewSlots.length > 1"
            class="flex items-center gap-2 overflow-x-auto border-t border-white/10 p-3"
          >
            <button
              v-for="slot in previewSlots"
              :key="`modal-preview-${selectedPreviewPurchase.id}-${slot}`"
              type="button"
              class="rounded-md transition ring-2"
              :class="selectedPreviewSlot === slot ? 'ring-primary' : 'ring-transparent hover:ring-white/40'"
              :aria-label="`Ver foto ${slot}`"
              @click="selectedPreviewSlot = slot"
            >
              <img
                :src="buildPhotoUrl(selectedPreviewPurchase.id, slot)"
                :alt="`Miniatura de foto ${slot}`"
                class="size-16 rounded-md object-cover"
                loading="lazy"
              >
            </button>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
