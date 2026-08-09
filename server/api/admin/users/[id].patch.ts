import { eq } from 'drizzle-orm'
import { useValidatedBody, z } from 'h3-zod'
import { requireAdminAccess } from '@root/server/utils/admin'
import { tables, useDB } from '@root/server/utils/db'

export default eventHandler(async (event) => {
  await requireAdminAccess(event)
  const db = useDB()

  const rawUserId = getRouterParam(event, 'id')
  const userId = rawUserId ? decodeURIComponent(rawUserId) : ''
  if (!userId) {
    throw createError({ statusCode: 400, message: 'Missing user ID' })
  }

  const input = await useValidatedBody(event, {
    tier: z.enum(['free', 'premium', 'enterprise']).optional(),
    role: z.enum(['user', 'admin']).optional()
  })

  if (!input.tier && !input.role) {
    throw createError({
      statusCode: 400,
      message: 'Must provide at least tier or role to update'
    })
  }

  // Update user
  const updatedUser = await db
    .update(tables.users)
    .set({
      ...(input.tier && { tier: input.tier as 'free' | 'premium' | 'enterprise' }),
      ...(input.role && { role: input.role as 'user' | 'admin' }),
      updatedAt: new Date()
    })
    .where(eq(tables.users.id, userId))
    .returning()
    .get()

  if (!updatedUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  return updatedUser
})
