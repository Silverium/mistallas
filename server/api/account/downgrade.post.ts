import { eq } from 'drizzle-orm'
import { useValidatedBody, z } from 'h3-zod'
import { cancelSubscription } from '../../utils/stripe'
import { tables, useDB } from '../../utils/db'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const db = useDB()

  const input = await useValidatedBody(event, {
    targetTier: z.enum(['free', 'premium'])
  })

  // Fetch user from DB
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

  // Prevent downgrading to same tier or higher
  const tierOrder: Record<'free' | 'premium' | 'enterprise', number> = { free: 0, premium: 1, enterprise: 2 }
  if (tierOrder[input.targetTier as 'free' | 'premium' | 'enterprise'] >= tierOrder[dbUser.tier as 'free' | 'premium' | 'enterprise']) {
    throw createError({
      statusCode: 400,
      message: `Can only downgrade to a lower tier`
    })
  }

  // If has active subscription, cancel it
  if (dbUser.stripeSubscriptionId && dbUser.subscriptionStatus === 'active') {
    try {
      await cancelSubscription(dbUser.stripeSubscriptionId)
    }
    catch (error) {
      console.error('Error cancelling Stripe subscription:', error)
      throw createError({
        statusCode: 500,
        message: 'Failed to cancel subscription'
      })
    }
  }

  // Update user tier
  const updatedUser = await db
    .update(tables.users)
    .set({
      tier: input.targetTier as 'free' | 'premium',
      subscriptionStatus: null,
      stripeSubscriptionId: null,
      updatedAt: new Date()
    })
    .where(eq(tables.users.id, user.id))
    .returning()
    .get()

  return {
    tier: updatedUser.tier,
    message: `Successfully downgraded to ${input.targetTier} tier`
  }
})
