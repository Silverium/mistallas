<template>
  <div class="bg-gray-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">
            Usuarios
          </h1>
          <p class="text-gray-600 mt-2">
            Gestiona los planes y roles de los usuarios
          </p>
        </div>
        <NuxtLink
          to="/"
          class="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Volver al inicio
        </NuxtLink>
      </div>

      <!-- Filters -->
      <div class="bg-white p-4 rounded-lg shadow mb-6 flex gap-4">
        <div class="flex-1">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Buscar por ID de usuario..."
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
        </div>
        <select
          v-model="selectedTier"
          class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">
            Todos los planes
          </option>
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
        <button
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          @click="fetchUsers"
        >
          Buscar
        </button>
      </div>

      <!-- Users Table -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div
          v-if="loading"
          class="p-8 text-center text-gray-500"
        >
          Cargando usuarios...
        </div>
        <div
          v-else-if="users.length === 0"
          class="p-8 text-center text-gray-500"
        >
          No se encontraron usuarios
        </div>
        <div
          v-else
          class="divide-y divide-gray-200"
        >
          <!-- Mobile first: tarjetas -->
          <div class="md:hidden">
            <article
              v-for="user in users"
              :key="user.id"
              class="p-4 space-y-3"
            >
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                  ID de usuario
                </p>
                <code class="text-xs bg-gray-100 px-2 py-1 rounded break-all">{{ user.id }}</code>
              </div>

              <div class="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p class="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                    Plan
                  </p>
                  <span
                    :class="[
                      'inline-flex px-3 py-1 rounded-full text-xs font-medium',
                      user.tier === 'free' && 'bg-gray-100 text-gray-800',
                      user.tier === 'premium' && 'bg-blue-100 text-blue-800',
                      user.tier === 'enterprise' && 'bg-purple-100 text-purple-800'
                    ]"
                  >
                    {{ user.tier === 'free' ? 'Gratis' : user.tier === 'premium' ? 'Premium' : 'Empresarial' }}
                  </span>
                </div>
                <div>
                  <p class="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                    Rol
                  </p>
                  <span
                    :class="[
                      'inline-flex px-3 py-1 rounded-full text-xs font-medium',
                      user.role === 'user' && 'bg-gray-100 text-gray-800',
                      user.role === 'admin' && 'bg-red-100 text-red-800'
                    ]"
                  >
                    {{ user.role === 'user' ? 'Usuario' : 'Administrador' }}
                  </span>
                </div>
                <div>
                  <p class="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                    Compras
                  </p>
                  <p class="text-gray-900">
                    {{ user.purchaseCount }}
                  </p>
                </div>
                <div>
                  <p class="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                    Proveedor
                  </p>
                  <p class="text-gray-700 capitalize">
                    {{ user.loginProvider }}
                  </p>
                </div>
              </div>

              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                  Alta
                </p>
                <p class="text-sm text-gray-700">
                  {{ new Date(user.createdAt).toLocaleDateString() }}
                </p>
              </div>

              <div class="flex flex-wrap gap-3 pt-1">
                <NuxtLink
                  :to="`/admin/users/${user.id}`"
                  class="text-blue-600 hover:text-blue-900 text-sm font-medium"
                >
                  Editar
                </NuxtLink>
                <button
                  class="text-red-600 hover:text-red-900 text-sm font-medium"
                  @click="deleteUser(user.id)"
                >
                  Eliminar
                </button>
              </div>
            </article>
          </div>

          <!-- Desktop: tabla -->
          <div class="hidden md:block overflow-x-auto">
            <table class="min-w-full">
              <thead class="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    ID de usuario
                  </th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Plan
                  </th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Rol
                  </th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Compras
                  </th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Proveedor
                  </th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Alta
                  </th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr
                  v-for="user in users"
                  :key="`desktop-${user.id}`"
                  class="hover:bg-gray-50"
                >
                  <td class="px-6 py-4 text-sm text-gray-900">
                    <code class="text-xs bg-gray-100 px-2 py-1 rounded">{{ user.id }}</code>
                  </td>
                  <td class="px-6 py-4 text-sm">
                    <span
                      :class="[
                        'px-3 py-1 rounded-full text-xs font-medium',
                        user.tier === 'free' && 'bg-gray-100 text-gray-800',
                        user.tier === 'premium' && 'bg-blue-100 text-blue-800',
                        user.tier === 'enterprise' && 'bg-purple-100 text-purple-800'
                      ]"
                    >
                      {{ user.tier === 'free' ? 'Gratis' : user.tier === 'premium' ? 'Premium' : 'Empresarial' }}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-sm">
                    <span
                      :class="[
                        'px-3 py-1 rounded-full text-xs font-medium',
                        user.role === 'user' && 'bg-gray-100 text-gray-800',
                        user.role === 'admin' && 'bg-red-100 text-red-800'
                      ]"
                    >
                      {{ user.role === 'user' ? 'Usuario' : 'Administrador' }}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-900">
                    {{ user.purchaseCount }}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500">
                    {{ user.loginProvider }}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500">
                    {{ new Date(user.createdAt).toLocaleDateString() }}
                  </td>
                  <td class="px-6 py-4 text-sm">
                    <NuxtLink
                      :to="`/admin/users/${user.id}`"
                      class="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      Editar
                    </NuxtLink>
                    <button
                      class="text-red-600 hover:text-red-900"
                      @click="deleteUser(user.id)"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div
        v-if="pages > 1"
        class="flex justify-center gap-2 mt-6"
      >
        <button
          :disabled="currentPage === 1"
          class="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50"
          @click="currentPage--"
        >
          Anterior
        </button>
        <span class="px-4 py-2">Página {{ currentPage }} de {{ pages }}</span>
        <button
          :disabled="currentPage === pages"
          class="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50"
          @click="currentPage++"
        >
          Siguiente
        </button>
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
