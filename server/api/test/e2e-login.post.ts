import { eq } from 'drizzle-orm'
import { db } from 'hub:db'
import { z, useValidatedBody } from 'h3-zod'
import * as schema from '../../database/schema'

const tables = schema

export default eventHandler(async (event) => {
  const input = await useValidatedBody(event, {
    userId: z.string().min(1).optional(),
    login: z.string().min(1).optional()
  })

  const userId = input.userId || 'telegram:e2e-playwright'
  const login = input.login || 'test-playwright'
  const now = new Date()

  const existingUser = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  const user = existingUser
    ? await db
        .update(tables.users)
        .set({
          loginProvider: 'telegram',
          updatedAt: now
        })
        .where(eq(tables.users.id, userId))
        .returning()
        .get()
    : await db
        .insert(tables.users)
        .values({
          id: userId,
          tier: 'free',
          role: 'user',
          loginProvider: 'telegram',
          createdAt: now,
          updatedAt: now
        })
        .returning()
        .get()

  const existingPurchase = await db
    .select({ id: tables.purchaseEvents.id })
    .from(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.userId, userId))
    .get()

  if (!existingPurchase) {
    await db
      .insert(tables.purchaseEvents)
      .values({
        userId,
        brand: 'SeedBrand',
        category: 'Ropa',
        productType: 'Camiseta',
        sizeLabel: 'M',
        purchasedAt: now
      })
  }

  await setUserSession(event, {
    user: {
      id: user.id,
      login,
      role: user.role,
      tier: user.tier,
      loginProvider: 'telegram'
    }
  })

  return {
    success: true,
    userId,
    login,
    redirectedTo: '/purchases'
  }
})