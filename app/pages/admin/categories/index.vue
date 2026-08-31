<template>
  <div class="bg-default">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-3xl font-bold">
            Categorías
          </h1>
          <p class="text-muted mt-2">
            Revisa y verifica las categorías personalizadas introducidas por los usuarios
          </p>
        </div>
        <UButton
          to="/admin/users"
          variant="outline"
          color="neutral"
        >
          Volver a usuarios
        </UButton>
      </div>

      <div class="bg-default rounded-lg shadow overflow-hidden ring ring-default">
        <div
          v-if="loading"
          class="p-8 text-center text-muted"
        >
          Cargando categorías...
        </div>
        <div
          v-else-if="categories.length === 0"
          class="p-8 text-center text-muted"
        >
          No hay categorías todavía
        </div>
        <div
          v-else
          class="divide-y divide-gray-200"
        >
          <article
            v-for="category in categories"
            :key="category.id"
            class="p-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div class="flex items-center gap-3">
              <span class="font-medium">{{ category.name }}</span>
              <UBadge
                :color="category.verified ? 'primary' : 'neutral'"
                variant="soft"
              >
                {{ category.verified ? 'Verificada' : 'Personalizada' }}
              </UBadge>
            </div>

            <div class="flex items-center gap-4 text-sm text-muted">
              <span>{{ category.usageCount }} {{ category.usageCount === 1 ? 'compra' : 'compras' }}</span>
              <span v-if="category.createdByUserId" class="truncate max-w-40">
                por <code class="text-xs bg-elevated px-2 py-1 rounded">{{ category.createdByUserId }}</code>
              </span>
            </div>

            <UButton
              v-if="!category.verified"
              variant="soft"
              color="primary"
              size="sm"
              :loading="verifyingId === category.id"
              @click="verifyCategory(category.id)"
            >
              Verificar
            </UButton>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'admin'
})

interface AdminCategory {
  id: number
  name: string
  verified: boolean
  createdByUserId: string | null
  usageCount: number
}

interface AdminCategoriesResponse {
  categories: AdminCategory[]
}

const requestFetch = useRequestFetch()
const verifyingId = ref<number | null>(null)

const { data, pending: loading, refresh } = await useAsyncData<AdminCategoriesResponse>(
  'admin-categories-list',
  () => requestFetch('/api/admin/categories'),
  {
    default: () => ({ categories: [] })
  }
)

const categories = computed(() => data.value?.categories ?? [])

async function verifyCategory(categoryId: number) {
  verifyingId.value = categoryId

  try {
    await requestFetch(`/api/admin/categories/${categoryId}`, {
      method: 'PATCH',
      body: { verified: true }
    })
    await refresh()
  }
  catch (error) {
    console.error('Error al verificar la categoría:', error)
  }
  finally {
    verifyingId.value = null
  }
}
</script>
