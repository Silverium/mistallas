---
description: "File instructions for Nuxt page components (app/pages/**/*.vue). Use when: creating or modifying frontend pages, working with middleware, queries, state management, or UI components."
applyTo: "app/pages/**/*.vue"
---

# Nuxt Page Development Guide

Pages in `app/pages/` use file-based routing and are automatically rendered with SSR on Cloudflare.

## File-Based Routing

| File | Route |
|------|-------|
| `app/pages/index.vue` | `/` |
| `app/pages/account.vue` | `/account` |
| `app/pages/purchases.vue` | `/purchases` |
| `app/pages/admin/users/index.vue` | `/admin/users` |
| `app/pages/admin/users/[id].vue` | `/admin/users/:id` |

## Template

```vue
<script setup lang="ts">
import { definePageMeta } from '#app'

// 1. MIDDLEWARE (optional)
definePageMeta({
  middleware: ['auth'], // Require login
  // Or: middleware: ['admin'] for admin-only
})

// 2. DATA FETCHING (use Pinia Colada queries)
const { data: purchases, status, error } = useQuery({
  query: () => $fetch('/api/purchases'),
  transform: (data) => data.records
})

// 3. STATE (if needed)
const selectedId = ref<number | null>(null)

// 4. COMPUTED
const filteredPurchases = computed(() => {
  if (!selectedId.value) return purchases.value || []
  return (purchases.value || []).filter(p => p.id === selectedId.value)
})

// 5. METHODS
const handleDelete = async (id: number) => {
  await $fetch(`/api/purchases/${id}`, { method: 'DELETE' })
  // Query auto-updates via cache invalidation
}

// 6. WATCHERS (if needed)
watch(() => route.query.tier, (tier) => {
  // Filter purchases by tier when query param changes
})
</script>

<template>
  <div class="container mx-auto p-4">
    <!-- 1. LOADING STATE -->
    <div v-if="status === 'pending'" class="text-center py-8">
      <p>Loading...</p>
    </div>

    <!-- 2. ERROR STATE -->
    <div v-else-if="error" class="rounded-lg bg-red-50 p-4 text-red-600">
      {{ error.message }}
    </div>

    <!-- 3. EMPTY STATE -->
    <div v-else-if="!purchases || purchases.length === 0" class="text-center py-8 text-gray-500">
      <p>No purchases found</p>
    </div>

    <!-- 4. CONTENT -->
    <div v-else>
      <UTable :rows="filteredPurchases" />
    </div>
  </div>
</template>
```

## Authentication & Middleware

### Protect a Page (Login Required)

```typescript
definePageMeta({
  middleware: 'auth'
})
```

This will redirect unauthenticated users to the login page (defined in `app/middleware/auth.ts`).

### Admin-Only Page

```typescript
definePageMeta({
  middleware: 'admin'
})
```

Redirects non-admins to the home page (defined in `app/middleware/admin.ts`).

### Conditional Redirect

```typescript
const user = useAuthStore().user

if (user && user.tier === 'free') {
  navigateTo('/upgrade')
}
```

## Data Fetching with Pinia Colada

Define queries in `app/queries/<resource>.ts`:

```typescript
// app/queries/purchases.ts
import type { Purchase } from '~/types'

export const usePurchasesQuery = () => {
  return useQuery({
    query: () => $fetch('/api/purchases'),
    transform: (data) => data.records as Purchase[]
  })
}

export const usePurchaseQuery = (id: Ref<number>) => {
  return useQuery({
    query: () => $fetch(`/api/purchases/${id.value}`),
    enabled: computed(() => id.value > 0)
  })
}
```

Use in a page:

```typescript
const { data: purchases } = usePurchasesQuery()

// Auto-updates when data changes elsewhere
```

## Mutations

For POST/PATCH/DELETE operations:

```typescript
const { mutate: createPurchase, status } = useMutation({
  mutation: async (input: CreatePurchaseInput) => {
    return $fetch('/api/purchases', {
      method: 'POST',
      body: input
    })
  },
  onSuccess: () => {
    // Invalidate cache so queries refetch
    useQueryCache().invalidateByKey(['purchases'])
  }
})

// In template or method:
await createPurchase({ brand: 'Nike', category: 'Shoes' })
```

## State Management with Pinia

Use a store for shared UI state (modals, filters, selections):

```typescript
// app/stores/ui.ts
export const useUIStore = defineStore('ui', () => {
  const showModal = ref(false)
  const selectedPurchaseId = ref<number | null>(null)

  return { showModal, selectedPurchaseId }
})

// In a page:
const ui = useUIStore()

const openModal = (id: number) => {
  ui.selectedPurchaseId = id
  ui.showModal = true
}
```

## Nuxt UI Components

Always use `@nuxt/ui` components. Common ones:

```vue
<!-- Button -->
<UButton @click="handleClick">Action</UButton>
<UButton variant="ghost" size="sm">Small</UButton>

<!-- Table -->
<UTable
  :rows="data"
  :columns="[
    { key: 'id', label: 'ID' },
    { key: 'brand', label: 'Brand' }
  ]"
/>

<!-- Form Input -->
<UFormGroup label="Email" name="email">
  <UInput v-model="form.email" type="email" />
</UFormGroup>

<!-- Modal -->
<UModal v-model="isOpen" title="Confirm">
  <p>Are you sure?</p>
  <template #footer>
    <UButton @click="isOpen = false">Cancel</UButton>
    <UButton color="red" @click="handleConfirm">Delete</UButton>
  </template>
</UModal>

<!-- Card -->
<UCard title="Title">
  <p>Content here</p>
</UCard>

<!-- Badge -->
<UBadge color="green">Active</UBadge>
<UBadge color="red">Inactive</UBadge>

<!-- Icon -->
<UIcon name="lucide:check" />
```

See [Nuxt UI docs](https://ui.nuxt.com) for full component library.

## Composables

Create reusable logic in `app/composables/`:

```typescript
// app/composables/useTierInfo.ts
export const useTierInfo = () => {
  const user = useAuthStore().user

  const tierLabel = computed(() => {
    const labels: Record<string, string> = {
      free: 'Free (200 items)',
      premium: 'Premium (5,000 items)',
      enterprise: 'Enterprise (Unlimited)'
    }
    return labels[user?.tier || 'free']
  })

  return { tierLabel }
}

// In a page:
const { tierLabel } = useTierInfo()
```

## Common Patterns

### Show/Hide Based on Tier

```vue
<div v-if="user.tier !== 'free'" class="p-4 bg-blue-50">
  Premium feature: Advanced analytics
</div>
```

### Paginated List

```typescript
const page = ref(1)
const limit = ref(10)

const { data: results } = useQuery({
  query: () => $fetch('/api/purchases', {
    query: { page: page.value, limit: limit.value }
  })
})
```

### Loading State

```vue
<div v-if="status === 'pending'">Loading...</div>
<div v-else-if="error">{{ error.message }}</div>
<div v-else>{{ data }}</div>
```

### Error Toast

```typescript
const { showError } = useToast()

try {
  await createPurchase(input)
} catch (err) {
  showError({ title: 'Failed', description: err.message })
}
```

## Error Handling

Handle 403 errors (tier limits) gracefully:

```typescript
const { mutate: addPurchase } = useMutation({
  mutation: async (input) => {
    return $fetch('/api/purchases', { method: 'POST', body: input })
  },
  onError: (err: any) => {
    if (err.status === 403) {
      showError({
        title: 'Limit Reached',
        description: 'Upgrade your tier to continue',
        actions: [
          { label: 'Upgrade', click: () => navigateTo('/account') }
        ]
      })
    }
  }
})
```

## CSS & Styling

Use Tailwind utility classes throughout:

```vue
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <UCard v-for="item in items" :key="item.id" class="hover:shadow-lg">
    {{ item.name }}
  </UCard>
</div>
```

Scoped styles for complex layouts:

```vue
<style scoped>
.custom-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}
</style>
```

See `app/assets/main.css` for global styles.
