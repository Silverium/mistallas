import { eq } from 'drizzle-orm'
import { getUserPurchaseCount, getPurchaseLimit } from '../../utils/tiers'
import { tables, useDB } from '../../utils/db'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const config = useRuntimeConfig()
  const db = useDB()
  const adminUserIds = config.adminUserIds?.split(',').map((id: string) => id.trim()).filter(Boolean) || []
  const isConfiguredAdmin = adminUserIds.includes(user.id)

  // Fetch fresh user data from DB
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

  // Keep DB/session in sync with configured admin IDs
  let effectiveUser = dbUser
  if (isConfiguredAdmin && dbUser.role !== 'admin') {
    const promotedUser = await db
      .update(tables.users)
      .set({
        role: 'admin' as const,
        updatedAt: new Date()
      })
      .where(eq(tables.users.id, user.id))
      .returning()
      .get()

    if (promotedUser) {
      effectiveUser = promotedUser
      await setUserSession(event, {
        user: {
          ...user,
          role: 'admin'
        }
      })
    }
  }

  const purchaseCount = await getUserPurchaseCount(user.id)
  const limit = getPurchaseLimit(effectiveUser.tier as 'free' | 'premium' | 'enterprise')

  return {
    id: effectiveUser.id,
    tier: effectiveUser.tier,
    role: effectiveUser.role,
    loginProvider: effectiveUser.loginProvider,
    purchaseCount,
    limit,
    subscriptionStatus: effectiveUser.subscriptionStatus,
    createdAt: effectiveUser.createdAt,
    updatedAt: effectiveUser.updatedAt
  }
})
