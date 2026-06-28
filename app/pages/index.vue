<script setup lang="ts">
import { useSyncedStringQueryParam } from '~/utils/query-param'

const { loggedIn } = useUserSession()
const purchasesFilter = useSyncedStringQueryParam('filter')

const openPurchasesWithFilter = () => {
  const filter = purchasesFilter.value.trim()

  return navigateTo({
    path: '/purchases',
    query: filter ? { filter } : undefined
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <form
      v-if="loggedIn"
      class="flex flex-col sm:flex-row gap-2"
      @submit.prevent="openPurchasesWithFilter"
    >
      <UInput
        v-model="purchasesFilter"
        icon="i-lucide-filter"
        class="flex-1"
        placeholder="Busca una compra por marca, categoría o talla..."
      />
      <UButton
        type="submit"
        icon="i-lucide-search"
      >
        Ir a compras
      </UButton>
    </form>

    <p class="font-medium">
      Hola: ¿Te acuerdas de la talla y modelo de pantalones que necesitas de esa marca que cambia el tallaje incluso cuando se elije otro color del pantalón?
    </p>
    <p>
      ¿O de la talla de zapatos que usas en esa tienda online extranjera que siempre talla diferente?
    </p>
    <p>
      Esta es una aplicación sencilla para gestionar tus tallas de ropa, calzado y accesorios.
      <template v-if="!loggedIn">
        Inicia sesión con tu cuenta de GitHub para comenzar a guardar y administrar tus tallas de manera segura.
      </template>
    </p>

    <USeparator />
    <p class="text-sm text-muted italic">
      No se almacena ninguna información personal de tu cuenta de GitHub en la base de datos.<br>
      Solo almacenamos los todos que creas vinculados con tu ID de GitHub.
    </p>
  </div>
</template>
