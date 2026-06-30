import { eq } from 'drizzle-orm'
import { requireAdminAccess } from '../../../utils/admin'
import { tables, useDB } from '../../../utils/db'

export default eventHandler(async (event) => {
  const user = await requireAdminAccess(event)
  const db = useDB()

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ statusCode: 400, message: 'Missing user ID' })
  }

  // Cannot delete own admin account
  if (userId === user.id) {
    throw createError({
      statusCode: 400,
      message: 'Cannot delete your own account'
    })
  }

  // Soft delete - set deletedAt timestamp
  const deletedUser = await db
    .update(tables.users)
    .set({ deletedAt: new Date() })
    .where(eq(tables.users.id, userId))
    .returning()
    .get()

  if (!deletedUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  return { message: 'User deleted successfully' }
})
