import { eq } from 'drizzle-orm'
import { useValidatedBody, z } from 'h3-zod'
import { createStripeCustomer, createCheckoutSession } from '@root/server/utils/stripe'
import { tables, useDB } from '@root/server/utils/db'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const db = useDB()

  const input = await useValidatedBody(event, {
    targetTier: z.enum(['premium', 'enterprise']),
    priceId: z.string().min(1)
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

  // Prevent upgrading to same tier
  if (dbUser.tier === input.targetTier) {
    throw createError({
      statusCode: 400,
      message: `Already on ${input.targetTier} tier`
    })
  }

  // Create or get Stripe customer
  let stripeCustomerId = dbUser.stripeCustomerId
  if (!stripeCustomerId) {
    // Need user email - get from OAuth provider info
    const userEmail = user.email || user.id
    stripeCustomerId = await createStripeCustomer(userEmail)
    // Update user with Stripe customer ID
    await db
      .update(tables.users)
      .set({ stripeCustomerId })
      .where(eq(tables.users.id, user.id))
  }

  // Create checkout session
  const baseUrl = `${event.node.req.protocol || 'http'}://${event.node.req.headers.host}`
  const checkoutUrl = await createCheckoutSession({
    customerId: stripeCustomerId,
    priceId: input.priceId,
    successUrl: `${baseUrl}/account?upgrade=success`,
    cancelUrl: `${baseUrl}/account?upgrade=cancelled`
  })

  return {
    redirectUrl: checkoutUrl
  }
})
