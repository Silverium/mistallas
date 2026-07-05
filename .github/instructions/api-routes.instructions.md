---
description: "File instructions for server API route files (server/api/**/*.ts). Use when: creating or modifying API endpoints, adding validation, handling auth, or working with database queries."
applyTo: "server/api/**/*.ts"
---

# API Route Development Guide

Every file in `server/api/` defines a Nitro event handler. The filename determines the HTTP method and path.

## File Naming Convention

| File | Route | Method |
|------|-------|--------|
| `index.ts` | `/api/resource` | N/A (requires method suffix) |
| `index.get.ts` | `GET /api/resource` | GET |
| `index.post.ts` | `POST /api/resource` | POST |
| `[id].get.ts` | `GET /api/resource/:id` | GET |
| `[id].patch.ts` | `PATCH /api/resource/:id` | PATCH |
| `[id].delete.ts` | `DELETE /api/resource/:id` | DELETE |

## Template

```typescript
import { useValidatedBody, z } from 'h3-zod'
import { eq } from 'drizzle-orm'
import { useDB, tables } from '../../utils/db'

export default eventHandler(async (event) => {
  // 1. VALIDATE INPUT
  const input = await useValidatedBody(event, {
    fieldName: z.string().min(1).max(100),
    count: z.coerce.number().int().positive().optional()
  })

  // 2. AUTHENTICATE (if needed)
  const { user } = await requireUserSession(event)

  // 3. AUTHORIZE (if needed)
  if (user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: 'Admin access required'
    })
  }

  // 4. QUERY DATABASE
  const record = await useDB()
    .select()
    .from(tables.yourTable)
    .where(eq(tables.yourTable.id, input.id))
    .get()

  if (!record) {
    throw createError({
      statusCode: 404,
      message: 'Record not found'
    })
  }

  // 5. RETURN RESPONSE
  return { success: true, data: record }
})
```

## Key Patterns

### Input Validation with h3-zod

Always validate input at the start. Use `useValidatedBody` for POST/PATCH, `useValidatedQuery` for GET:

```typescript
// POST/PATCH body
const input = await useValidatedBody(event, {
  email: z.string().email(),
  age: z.coerce.number().int().min(0).max(150)
})

// GET query params
const query = await useValidatedQuery(event, {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
})
```

### Authentication

```typescript
const { user } = await requireUserSession(event)
// user.id, user.tier, user.role are now available
```

### Authorization (Admin-only)

```typescript
if (user.role !== 'admin') {
  throw createError({ statusCode: 403, message: 'Admin only' })
}
```

### Tier-based Authorization

```typescript
import { getPurchaseLimit, getRemainingPurchases, isAtLimit } from '../../utils/tiers'

const limit = getPurchaseLimit(user.tier)
const count = await getUserPurchaseCount(user.id)
const remaining = getRemainingPurchases(user.tier, count)

if (isAtLimit(user.tier, count)) {
  throw createError({
    statusCode: 403,
    message: 'Purchase limit reached. Upgrade your tier.',
    data: { upgradeUrl: '/account' }
  })
}
```

### Database Insert

```typescript
const newRecord = await useDB()
  .insert(tables.purchaseEvents)
  .values({
    userId: user.id,
    brand: input.brand,
    purchasedAt: new Date()
  })
  .returning()
  .get()

return newRecord
```

### Database Update

```typescript
const updated = await useDB()
  .update(tables.todos)
  .set({
    title: input.title,
    completed: input.completed ? 1 : 0,
    updatedAt: new Date()
  })
  .where(eq(tables.todos.id, input.id))
  .returning()
  .get()

return updated
```

### Database Delete (or soft delete)

Hard delete:
```typescript
await useDB()
  .delete(tables.todos)
  .where(eq(tables.todos.id, input.id))

return { success: true }
```

Soft delete (set `deletedAt`):
```typescript
const deleted = await useDB()
  .update(tables.users)
  .set({ deletedAt: new Date() })
  .where(eq(tables.users.id, userId))
  .returning()
  .get()

return deleted
```

### Error Handling

Always use `createError` for user-facing errors:

```typescript
throw createError({
  statusCode: 400,
  message: 'Invalid input',
  data: { field: 'email', reason: 'already in use' }
})

throw createError({
  statusCode: 404,
  message: 'User not found'
})

throw createError({
  statusCode: 403,
  message: 'Insufficient permissions'
})

throw createError({
  statusCode: 500,
  message: 'Internal server error'
})
```

## Common Patterns

### Enforce User Ownership (cannot access other user's data)

```typescript
const record = await useDB()
  .select()
  .from(tables.purchaseEvents)
  .where(eq(tables.purchaseEvents.id, input.id))
  .get()

if (!record || record.userId !== user.id) {
  throw createError({
    statusCode: 403,
    message: 'You do not have access to this record'
  })
}
```

### Fetch Related Data

```typescript
const purchase = await useDB()
  .select()
  .from(tables.purchaseEvents)
  .where(eq(tables.purchaseEvents.id, purchaseId))
  .get()

const measurement = await useDB()
  .select()
  .from(tables.userMeasurements)
  .where(eq(tables.userMeasurements.id, purchase.measurementId))
  .get()

return { purchase, measurement }
```

### Paginated List

```typescript
const { page = 1, limit = 10 } = await useValidatedQuery(event, {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
})

const offset = (page - 1) * limit

const [records, totalResult] = await Promise.all([
  useDB()
    .select()
    .from(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.userId, user.id))
    .limit(limit)
    .offset(offset)
    .all(),
  useDB()
    .select({ count: sql<number>`count(*)` })
    .from(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.userId, user.id))
    .get()
])

const total = totalResult?.count || 0

return {
  records,
  page,
  limit,
  total,
  pages: Math.ceil(total / limit)
}
```

## Testing

Co-locate test files next to the endpoint:

```typescript
// server/api/purchases/index.post.test.ts
import { describe, it, expect } from 'vitest'

describe('POST /api/purchases', () => {
  it('should create a purchase', () => {
    // Test logic here
  })
})
```

Run with `pnpm test`.
