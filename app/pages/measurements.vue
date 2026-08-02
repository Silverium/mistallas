<script setup lang="ts">
import { measurementsQuery } from '~/queries/measurements'
import { useOfflineRouteAccess } from '~/utils/offline-route-access'

definePageMeta({
  middleware: 'auth'
})

type MeasurementFieldKey = typeof measurementSpecs[number]['key']
type Measurement = { [K in MeasurementFieldKey]: number | null } & {
  id: number
  recordedAt: string | Date
  weightKg: number
  notes?: string | null
}

const toast = useToast()
const queryCache = useQueryCache()
const offlineFetch = useOfflineFetch()

const form = reactive({
  weightKg: '',
  heightCm: '',
  chestCm: '',
  waistCm: '',
  hipsCm: '',
  shoulderWidthCm: '',
  sleeveLengthCm: '',
  neckCm: '',
  inseamCm: '',
  thighCm: '',
  footCm: '',
  notes: ''
})

const bulkJson = ref('')
const isAddMeasurementDialogOpen = ref(false)
const isEditMeasurementDialogOpen = ref(false)
const editingId = ref<number | null>(null)

const editForm = reactive({
  weightKg: '',
  heightCm: '',
  chestCm: '',
  waistCm: '',
  hipsCm: '',
  shoulderWidthCm: '',
  sleeveLengthCm: '',
  neckCm: '',
  inseamCm: '',
  thighCm: '',
  footCm: '',
  notes: '',
  recordedAt: ''
})

const resetForm = () => {
  form.weightKg = ''
  form.heightCm = ''
  form.chestCm = ''
  form.waistCm = ''
  form.hipsCm = ''
  form.shoulderWidthCm = ''
  form.sleeveLengthCm = ''
  form.neckCm = ''
  form.inseamCm = ''
  form.thighCm = ''
  form.footCm = ''
  form.notes = ''
  isAddMeasurementDialogOpen.value = false
}

const openEdit = (item: Measurement) => {
  editingId.value = item.id
  editForm.weightKg = String(item.weightKg)
  editForm.heightCm = item.heightCm != null ? String(item.heightCm) : ''
  editForm.chestCm = item.chestCm != null ? String(item.chestCm) : ''
  editForm.waistCm = item.waistCm != null ? String(item.waistCm) : ''
  editForm.hipsCm = item.hipsCm != null ? String(item.hipsCm) : ''
  editForm.shoulderWidthCm = item.shoulderWidthCm != null ? String(item.shoulderWidthCm) : ''
  editForm.sleeveLengthCm = item.sleeveLengthCm != null ? String(item.sleeveLengthCm) : ''
  editForm.neckCm = item.neckCm != null ? String(item.neckCm) : ''
  editForm.inseamCm = item.inseamCm != null ? String(item.inseamCm) : ''
  editForm.thighCm = item.thighCm != null ? String(item.thighCm) : ''
  editForm.footCm = item.footCm != null ? String(item.footCm) : ''
  editForm.notes = item.notes ?? ''
  const d = new Date(item.recordedAt)
  editForm.recordedAt = d.toISOString().slice(0, 10)
  isEditMeasurementDialogOpen.value = true
}

const closeEdit = () => {
  isEditMeasurementDialogOpen.value = false
  editingId.value = null
}

const { loggedIn } = useUserSession()
const isHydrated = ref(false)
const offlineRouteAccess = useOfflineRouteAccess()

const { data: measurements } = useQuery({
  ...measurementsQuery,
  enabled: () => (loggedIn.value || offlineRouteAccess.value) && isHydrated.value
})

const { mutate: addMeasurement, isLoading: adding } = useMutation({
  mutation: () => offlineFetch('/api/measurements', {
    method: 'POST',
    body: {
      weightKg: Number(form.weightKg),
      heightCm: form.heightCm ? Number(form.heightCm) : undefined,
      chestCm: form.chestCm ? Number(form.chestCm) : undefined,
      waistCm: form.waistCm ? Number(form.waistCm) : undefined,
      hipsCm: form.hipsCm ? Number(form.hipsCm) : undefined,
      shoulderWidthCm: form.shoulderWidthCm ? Number(form.shoulderWidthCm) : undefined,
      sleeveLengthCm: form.sleeveLengthCm ? Number(form.sleeveLengthCm) : undefined,
      neckCm: form.neckCm ? Number(form.neckCm) : undefined,
      inseamCm: form.inseamCm ? Number(form.inseamCm) : undefined,
      thighCm: form.thighCm ? Number(form.thighCm) : undefined,
      footCm: form.footCm ? Number(form.footCm) : undefined,
      notes: form.notes || undefined
    }
  }),
  async onSuccess() {
    await queryCache.invalidateQueries(measurementsQuery)
    resetForm()
    toast.add({ title: 'Medida guardada correctamente.' })
  },
  onError(err) {
    if (isOfflineQueuedError(err)) {
      toast.add({ title: 'Sin conexión — se sincronizará al reconectarte.' })
      resetForm()
      return
    }
    if (isNuxtZodError(err)) {
      const title = err.data?.data.issues.map(issue => issue.message).join('\n')
      if (title) {
        toast.add({ title, color: 'error' })
      }
      return
    }
    toast.add({ title: 'No se pudo guardar la medida.', color: 'error' })
  }
})

const { mutate: removeMeasurement } = useMutation({
  mutation: (id: number) => offlineFetch(`/api/measurements/${id}`, { method: 'DELETE' }),
  async onSuccess() {
    await queryCache.invalidateQueries(measurementsQuery)
    toast.add({ title: 'Medida eliminada.' })
  },
  onError(err) {
    if (isOfflineQueuedError(err)) {
      toast.add({ title: 'Sin conexión — se sincronizará al reconectarte.' })
      return
    }
    toast.add({ title: 'No se pudo eliminar la medida.', color: 'error' })
  }
})

const { mutate: updateMeasurement, isLoading: updating } = useMutation({
  mutation: () => offlineFetch(`/api/measurements/${editingId.value}`, {
    method: 'PATCH',
    body: {
      weightKg: editForm.weightKg ? Number(editForm.weightKg) : undefined,
      heightCm: editForm.heightCm ? Number(editForm.heightCm) : undefined,
      chestCm: editForm.chestCm ? Number(editForm.chestCm) : undefined,
      waistCm: editForm.waistCm ? Number(editForm.waistCm) : undefined,
      hipsCm: editForm.hipsCm ? Number(editForm.hipsCm) : undefined,
      shoulderWidthCm: editForm.shoulderWidthCm ? Number(editForm.shoulderWidthCm) : undefined,
      sleeveLengthCm: editForm.sleeveLengthCm ? Number(editForm.sleeveLengthCm) : undefined,
      neckCm: editForm.neckCm ? Number(editForm.neckCm) : undefined,
      inseamCm: editForm.inseamCm ? Number(editForm.inseamCm) : undefined,
      thighCm: editForm.thighCm ? Number(editForm.thighCm) : undefined,
      footCm: editForm.footCm ? Number(editForm.footCm) : undefined,
      notes: editForm.notes || undefined,
      recordedAt: editForm.recordedAt ? new Date(editForm.recordedAt).toISOString() : undefined
    }
  }),
  async onSuccess() {
    await queryCache.invalidateQueries(measurementsQuery)
    closeEdit()
    toast.add({ title: 'Medida actualizada.' })
  },
  onError(err) {
    if (isOfflineQueuedError(err)) {
      toast.add({ title: 'Sin conexión — se sincronizará al reconectarte.' })
      closeEdit()
      return
    }
    if (isNuxtZodError(err)) {
      const title = err.data?.data.issues.map((issue: { message: string }) => issue.message).join('\n')
      if (title) {
        toast.add({ title, color: 'error' })
      }
      return
    }
    toast.add({ title: 'No se pudo actualizar la medida.', color: 'error' })
  }
})

const { mutate: uploadMeasurements, isLoading: uploading } = useMutation({
  mutation: async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(bulkJson.value)
    }
    catch {
      throw new Error('El JSON no es válido.')
    }

    if (!Array.isArray(parsed)) {
      throw new Error('El JSON debe ser una colección de medidas.')
    }

    return offlineFetch<{ uploaded: number }>('/api/measurements/upload', {
      method: 'POST',
      body: {
        measurements: parsed
      }
    })
  },
  async onSuccess(result) {
    await queryCache.invalidateQueries(measurementsQuery)
    bulkJson.value = ''
    toast.add({ title: `Se subieron ${result.uploaded} medidas.` })
  },
  onError(err) {
    if (isOfflineQueuedError(err)) {
      toast.add({ title: 'Sin conexión — se sincronizará al reconectarte.' })
      return
    }
    if (isNuxtZodError(err)) {
      const issues = (err.data?.data as { issues?: Array<{ message: string }> } | undefined)?.issues
      const title = issues?.map(issue => issue.message).join('\n')
      if (title) {
        toast.add({ title, color: 'error' })
      }
      return
    }
    if (err instanceof Error) {
      toast.add({ title: err.message, color: 'error' })
      return
    }
    toast.add({ title: 'No se pudo subir el lote de medidas.', color: 'error' })
  }
})

const formattedMeasurements = computed(() => (measurements.value ?? []) as Measurement[])

onMounted(() => {
  isHydrated.value = true
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="text-lg font-semibold">
        Mis medidas corporales
      </h2>
      <p class="text-sm text-muted">
        Guarda tu historial para comparar cómo cambiaste entre compras.
      </p>
      <div class="mt-3">
        <UButton
          type="button"
          icon="i-lucide-plus"
          @click="() => { isAddMeasurementDialogOpen = true }"
        >
          Añadir medida
        </UButton>
      </div>
    </div>

    <!-- Add Measurement Modal -->
    <UModal v-model:open="isAddMeasurementDialogOpen">
      <template #content>
        <div class="space-y-4 p-4 sm:p-6 max-h-[85dvh] overflow-y-auto">
          <div>
            <h3 class="text-lg font-medium">
              Añadir medida
            </h3>
          </div>

          <form
            class="grid grid-cols-1 sm:grid-cols-2 gap-3"
            @submit.prevent="addMeasurement()"
          >
            <UInput
              v-model="form.weightKg"
              type="number"
              step="0.1"
              min="1"
              placeholder="Peso (kg) *"
              required
              autofocus
            />
            <UInput
              v-model="form.heightCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Altura (cm)"
            />
            <UInput
              v-model="form.chestCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Pecho (cm)"
            />
            <UInput
              v-model="form.waistCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Cintura (cm)"
            />
            <UInput
              v-model="form.hipsCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Cadera (cm)"
            />
            <UInput
              v-model="form.shoulderWidthCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Ancho de hombros (cm)"
            />
            <UInput
              v-model="form.sleeveLengthCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Largo de manga (cm)"
            />
            <UInput
              v-model="form.neckCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Cuello (cm)"
            />
            <UInput
              v-model="form.inseamCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Tiro (cm)"
            />
            <UInput
              v-model="form.thighCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Muslo (cm)"
            />
            <UInput
              v-model="form.footCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Pie (cm)"
            />
            <UInput
              v-model="form.notes"
              placeholder="Notas (opcional)"
            />

            <div class="sm:col-span-2 flex flex-wrap gap-2">
              <UButton
                type="submit"
                icon="i-lucide-save"
                :loading="adding"
                :disabled="!form.weightKg"
              >
                Guardar medida
              </UButton>
              <UButton
                type="button"
                variant="soft"
                color="neutral"
                icon="i-lucide-x"
                @click="resetForm"
              >
                Cancelar
              </UButton>
            </div>
          </form>

          <div class="space-y-2 border-t pt-4">
            <h3 class="font-medium">
              Carga masiva (JSON)
            </h3>
            <div class="flex">
              <p class="text-sm text-muted">
                Pega un arreglo JSON de medidas para subir historial en lote.
              </p>
              <UButton
                icon="i-lucide-upload"
                :loading="uploading"
                :disabled="!bulkJson.trim()"
                @click="uploadMeasurements()"
              >
                Subir medidas
              </UButton>
            </div>

            <UTextarea
              v-model="bulkJson"
              :rows="6"
              class="w-full"
              placeholder="[{&quot;weightKg&quot;:70,&quot;waistCm&quot;:82,&quot;recordedAt&quot;:&quot;2020-03-10&quot;},{&quot;weightKg&quot;:85,&quot;waistCm&quot;:94}]"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Edit Measurement Modal -->
    <UModal v-model:open="isEditMeasurementDialogOpen">
      <template #content>
        <div class="space-y-4 p-4 sm:p-6 max-h-[85dvh] overflow-y-auto">
          <div>
            <h3 class="text-lg font-medium">
              Editar medida
            </h3>
          </div>

          <form
            class="grid grid-cols-1 sm:grid-cols-2 gap-3"
            @submit.prevent="updateMeasurement()"
          >
            <UInput
              v-model="editForm.recordedAt"
              type="date"
              required
              class="sm:col-span-2"
            />
            <UInput
              v-model="editForm.weightKg"
              type="number"
              step="0.1"
              min="1"
              placeholder="Peso (kg) *"
              required
            />
            <UInput
              v-model="editForm.heightCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Altura (cm)"
            />
            <UInput
              v-model="editForm.chestCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Pecho (cm)"
            />
            <UInput
              v-model="editForm.waistCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Cintura (cm)"
            />
            <UInput
              v-model="editForm.hipsCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Cadera (cm)"
            />
            <UInput
              v-model="editForm.shoulderWidthCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Ancho de hombros (cm)"
            />
            <UInput
              v-model="editForm.sleeveLengthCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Largo de manga (cm)"
            />
            <UInput
              v-model="editForm.neckCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Cuello (cm)"
            />
            <UInput
              v-model="editForm.inseamCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Tiro (cm)"
            />
            <UInput
              v-model="editForm.thighCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Muslo (cm)"
            />
            <UInput
              v-model="editForm.footCm"
              type="number"
              step="0.1"
              min="1"
              placeholder="Pie (cm)"
            />
            <UInput
              v-model="editForm.notes"
              placeholder="Notas (opcional)"
            />

            <div class="sm:col-span-2 flex flex-wrap gap-2">
              <UButton
                type="submit"
                icon="i-lucide-save"
                :loading="updating"
                :disabled="!editForm.weightKg"
              >
                Guardar cambios
              </UButton>
              <UButton
                type="button"
                variant="soft"
                color="neutral"
                icon="i-lucide-x"
                @click="closeEdit"
              >
                Cancelar
              </UButton>
            </div>
          </form>
        </div>
      </template>
    </UModal>

    <div class="space-y-2">
      <h3 class="font-medium">
        Historial
      </h3>
      <ul class="divide-y divide-gray-200 dark:divide-gray-800">
        <li
          v-for="item in formattedMeasurements"
          :key="item.id"
          class="py-3 flex items-start justify-between gap-3"
        >
          <div>
            <p class="font-medium">
              {{ item.weightKg }} kg · {{ new Date(item.recordedAt).toLocaleDateString() }}
            </p>
            <p class="text-sm text-muted">
              {{ measurementSpecs.filter(s => s.key !== 'weightKg').map(s => `${s.label}: ${item[s.key as
                MeasurementFieldKey] ?? '—'} ${s.unit}`).join(' · ') }}
            </p>
            <p
              v-if="item.notes"
              class="text-sm text-muted"
            >
              {{ item.notes }}
            </p>
          </div>

          <div class="flex flex-col gap-2">
            <UButton
              color="error"
              variant="soft"
              size="xs"
              icon="i-lucide-trash"
              @click="removeMeasurement(item.id)"
            >
              Eliminar
            </UButton>
            <UButton
              variant="soft"
              color="neutral"
              size="xs"
              icon="i-lucide-pencil"
              @click="openEdit(item)"
            >
              Editar
            </UButton>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
