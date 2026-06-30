import { eq } from 'drizzle-orm'
import { requireAdminAccess } from '../../../utils/admin'
import { tables, useDB } from '../../../utils/db'
import { getUserPurchaseCount } from '../../../utils/tiers'

export default eventHandler(async (event) => {
  await requireAdminAccess(event)
  const db = useDB()

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ statusCode: 400, message: 'Missing user ID' })
  }

  const user = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  return {
    ...user,
    purchaseCount: await getUserPurchaseCount(user.id)
  }
})
