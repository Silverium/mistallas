import { eq } from 'drizzle-orm'
import { verifyWebhookSignature } from '../../utils/stripe'
import { tables, useDB } from '../../utils/db'
import type Stripe from 'stripe'

export default eventHandler(async (event) => {
  // Get raw body for webhook signature verification
  const body = await readRawBody(event)
  if (!body) {
    throw createError({ statusCode: 400, message: 'Missing request body' })
  }

  const signature = getHeader(event, 'stripe-signature')
  if (!signature) {
    throw createError({ statusCode: 400, message: 'Missing stripe-signature header' })
  }

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = await verifyWebhookSignature(body, signature)
  }
  catch (error) {
    console.error('Webhook signature verification failed:', error)
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  const db = useDB()

  // Handle subscription events
  switch (stripeEvent.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = stripeEvent.data.object as unknown as Stripe.Subscription
      const customerId = subscription.customer as string

      // Find user by stripe customer ID
      const user = await db
        .select()
        .from(tables.users)
        .where(eq(tables.users.stripeCustomerId, customerId))
        .get()

      if (user) {
        // Determine tier from subscription price
        let tier: 'premium' | 'enterprise' = 'premium'
        const items = subscription.items?.data || []
        if (items.length > 0) {
          const priceId = items[0].price?.id
          // Map price ID to tier (you'll need to update this with actual price IDs)
          // For now, default to premium
          tier = priceId?.includes('enterprise') ? 'enterprise' : 'premium'
        }

        // Update user subscription info
        await db
          .update(tables.users)
          .set({
            stripeSubscriptionId: subscription.id,
            tier,
            subscriptionStatus: 'active' as 'active' | 'cancelled' | 'past_due',
            updatedAt: new Date()
          })
          .where(eq(tables.users.id, user.id))
      }
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = stripeEvent.data.object as unknown as Stripe.Subscription
      const customerId = subscription.customer as string

      // Find user by stripe customer ID
      const user = await db
        .select()
        .from(tables.users)
        .where(eq(tables.users.stripeCustomerId, customerId))
        .get()

      if (user) {
        // Downgrade to free tier
        await db
          .update(tables.users)
          .set({
            tier: 'free' as 'free' | 'premium' | 'enterprise',
            subscriptionStatus: 'cancelled' as 'active' | 'cancelled' | 'past_due',
            updatedAt: new Date()
          })
          .where(eq(tables.users.id, user.id))
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = stripeEvent.data.object as unknown as Stripe.Invoice
      const customerId = invoice.customer as string

      // Find user and mark subscription as past_due
      const user = await db
        .select()
        .from(tables.users)
        .where(eq(tables.users.stripeCustomerId, customerId))
        .get()

      if (user && user.stripeSubscriptionId) {
        await db
          .update(tables.users)
          .set({ subscriptionStatus: 'past_due' as 'active' | 'cancelled' | 'past_due' })
          .where(eq(tables.users.id, user.id))
      }
      break
    }

    default:
      console.log(`Unhandled Stripe event type: ${stripeEvent.type}`)
  }

  // Return success response for Stripe
  return { received: true }
})
