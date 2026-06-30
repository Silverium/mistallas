import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { tables, useDB } from './db'

export async function requireAdminAccess(event: H3Event) {
  const { user } = await requireUserSession(event)
  const config = useRuntimeConfig()
  const db = useDB()

  const adminUserIds = config.adminUserIds?.split(',').map((id: string) => id.trim()).filter(Boolean) || []
  const isConfiguredAdmin = adminUserIds.includes(user.id)

  const dbUser = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, user.id))
    .get()

  if (!dbUser) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  if (isConfiguredAdmin && dbUser.role !== 'admin') {
    await db
      .update(tables.users)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(eq(tables.users.id, user.id))

    await setUserSession(event, {
      user: {
        ...user,
        role: 'admin'
      }
    })
  }

  const effectiveRole = isConfiguredAdmin ? 'admin' : dbUser.role
  if (effectiveRole !== 'admin') {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required'
    })
  }

  return {
    ...user,
    role: effectiveRole
  }
}
