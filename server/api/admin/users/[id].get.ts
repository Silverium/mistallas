import { eq } from 'drizzle-orm'
import { requireAdminAccess } from '@root/server/utils/admin'
import { tables, useDB } from '@root/server/utils/db'
import { getUserPurchaseCount } from '@root/server/utils/tiers'

export default eventHandler(async (event) => {
  await requireAdminAccess(event)
  const db = useDB()

  const rawUserId = getRouterParam(event, 'id')
  const userId = rawUserId ? decodeURIComponent(rawUserId) : ''
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
