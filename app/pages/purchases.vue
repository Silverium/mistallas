<script setup lang="ts">
import { purchasesQuery } from '~/queries/purchases'

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
}

type ComparisonResult = {
  snapshotAtPurchase?: {
    weightKg?: number | null
    heightCm?: number | null
    chestCm?: number | null
    waistCm?: number | null
    hipsCm?: number | null
    shoulderWidthCm?: number | null
    sleeveLengthCm?: number | null
    neckCm?: number | null
    inseamCm?: number | null
    thighCm?: number | null
  }
  currentMeasurement?: {
    weightKg?: number | null
    heightCm?: number | null
    chestCm?: number | null
    waistCm?: number | null
    hipsCm?: number | null
    shoulderWidthCm?: number | null
    sleeveLengthCm?: number | null
    neckCm?: number | null
    inseamCm?: number | null
    thighCm?: number | null
  }
  highlights?: {
    weight?: string | null
  }
  comparison?: {
    weightKg?: {
      then: number | null
      now: number | null
      delta: number | null
    }
  }
}

const toast = useToast()
const queryCache = useQueryCache()

const form = reactive({
  brand: '',
  category: '',
  productType: '',
  sizeLabel: '',
  fitFeedback: ''
})

const selectedComparison = ref<ComparisonResult | null>(null)
const selectedPurchase = ref<Purchase | null>(null)
const historyFilter = ref('')

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
  mutation: () => $fetch('/api/purchases', {
    method: 'POST',
    body: {
      brand: form.brand,
      category: form.category,
      productType: form.productType,
      sizeLabel: form.sizeLabel,
      fitFeedback: form.fitFeedback || undefined
    }
  }),
  async onSuccess() {
    await queryCache.invalidateQueries(purchasesQuery)
    form.brand = ''
    form.category = ''
    form.productType = ''
    form.sizeLabel = ''
    form.fitFeedback = ''
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

const { mutate: comparePurchase, isLoading: comparing } = useMutation({
  mutation: (purchase: Purchase) => $fetch<ComparisonResult>(`/api/purchases/${purchase.id}/compare`),
  onSuccess(data, purchase) {
    selectedComparison.value = data
    selectedPurchase.value = purchase
  },
  onError() {
    toast.add({ title: 'No se pudo generar la comparación.', color: 'error' })
  }
})

const purchaseList = computed(() => (purchases.value ?? []) as Purchase[])

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

const fmt = (value: number, unit: string) => `${value.toFixed(1)} ${unit}`

const diffRows = computed<RowDiff[]>(() => {
  const snapshot = selectedComparison.value?.snapshotAtPurchase
  const current = selectedComparison.value?.currentMeasurement

  if (!snapshot || !current) {
    return []
  }

  const specs = [
    { key: 'weightKg', label: 'Peso', unit: 'kg' },
    { key: 'heightCm', label: 'Altura', unit: 'cm' },
    { key: 'chestCm', label: 'Pecho', unit: 'cm' },
    { key: 'waistCm', label: 'Cintura', unit: 'cm' },
    { key: 'hipsCm', label: 'Cadera', unit: 'cm' },
    { key: 'shoulderWidthCm', label: 'Ancho de hombros', unit: 'cm' },
    { key: 'sleeveLengthCm', label: 'Largo de manga', unit: 'cm' },
    { key: 'neckCm', label: 'Cuello', unit: 'cm' },
    { key: 'inseamCm', label: 'Entrepierna', unit: 'cm' },
    { key: 'thighCm', label: 'Muslo', unit: 'cm' }
  ] as const

  return specs.flatMap((spec) => {
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
    <div>
      <h2 class="text-lg font-semibold">
        Compras
      </h2>
      <p class="text-sm text-muted">
        Guarda compras para comparar tus medidas de ese momento con las actuales.
      </p>
    </div>

    <form
      class="grid grid-cols-1 sm:grid-cols-2 gap-3"
      @submit.prevent="addPurchase()"
    >
      <UInput
        v-model="form.brand"
        placeholder="Marca (Nike, Zara...) *"
        required
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

      <div class="sm:col-span-2">
        <UButton
          type="submit"
          icon="i-lucide-shopping-cart"
          :loading="addingPurchase"
          :disabled="!form.brand || !form.category || !form.productType || !form.sizeLabel"
        >
          Guardar compra
        </UButton>
      </div>
    </form>

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
          class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div>
            <p class="font-medium">
              {{ purchase.brand }} · {{ purchase.productType }} · Talla {{ purchase.sizeLabel }}
            </p>
            <p class="text-sm text-muted">
              {{ purchase.category }} · {{ new Date(purchase.purchasedAt).toLocaleDateString() }}
            </p>
            <p
              v-if="purchase.notes || purchase.fitFeedback"
              class="text-sm text-muted"
            >
              {{ purchase.notes || purchase.fitFeedback }}
            </p>
          </div>

          <UButton
            variant="soft"
            icon="i-lucide-git-compare"
            :loading="comparing && selectedPurchase?.id === purchase.id"
            @click="comparePurchase(purchase)"
          >
            Comparar con mis medidas actuales
          </UButton>
        </li>
      </ul>
      <p
        v-if="!filteredPurchaseList.length"
        class="text-sm text-muted"
      >
        No hay compras que coincidan con el filtro.
      </p>
    </div>

    <UAlert
      v-if="selectedComparison?.highlights?.weight"
      color="primary"
      variant="subtle"
      icon="i-lucide-scale"
      :title="selectedComparison.highlights.weight"
    />

    <div
      v-if="selectedPurchase && selectedComparison"
      class="space-y-3"
    >
      <h3 class="font-medium">
        Comparativa de medidas · {{ selectedPurchase.brand }} {{ selectedPurchase.productType }} ({{ selectedPurchase.sizeLabel }})
      </h3>

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
    </div>
  </div>
</template>
