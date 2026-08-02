<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const route = useRoute()

await navigateTo(
  {
    path: '/purchases',
    query: route.query
  },
  {
    redirectCode: 301,
    replace: true
  }
)
</script>

<template>
  <p class="sr-only">
    Redirigiendo a compras…
  </p>
</template>
