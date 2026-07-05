<template>
  <div class="bg-gray-50">
    <div class="max-w-4xl mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-8">
        <NuxtLink
          to="/admin/users"
          class="text-blue-600 hover:text-blue-900"
        >
          ← Volver a usuarios
        </NuxtLink>
        <h1 class="text-3xl font-bold text-gray-900">
          Editar usuario
        </h1>
      </div>

      <div
        v-if="loading"
        class="text-center text-gray-500"
      >
        Cargando usuario...
      </div>
      <div
        v-else-if="user"
        class="space-y-6"
      >
        <!-- User Info Card -->
        <div class="bg-white p-6 rounded-lg shadow">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Información del usuario
          </h2>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm text-gray-600">ID de usuario</label>
              <p class="text-gray-900 font-mono">
                {{ user.id }}
              </p>
            </div>
            <div>
              <label class="text-sm text-gray-600">Proveedor de acceso</label>
              <p class="text-gray-900 capitalize">
                {{ user.loginProvider }}
              </p>
            </div>
            <div>
              <label class="text-sm text-gray-600">Alta</label>
              <p class="text-gray-900">
                {{ new Date(user.createdAt).toLocaleDateString() }}
              </p>
            </div>
            <div>
              <label class="text-sm text-gray-600">Última actualización</label>
              <p class="text-gray-900">
                {{ new Date(user.updatedAt).toLocaleDateString() }}
              </p>
            </div>
          </div>
        </div>

        <!-- Tier & Role Card -->
        <div class="bg-white p-6 rounded-lg shadow">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Plan y rol
          </h2>
          <div class="grid grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Plan</label>
              <select
                v-model="editedTier"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="free">
                  Gratis
                </option>
                <option value="premium">
                  Premium
                </option>
                <option value="enterprise">
                  Empresarial
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Rol</label>
              <select
                v-model="editedRole"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="user">
                  Usuario
                </option>
                <option value="admin">
                  Administrador
                </option>
              </select>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap gap-3">
            <button
              :disabled="saving || !hasPendingChanges"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              @click="previewChanges"
            >
              Previsualizar cambios
            </button>
            <button
              :disabled="saving || !hasPendingChanges || !isPreviewVisible"
              class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              @click="confirmAndSaveChanges"
            >
              {{ saving ? 'Guardando...' : 'Confirmar y guardar' }}
            </button>
            <button
              :disabled="saving || !hasPendingChanges"
              class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              @click="discardChanges"
            >
              Descartar cambios
            </button>
          </div>

          <div
            v-if="isPreviewVisible && pendingChanges.length"
            class="mt-4 p-4 rounded-lg border border-amber-200 bg-amber-50"
          >
            <h3 class="text-sm font-semibold text-amber-900 mb-2">
              Vista previa
            </h3>
            <ul class="space-y-2 text-sm text-amber-900">
              <li
                v-for="change in pendingChanges"
                :key="change.field"
              >
                <span class="font-medium">{{ change.label }}:</span>
                <span class="line-through text-amber-700">{{ change.before }}</span>
                <span class="mx-2">→</span>
                <span class="font-semibold">{{ change.after }}</span>
              </li>
            </ul>
            <p class="text-xs text-amber-800 mt-3">
              Revisa los cambios y pulsa <strong>Confirmar y guardar</strong> para enviarlos a la base de datos.
            </p>
          </div>

          <p
            v-if="saveMessage"
            :class="[
              'text-sm mt-2',
              saveMessageType === 'success' ? 'text-green-600' : 'text-red-600'
            ]"
          >
            {{ saveMessage }}
          </p>
        </div>

        <!-- Purchase Info Card -->
        <div class="bg-white p-6 rounded-lg shadow">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Información de compras
          </h2>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm text-gray-600">Compras totales</label>
              <p class="text-2xl font-bold text-gray-900">
                {{ purchaseCount }}
              </p>
            </div>
            <div>
              <label class="text-sm text-gray-600">Límite del plan</label>
              <p class="text-2xl font-bold text-gray-900">
                {{ tierLimit === Infinity ? '∞' : tierLimit }}
              </p>
            </div>
          </div>
          <div
            v-if="tierLimit !== Infinity"
            class="mt-4"
          >
            <div class="flex justify-between text-sm mb-2">
              <span class="text-gray-600">Uso</span>
              <span class="text-gray-900">{{ percentageUsed }}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                :style="{ width: percentageUsed + '%' }"
                :class="[
                  'h-2 rounded-full',
                  percentageUsed > 90 && 'bg-red-500',
                  percentageUsed > 70 && percentageUsed <= 90 && 'bg-yellow-500',
                  percentageUsed <= 70 && 'bg-green-500'
                ]"
              />
            </div>
          </div>
        </div>

        <!-- Subscription Info Card -->
        <div
          v-if="user.stripeSubscriptionId"
          class="bg-white p-6 rounded-lg shadow"
        >
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Suscripción
          </h2>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm text-gray-600">ID de suscripción</label>
              <p class="text-sm font-mono text-gray-900">
                {{ user.stripeSubscriptionId }}
              </p>
            </div>
            <div>
              <label class="text-sm text-gray-600">Estado</label>
              <p
                :class="[
                  'text-sm font-medium',
                  user.subscriptionStatus === 'active' && 'text-green-600',
                  user.subscriptionStatus === 'cancelled' && 'text-gray-600',
                  user.subscriptionStatus === 'past_due' && 'text-red-600'
                ]"
              >
                {{ user.subscriptionStatus }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'admin'
})

function getPurchaseLimit(tier: 'free' | 'premium' | 'enterprise'): number {
  const limits: Record<'free' | 'premium' | 'enterprise', number> = {
    free: 200,
    premium: 5000,
    enterprise: Infinity
  }
  return limits[tier]
}

const route = useRoute()
const userId = route.params.id as string
const userDataKey = `admin-user-${userId}`

interface AdminUserDetail {
  id: string
  tier: 'free' | 'premium' | 'enterprise'
  role: 'user' | 'admin'
  loginProvider: 'github' | 'google'
  createdAt: string
  updatedAt: string
  purchaseCount: number
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  subscriptionStatus?: 'active' | 'cancelled' | 'past_due' | null
  deletedAt?: string | null
}

const { data: userData, pending: loading, refresh: refreshUser } = await useAsyncData<AdminUserDetail | null>(
  userDataKey,
  () => $fetch(`/api/admin/users/${userId}`),
  {
    default: () => null
  }
)

const user = computed(() => userData.value)
const saving = ref(false)
const saveMessage = ref('')
const saveMessageType = ref<'success' | 'error'>('success')
const editedTier = ref<'free' | 'premium' | 'enterprise' | ''>('')
const editedRole = ref<'user' | 'admin' | ''>('')
const isPreviewVisible = ref(false)

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
  return getPurchaseLimit(editedTier.value as 'free' | 'premium' | 'enterprise')
})

const percentageUsed = computed(() => {
  if (tierLimit.value === Infinity) return 0
  return Math.round((purchaseCount.value / tierLimit.value) * 100)
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
    await $fetch(`/api/admin/users/${userId}`, {
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
</script>
