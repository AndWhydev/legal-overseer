import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe, getTierToPrice, TRIAL_PERIOD_DAYS } from './stripe-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckoutSessionInput {
  orgId: string
  tier: 'starter' | 'growth' | 'scale'
  successUrl: string
  cancelUrl: string
  customerEmail?: string
}

export interface CheckoutSessionResult {
  sessionId: string
  url: string
}

export interface SubscriptionEvent {
  type: 'created' | 'updated' | 'cancelled'
  subscriptionId: string
  customerId: string
  status: string
  currentPeriodEnd: number
  priceId: string
  tier: string
}

// ---------------------------------------------------------------------------
// Create checkout session (Stripe SDK, pre-created prices)
// ---------------------------------------------------------------------------

const VALID_TIERS = new Set(['starter', 'growth', 'scale'])

export async function createCheckoutSession(
  _client: SupabaseClient,
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  if (!VALID_TIERS.has(input.tier)) {
    throw new Error(`Invalid tier: ${input.tier}`)
  }

  const tierToPrice = getTierToPrice()
  const priceId = tierToPrice[input.tier]
  if (!priceId) {
    throw new Error(
      `No Stripe Price ID configured for tier "${input.tier}". Set STRIPE_PRICE_${input.tier.toUpperCase()} env var.`,
    )
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    payment_method_collection: 'always',
    subscription_data: {
      trial_period_days: TRIAL_PERIOD_DAYS,
      metadata: {
        org_id: input.orgId,
        tier: input.tier,
      },
    },
    ...(input.customerEmail && { customer_email: input.customerEmail }),
  })

  return { sessionId: session.id, url: session.url! }
}

// ---------------------------------------------------------------------------
// Legacy subscription event helpers
// @deprecated Use subscription-handler.ts for new code paths.
// Kept for backwards compatibility during migration.
// ---------------------------------------------------------------------------

/**
 * @deprecated Use handleSubscriptionLifecycle from subscription-handler.ts instead.
 */
export function parseSubscriptionEvent(
  eventType: string,
  data: Record<string, unknown>,
): SubscriptionEvent | null {
  const typeMap: Record<string, SubscriptionEvent['type']> = {
    'customer.subscription.created': 'created',
    'customer.subscription.updated': 'updated',
    'customer.subscription.deleted': 'cancelled',
  }

  const mapped = typeMap[eventType]
  if (!mapped) return null

  const metadata = (data.metadata ?? {}) as Record<string, string>
  const items = data.items as
    | { data?: Array<{ price?: { id?: string } }> }
    | undefined

  return {
    type: mapped,
    subscriptionId: data.id as string,
    customerId: data.customer as string,
    status: data.status as string,
    currentPeriodEnd: data.current_period_end as number,
    priceId: items?.data?.[0]?.price?.id ?? '',
    tier: metadata.tier ?? 'unknown',
  }
}

/**
 * @deprecated Use handleSubscriptionLifecycle from subscription-handler.ts instead.
 */
export async function handleSubscriptionEvent(
  client: SupabaseClient,
  event: SubscriptionEvent,
): Promise<void> {
  const { data: sub } = await client
    .from('subscriptions')
    .select('org_id')
    .eq('stripe_subscription_id', event.subscriptionId)
    .maybeSingle()

  const targetOrgId = (sub?.org_id as string) ?? null

  if (event.type === 'created') {
    await client.from('subscriptions').upsert({
      stripe_subscription_id: event.subscriptionId,
      stripe_customer_id: event.customerId,
      org_id: targetOrgId,
      plan: event.tier,
      status: event.status,
      current_period_end: new Date(
        event.currentPeriodEnd * 1000,
      ).toISOString(),
    })

    if (targetOrgId) {
      await client
        .from('organizations')
        .update({ plan: event.tier })
        .eq('id', targetOrgId)
    }
  } else if (event.type === 'updated') {
    await client
      .from('subscriptions')
      .update({
        status: event.status,
        plan: event.tier,
        current_period_end: new Date(
          event.currentPeriodEnd * 1000,
        ).toISOString(),
      })
      .eq('stripe_subscription_id', event.subscriptionId)
  } else if (event.type === 'cancelled') {
    await client
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('stripe_subscription_id', event.subscriptionId)

    if (targetOrgId) {
      await client
        .from('organizations')
        .update({ plan: 'free' })
        .eq('id', targetOrgId)
    }
  }
}
