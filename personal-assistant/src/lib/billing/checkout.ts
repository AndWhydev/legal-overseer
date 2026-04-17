import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe, getTierToPrice, TRIAL_PERIOD_DAYS } from './stripe-client'

// ---------------------------------------------------------------------------
// Tier identity — single source of truth used by pricing page, signup page,
// Stripe checkout route, post-OAuth callback, and client-side validation.
// ---------------------------------------------------------------------------

export const PAID_TIERS = ['starter', 'growth', 'scale'] as const
export type PaidTier = (typeof PAID_TIERS)[number]

export function isPaidTier(value: unknown): value is PaidTier {
  return typeof value === 'string' && (PAID_TIERS as readonly string[]).includes(value)
}

/** Display metadata — pricing cards and signup CTAs both read from this. */
export const TIER_DISPLAY: Record<PaidTier, { name: string; priceMonthlyAUD: number; priceLabel: string }> = {
  starter: { name: 'Starter', priceMonthlyAUD: 199, priceLabel: '$199/mo' },
  growth: { name: 'Growth', priceMonthlyAUD: 349, priceLabel: '$349/mo' },
  scale: { name: 'Scale', priceMonthlyAUD: 599, priceLabel: '$599/mo' },
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckoutSessionInput {
  orgId: string
  tier: PaidTier
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

export async function createCheckoutSession(
  _client: SupabaseClient,
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  if (!isPaidTier(input.tier)) {
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
    // Surface Stripe's native promo-code field so invite codes (privately
    // distributed to high-intent prospects) can grant a 100%-off first month.
    allow_promotion_codes: true,
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
