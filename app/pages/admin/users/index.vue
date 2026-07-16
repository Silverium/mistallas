<template>
  <div class="bg-default">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-3xl font-bold">
            Usuarios
          </h1>
          <p class="text-muted mt-2">
            Gestiona los planes y roles de los usuarios
          </p>
        </div>
        <UButton
          to="/"
          variant="outline"
          color="neutral"
        >
          Volver al inicio
        </UButton>
      </div>

      <!-- Filters -->
      <UCard class="mb-6">
        <div class="flex gap-4">
          <div class="flex-1">
            <UInput
              v-model="searchQuery"
              placeholder="Buscar por ID de usuario..."
              color="primary"
            />
          </div>
          <USelect
            v-model="selectedTier"
            :items="tierOptions"
            color="primary"
            value-key="value"
          />
          <UButton
            color="primary"
            @click="fetchUsers"
          >
            Buscar
          </UButton>
        </div>
      </UCard>

      <!-- Users Table -->
      <div class="bg-default rounded-lg shadow overflow-hidden ring ring-default">
        <div
          v-if="loading"
          class="p-8 text-center text-muted"
        >
          Cargando usuarios...
        </div>
        <div
          v-else-if="users.length === 0"
          class="p-8 text-center text-muted"
        >
          No se encontraron usuarios
        </div>
        <div
          v-else
          class="divide-y divide-gray-200"
        >
          <article
            v-for="user in users"
            :key="user.id"
            class="p-4 space-y-3"
          >
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted mb-1">
                ID de usuario
              </p>
              <code class="text-xs bg-elevated px-2 py-1 rounded break-all">{{ user.id }}</code>
            </div>

            <div class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted mb-1">
                  Plan
                </p>
                <UBadge
                  :color="getTierBadgeColor(user.tier)"
                  variant="soft"
                >
                  {{ user.tier === 'free' ? 'Gratis' : user.tier === 'premium' ? 'Premium' : 'Empresarial' }}
                </UBadge>
              </div>
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted mb-1">
                  Rol
                </p>
                <UBadge
                  :color="getRoleBadgeColor(user.role)"
                  variant="soft"
                >
                  {{ user.role === 'user' ? 'Usuario' : 'Administrador' }}
                </UBadge>
              </div>
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted mb-1">
                  Compras
                </p>
                <p>
                  {{ user.purchaseCount }}
                </p>
              </div>
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted mb-1">
                  Proveedor
                </p>
                <p class="capitalize">
                  {{ user.loginProvider }}
                </p>
              </div>
            </div>

            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted mb-1">
                Alta
              </p>
              <p class="text-sm">
                {{ new Date(user.createdAt).toLocaleDateString() }}
              </p>
            </div>

            <div class="flex flex-wrap gap-3 pt-1 justify-between">
              <UButton
                :to="`/admin/users/${user.id}`"
                variant="soft"
                color="primary"
                size="sm"
              >
                Editar
              </UButton>
              <UButton
                variant="soft"
                color="error"
                size="sm"
                @click="deleteUser(user.id)"
              >
                Eliminar
              </UButton>
            </div>
          </article>
        </div>
      </div>

      <!-- Pagination -->
      <div
        v-if="pages > 1"
        class="flex justify-center gap-2 mt-6"
      >
        <UButton
          :disabled="currentPage === 1"
          color="neutral"
          variant="outline"
          @click="previousPage"
        >
          Anterior
        </UButton>
        <span class="px-4 py-2 text-muted">Página {{ currentPage }} de {{ pages }}</span>
        <UButton
          :disabled="currentPage === pages"
          color="neutral"
          variant="outline"
          @click="nextPage"
        >
          Siguiente
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'admin'
})

interface AdminUser {
  id: string
  tier: 'free' | 'premium' | 'enterprise'
  role: 'user' | 'admin'
  loginProvider: 'github' | 'google'
  purchaseCount: number
  createdAt: string
  updatedAt: string
}

interface AdminUsersResponse {
  users: AdminUser[]
  total: number
  page: number
  limit: number
  pages: number
}

const currentPage = ref(1)
const searchQuery = ref('')
const selectedTier = ref<'all' | 'free' | 'premium' | 'enterprise'>('all')

const tierOptions = [
  { label: 'Todos los planes', value: 'all' },
  { label: 'Gratis', value: 'free' },
  { label: 'Premium', value: 'premium' },
  { label: 'Empresarial', value: 'enterprise' }
]

const usersQuery = computed(() => {
  const query = {
    page: currentPage.value,
    limit: 20,
    search: searchQuery.value
  } as {
    page: number
    limit: number
    search: string
    tier?: 'free' | 'premium' | 'enterprise'
  }

  if (selectedTier.value !== 'all') {
    query.tier = selectedTier.value
  }

  return query
})

const { data, pending: loading, refresh } = await useAsyncData<AdminUsersResponse>(
  'admin-users-list',
  () => $fetch('/api/admin/users', { query: usersQuery.value }),
  {
    watch: [usersQuery],
    default: () => ({
      users: [],
      total: 0,
      page: 1,
      limit: 20,
      pages: 1
    })
  }
)

const users = computed(() => data.value?.users ?? [])
const pages = computed(() => data.value?.pages ?? 1)

watch([searchQuery, selectedTier], () => {
  currentPage.value = 1
})

async function fetchUsers() {
  await refresh()
}

function previousPage() {
  currentPage.value = Math.max(1, currentPage.value - 1)
}

function nextPage() {
  currentPage.value = Math.min(pages.value, currentPage.value + 1)
}

function getTierBadgeColor(tier: AdminUser['tier']): 'neutral' | 'primary' | 'secondary' {
  if (tier === 'premium') {
    return 'primary'
  }

  if (tier === 'enterprise') {
    return 'secondary'
  }

  return 'neutral'
}

function getRoleBadgeColor(role: AdminUser['role']): 'neutral' | 'warning' {
  return role === 'admin' ? 'warning' : 'neutral'
}

async function deleteUser(userId: string) {
  if (!confirm('¿Seguro que quieres eliminar este usuario?')) {
    return
  }

  try {
    await $fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    await refresh()
    await refreshNuxtData(`admin-user-${userId}`)
  }
  catch (error) {
    console.error('Error al eliminar usuario:', error)
  }
}
</script>
