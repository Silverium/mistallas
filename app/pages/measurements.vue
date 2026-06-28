<script setup lang="ts">
import { measurementsQuery } from '~/queries/measurements'

definePageMeta({
  middleware: 'auth'
})

type Measurement = {
  id: number
  recordedAt: string | Date
  weightKg: number
  heightCm?: number | null
  chestCm?: number | null
  waistCm?: number | null
  hipsCm?: number | null
  notes?: string | null
}

const toast = useToast()
const queryCache = useQueryCache()

const form = reactive({
  weightKg: '',
  heightCm: '',
  chestCm: '',
  waistCm: '',
  hipsCm: '',
  notes: ''
})

const bulkJson = ref('')

const { data: measurements } = useQuery(measurementsQuery)

const { mutate: addMeasurement, isLoading: adding } = useMutation({
  mutation: () => $fetch('/api/measurements', {
    method: 'POST',
    body: {
      weightKg: Number(form.weightKg),
      heightCm: form.heightCm ? Number(form.heightCm) : undefined,
      chestCm: form.chestCm ? Number(form.chestCm) : undefined,
      waistCm: form.waistCm ? Number(form.waistCm) : undefined,
      hipsCm: form.hipsCm ? Number(form.hipsCm) : undefined,
      notes: form.notes || undefined
    }
  }),
  async onSuccess() {
    await queryCache.invalidateQueries(measurementsQuery)
    form.weightKg = ''
    form.heightCm = ''
    form.chestCm = ''
    form.waistCm = ''
    form.hipsCm = ''
    form.notes = ''
    toast.add({ title: 'Medida guardada correctamente.' })
  },
  onError(err) {
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
  mutation: (id: number) => $fetch(`/api/measurements/${id}`, { method: 'DELETE' }),
  async onSuccess() {
    await queryCache.invalidateQueries(measurementsQuery)
    toast.add({ title: 'Medida eliminada.' })
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
      throw new Error('El JSON debe ser un arreglo de medidas.')
    }

    return $fetch<{ uploaded: number }>('/api/measurements/upload', {
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
    if (err instanceof Error) {
      toast.add({ title: err.message, color: 'error' })
      return
    }
    if (isNuxtZodError(err)) {
      const title = err.data?.data.issues.map(issue => issue.message).join('\n')
      if (title) {
        toast.add({ title, color: 'error' })
      }
      return
    }
    toast.add({ title: 'No se pudo subir el lote de medidas.', color: 'error' })
  }
})

const formattedMeasurements = computed(() => (measurements.value ?? []) as Measurement[])
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
        v-model="form.notes"
        placeholder="Notas (opcional)"
      />

      <div class="sm:col-span-2">
        <UButton
          type="submit"
          icon="i-lucide-save"
          :loading="adding"
          :disabled="!form.weightKg"
        >
          Guardar medida
        </UButton>
      </div>
    </form>

    <div class="space-y-2">
      <h3 class="font-medium">
        Carga masiva (JSON)
      </h3>
      <p class="text-sm text-muted">
        Pega un arreglo JSON de medidas para subir historial en lote.
      </p>
      <UTextarea
        v-model="bulkJson"
        :rows="6"
        placeholder="[{&quot;weightKg&quot;:70,&quot;waistCm&quot;:82,&quot;recordedAt&quot;:&quot;2020-03-10&quot;},{&quot;weightKg&quot;:85,&quot;waistCm&quot;:94}]"
      />
      <UButton
        icon="i-lucide-upload"
        :loading="uploading"
        :disabled="!bulkJson.trim()"
        @click="uploadMeasurements()"
      >
        Subir medidas
      </UButton>
    </div>

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
              Altura: {{ item.heightCm ?? '—' }} cm · Pecho: {{ item.chestCm ?? '—' }} cm · Cintura: {{ item.waistCm ?? '—' }} cm
            </p>
            <p
              v-if="item.notes"
              class="text-sm text-muted"
            >
              {{ item.notes }}
            </p>
          </div>

          <UButton
            color="error"
            variant="soft"
            size="xs"
            icon="i-lucide-trash"
            @click="removeMeasurement(item.id)"
          />
        </li>
      </ul>
    </div>
  </div>
</template>
