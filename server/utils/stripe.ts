import Stripe from 'stripe'

let stripeClient: Stripe | null = null

function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = useRuntimeConfig().stripeSecretKey
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured')
    }
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2024-11-20'
    })
  }
  return stripeClient
}

export async function createStripeCustomer(email: string): Promise<string> {
  const stripe = getStripeClient()
  const customer = await stripe.customers.create({
    email
  })
  return customer.id
}

export async function createCheckoutSession(params: {
  customerId: string
  priceId: string
  successUrl: string
  cancelUrl: string
}): Promise<string> {
  const stripe = getStripeClient()
  const session = await stripe.checkout.sessions.create({
    customer: params.customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price: params.priceId,
        quantity: 1
      }
    ],
    mode: 'subscription',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl
  })

  if (!session.url) {
    throw new Error('Failed to create Stripe checkout session')
  }

  return session.url
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripeClient()
  await stripe.subscriptions.cancel(subscriptionId)
}

export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripeClient()
  return stripe.subscriptions.retrieve(subscriptionId)
}

export async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<Stripe.Event> {
  const stripe = getStripeClient()
  const webhookSecret = useRuntimeConfig().stripeWebhookSecret
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured')
  }
  return stripe.webhooks.constructEvent(body, signature, webhookSecret)
}
