<template>
  <div class="ring ring-default">
    <div class="max-w-4xl mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-8">
        <UButton
          to="/admin/users"
          variant="link"
          color="primary"
        >
          ← Volver a usuarios
        </UButton>
        <h1 class="text-3xl font-bold ">
          Editar usuario
        </h1>
      </div>

      <div
        v-if="loading"
        class="text-center "
      >
        Cargando usuario...
      </div>
      <UAlert
        v-else-if="userErrorMessage"
        color="error"
        variant="soft"
        :title="userErrorMessage"
      />
      <div
        v-else-if="user"
        class="space-y-6"
      >
        <!-- User Info Card -->
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              Información del usuario
            </h2>
          </template>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-xs text-muted">
                ID de usuario
              </p>
              <p class="font-mono text-sm">
                {{ user.id }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                Proveedor de acceso
              </p>
              <p class="capitalize text-sm">
                {{ user.loginProvider }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                Alta
              </p>
              <p class="text-sm">
                {{ new Date(user.createdAt).toLocaleDateString() }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                Última actualización
              </p>
              <p class="text-sm">
                {{ new Date(user.updatedAt).toLocaleDateString() }}
              </p>
            </div>
          </div>
        </UCard>

        <!-- Tier & Role Card -->
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              Plan y rol
            </h2>
          </template>

          <div class="grid grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium text-muted mb-2">Plan</label>
              <USelect
                v-model="editedTier"
                :items="tierOptions"
                value-key="value"
                color="primary"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-muted mb-2">Rol</label>
              <USelect
                v-model="editedRole"
                :items="roleOptions"
                value-key="value"
                color="primary"
                class="w-full"
              />
            </div>
          </div>

          <div class="mt-4 flex flex-wrap gap-3">
            <UButton
              variant="solid"
              color="primary"
              :disabled="saving || !hasPendingChanges"
              class="px-4 py-2"
              @click="previewChanges"
            >
              Previsualizar cambios
            </UButton>
            <UButton
              variant="solid"
              color="secondary"
              :disabled="saving || !hasPendingChanges || !isPreviewVisible"
              class="px-4 py-2"
              @click="confirmAndSaveChanges"
            >
              {{ saving ? 'Guardando...' : 'Confirmar y guardar' }}
            </UButton>
            <UButton
              variant="solid"
              :disabled="saving || !hasPendingChanges"
              color="error"
              class="px-4 py-2"
              @click="discardChanges"
            >
              Descartar cambios
            </UButton>
          </div>

          <div
            v-if="isPreviewVisible && pendingChanges.length"
            class="mt-4 p-4 rounded-lg ring ring-default bg-elevated"
          >
            <UBadge
              color="warning"
              variant="soft"
              class="mb-2"
            >
              Vista previa
            </UBadge>
            <ul class="space-y-2 text-sm">
              <li
                v-for="change in pendingChanges"
                :key="change.field"
              >
                <span class="font-medium">{{ change.label }}:</span>
                <span class="line-through">{{ change.before }}</span>
                <span class="mx-2">→</span>
                <span class="font-semibold">{{ change.after }}</span>
              </li>
            </ul>
            <p class="text-xs text-muted mt-3">
              Revisa los cambios y pulsa <strong>Confirmar y guardar</strong> para enviarlos a la base de datos.
            </p>
          </div>

          <UAlert
            v-if="saveMessage"
            class="mt-3"
            :color="saveMessageType === 'success' ? 'success' : 'error'"
            variant="soft"
            :title="saveMessage"
          />
        </UCard>

        <!-- Purchase Info Card -->
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              Información de compras
            </h2>
          </template>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm text-muted">Compras totales</label>
              <p class="text-2xl font-bold ">
                {{ purchaseCount }}
              </p>
            </div>
            <div>
              <label class="text-sm text-muted">Límite del plan</label>
              <p class="text-2xl font-bold ">
                {{ tierLimit === Infinity ? '∞' : tierLimit }}
              </p>
            </div>
          </div>
          <div
            v-if="tierLimit !== Infinity"
            class="mt-4"
          >
            <div class="flex justify-between text-sm mb-2">
              <span class="text-muted">Uso</span>
              <UBadge
                :color="usageColor"
                variant="soft"
                size="sm"
              >
                {{ percentageUsed }}%
              </UBadge>
            </div>
            <UProgress
              :model-value="percentageUsed"
              :color="usageColor"
            />
          </div>
        </UCard>

        <!-- Bulk Purchases Card -->
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              Generar compras de prueba
            </h2>
          </template>

          <div class="space-y-4">
            <p class="text-sm text-muted">
              Crea compras ficticias para probar el comportamiento de paginación, límites de tier y rendimiento.
            </p>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-muted mb-2">
                  Número de compras
                </label>
                <UInput
                  v-model.number="bulkPurchasesForm.count"
                  type="number"
                  min="1"
                  max="5000"
                  placeholder="100"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-muted mb-2">
                  Fecha de inicio (opcional)
                </label>
                <UInput
                  v-model="bulkPurchasesForm.startDate"
                  type="date"
                />
                <p class="text-xs text-muted mt-1">
                  Fecha más antigua. Por defecto: 30 días atrás.
                </p>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-muted mb-2">
                Marcas personalizadas (opcional)
              </label>
              <UTextarea
                v-model="bulkPurchasesForm.brandsInput"
                placeholder="Nike&#10;Adidas&#10;Puma"
                :rows="3"
                class="font-mono text-sm"
              />
              <p class="text-xs text-muted mt-1">
                Ingresa una marca por línea. Déjalo vacío para usar marcas predeterminadas.
              </p>
            </div>

            <UAlert
              color="info"
              variant="soft"
              title="Cómo funcionan las fechas"
              description="Las compras se crean una por día, empezando desde la fecha indicada (o 30 días atrás). Las fechas avanzan hacia adelante en el tiempo."
              class="mb-4"
            />

            <UAlert
              v-if="bulkPurchasesMessage"
              :color="bulkPurchasesMessageType === 'success' ? 'success' : 'error'"
              variant="soft"
              :title="bulkPurchasesMessage"
            />

            <div class="flex gap-3">
              <UButton
                :loading="generatingBulkPurchases"
                :disabled="!bulkPurchasesForm.count || generatingBulkPurchases"
                @click="generateBulkPurchases"
              >
                Generar {{ bulkPurchasesForm.count || 0 }} compras
              </UButton>
              <UButton
                variant="outline"
                color="error"
                :disabled="generatingBulkPurchases || deletingBulkPurchases"
                :loading="deletingBulkPurchases"
                @click="deleteBulkPurchases"
              >
                Borrar compras de prueba
              </UButton>
              <UButton
                variant="outline"
                color="neutral"
                :disabled="generatingBulkPurchases"
                @click="resetBulkForm"
              >
                Limpiar
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Subscription Info Card -->
        <UCard v-if="user.stripeSubscriptionId">
          <template #header>
            <h2 class="text-lg font-semibold">
              Suscripción
            </h2>
          </template>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm text-muted">ID de suscripción</label>
              <p class="text-sm font-mono ">
                {{ user.stripeSubscriptionId }}
              </p>
            </div>
            <div>
              <label class="text-sm text-muted">Estado</label>
              <UBadge
                class="capitalize"
                :color="subscriptionStatusColor"
                variant="soft"
              >
                {{ user.subscriptionStatus }}
              </UBadge>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'admin'
})

const route = useRoute()
const userId = route.params.id as string
const requestFetch = useRequestFetch()

interface AdminUserDetail {
  id: string
  tier: 'free' | 'premium' | 'enterprise'
  role: 'user' | 'admin'
  loginProvider: 'github' | 'google' | 'instagram' | 'apple' | 'telegram'
  createdAt: string
  updatedAt: string
  purchaseCount: number
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  subscriptionStatus?: 'active' | 'cancelled' | 'past_due' | null
  deletedAt?: string | null
}

interface TierInfo {
  tier: 'free' | 'premium' | 'enterprise'
  label: string
  price: number
  limit: number
}

const { data: tiersData } = await useAsyncData<TierInfo[]>(
  'account-tiers',
  async () => {
    const response = await $fetch<{ tiers: TierInfo[] }>('/api/account/tiers')
    return response.tiers
  },
  { default: () => [] as TierInfo[] }
)

const userData = ref<AdminUserDetail | null>(null)
const loading = ref(true)
const userErrorMessage = ref('')

async function handleAuthError(error: unknown): Promise<boolean> {
  const status = (error as { status?: number, statusCode?: number })?.status
    ?? (error as { status?: number, statusCode?: number })?.statusCode
  if (status === 401 || status === 403) {
    const { fetch, loggedIn } = useUserSession()
    try {
      await fetch()
    }
    catch {
      // fetch itself failed — session is gone
    }
    if (!loggedIn.value) {
      await navigateTo('/')
      return false
    }
    return true
  }
  return false
}

async function refreshUser() {
  loading.value = true
  userErrorMessage.value = ''

  try {
    userData.value = await $fetch<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(userId)}`)
  }
  catch (error) {
    const retried = await handleAuthError(error)
    if (retried) {
      try {
        userData.value = await $fetch<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(userId)}`)
      }
      catch (retryError) {
        userData.value = null
        userErrorMessage.value = retryError instanceof Error ? retryError.message : 'No se pudo cargar el usuario.'
      }
    }
    else {
      userData.value = null
      userErrorMessage.value = error instanceof Error ? error.message : 'No se pudo cargar el usuario.'
    }
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  void refreshUser()
})

const user = computed(() => userData.value)
const saving = ref(false)
const saveMessage = ref('')
const saveMessageType = ref<'success' | 'error'>('success')
const editedTier = ref<'free' | 'premium' | 'enterprise' | ''>('')
const editedRole = ref<'user' | 'admin' | ''>('')
const isPreviewVisible = ref(false)

const bulkPurchasesForm = reactive({
  count: 100,
  startDate: '',
  brandsInput: ''
})

const generatingBulkPurchases = ref(false)
const bulkPurchasesMessage = ref('')
const bulkPurchasesMessageType = ref<'success' | 'error'>('success')
const deletingBulkPurchases = ref(false)

const tierOptions = [
  { label: 'Gratis', value: 'free' },
  { label: 'Premium', value: 'premium' },
  { label: 'Empresarial', value: 'enterprise' }
]

const roleOptions = [
  { label: 'Usuario', value: 'user' },
  { label: 'Administrador', value: 'admin' }
]

watch(userData, (nextUser) => {
  if (!nextUser) {
    return
  }

  editedTier.value = nextUser.tier
  editedRole.value = nextUser.role
  isPreviewVisible.value = false
}, { immediate: true })

const purchaseCount = computed(() => user.value?.purchaseCount ?? 0)

const tierLimit = computed(() => {
  const tier = tiersData.value?.find(t => t.tier === editedTier.value)
  return tier?.limit ?? 0
})

const percentageUsed = computed(() => {
  if (tierLimit.value === Infinity) return 0
  return Math.round((purchaseCount.value / tierLimit.value) * 100)
})

const usageColor = computed<'success' | 'warning' | 'error'>(() => {
  if (percentageUsed.value > 90) {
    return 'error'
  }

  if (percentageUsed.value > 70) {
    return 'warning'
  }

  return 'success'
})

const subscriptionStatusColor = computed<'success' | 'neutral' | 'error'>(() => {
  if (user.value?.subscriptionStatus === 'active') {
    return 'success'
  }

  if (user.value?.subscriptionStatus === 'past_due') {
    return 'error'
  }

  return 'neutral'
})

const hasPendingChanges = computed(() => {
  if (!user.value) {
    return false
  }

  return editedTier.value !== user.value.tier || editedRole.value !== user.value.role
})

type PendingChange = {
  field: 'tier' | 'role'
  label: string
  before: string
  after: string
}

const pendingChanges = computed<PendingChange[]>(() => {
  if (!user.value) {
    return []
  }

  const changes: PendingChange[] = []

  if (editedTier.value && editedTier.value !== user.value.tier) {
    changes.push({
      field: 'tier',
      label: 'Plan',
      before: formatTier(user.value.tier),
      after: formatTier(editedTier.value)
    })
  }

  if (editedRole.value && editedRole.value !== user.value.role) {
    changes.push({
      field: 'role',
      label: 'Rol',
      before: formatRole(user.value.role),
      after: formatRole(editedRole.value)
    })
  }

  return changes
})

watch([editedTier, editedRole], () => {
  if (saveMessage.value) {
    saveMessage.value = ''
  }
  isPreviewVisible.value = false
})

async function fetchUser() {
  await refreshUser()
}

function previewChanges() {
  if (!hasPendingChanges.value) {
    return
  }

  isPreviewVisible.value = true
}

function discardChanges() {
  if (!user.value) {
    return
  }

  editedTier.value = user.value.tier
  editedRole.value = user.value.role
  isPreviewVisible.value = false
  saveMessage.value = ''
}

async function confirmAndSaveChanges() {
  if (!user.value || !hasPendingChanges.value || !isPreviewVisible.value) {
    return
  }

  const confirmed = confirm('¿Confirmas que deseas guardar estos cambios en la base de datos?')
  if (!confirmed) {
    return
  }

  saving.value = true
  try {
    await requestFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: {
        tier: editedTier.value,
        role: editedRole.value
      }
    })
    saveMessage.value = '¡Cambios guardados con éxito!'
    saveMessageType.value = 'success'
    isPreviewVisible.value = false
    await fetchUser()
    await refreshNuxtData('admin-users-list')
    setTimeout(() => {
      saveMessage.value = ''
    }, 3000)
  }
  catch (error) {
    await handleAuthError(error)
    console.error('Error al guardar cambios:', error)
    saveMessage.value = 'Error al guardar cambios'
    saveMessageType.value = 'error'
  }
  finally {
    saving.value = false
  }
}

function formatTier(tier: 'free' | 'premium' | 'enterprise') {
  const labels: Record<'free' | 'premium' | 'enterprise', string> = {
    free: 'Gratis',
    premium: 'Premium',
    enterprise: 'Empresarial'
  }
  return labels[tier]
}

function formatRole(role: 'user' | 'admin') {
  const labels: Record<'user' | 'admin', string> = {
    user: 'Usuario',
    admin: 'Administrador'
  }
  return labels[role]
}

function resetBulkForm() {
  bulkPurchasesForm.count = 100
  bulkPurchasesForm.startDate = ''
  bulkPurchasesForm.brandsInput = ''
  bulkPurchasesMessage.value = ''
}

async function generateBulkPurchases() {
  if (!bulkPurchasesForm.count || bulkPurchasesForm.count < 1 || bulkPurchasesForm.count > 5000) {
    bulkPurchasesMessage.value = 'Por favor, ingresa un número válido de compras (1-5000)'
    bulkPurchasesMessageType.value = 'error'
    return
  }

  generatingBulkPurchases.value = true
  bulkPurchasesMessage.value = ''

  try {
    const body: { count: number, startDate?: string, brands?: string[] } = {
      count: bulkPurchasesForm.count
    }

    if (bulkPurchasesForm.startDate) {
      body.startDate = new Date(bulkPurchasesForm.startDate).toISOString()
    }

    if (bulkPurchasesForm.brandsInput.trim()) {
      body.brands = bulkPurchasesForm.brandsInput
        .split('\n')
        .map(b => b.trim())
        .filter(b => b.length > 0)
    }

    const result = await requestFetch<{ created: number }>(
      `/api/admin/users/${encodeURIComponent(userId)}/bulk-purchases`,
      {
        method: 'POST',
        body
      }
    )

    bulkPurchasesMessage.value = `✓ Se crearon ${result.created} compras de prueba exitosamente`
    bulkPurchasesMessageType.value = 'success'
    resetBulkForm()
    await fetchUser()
    setTimeout(() => {
      bulkPurchasesMessage.value = ''
    }, 5000)
  }
  catch (error) {
    await handleAuthError(error)
    console.error('Error al generar compras:', error)
    bulkPurchasesMessage.value = error instanceof Error ? error.message : 'Error al generar compras de prueba'
    bulkPurchasesMessageType.value = 'error'
  }
  finally {
    generatingBulkPurchases.value = false
  }
}

async function deleteBulkPurchases() {
  const confirmed = confirm('¿Seguro que deseas eliminar todas las compras de prueba de este usuario? Esta acción no se puede deshacer.')
  if (!confirmed) {
    return
  }

  deletingBulkPurchases.value = true
  bulkPurchasesMessage.value = ''

  try {
    const result = await requestFetch<{ deleted: number, message: string }>(
      `/api/admin/users/${encodeURIComponent(userId)}/bulk-purchases/delete`,
      {
        method: 'POST'
      }
    )

    bulkPurchasesMessage.value = `✓ ${result.message}`
    bulkPurchasesMessageType.value = 'success'
    await fetchUser()
    setTimeout(() => {
      bulkPurchasesMessage.value = ''
    }, 5000)
  }
  catch (error) {
    await handleAuthError(error)
    console.error('Error al eliminar compras:', error)
    bulkPurchasesMessage.value = error instanceof Error ? error.message : 'Error al eliminar compras de prueba'
    bulkPurchasesMessageType.value = 'error'
  }
  finally {
    deletingBulkPurchases.value = false
  }
}
</script>
