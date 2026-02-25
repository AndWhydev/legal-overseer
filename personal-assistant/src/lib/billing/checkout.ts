import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential } from '@/lib/integrations/credentials'

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
// Tier -> Stripe price mapping
// ---------------------------------------------------------------------------

const TIER_PRICES: Record<string, { amount: number; name: string }> = {
  starter: { amount: 19900, name: 'BitBit Starter' },
  growth:  { amount: 34900, name: 'BitBit Growth' },
  scale:   { amount: 59900, name: 'BitBit Scale' },
}

const STRIPE_BASE = 'https://api.stripe.com/v1'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getStripeKey(client: SupabaseClient, orgId: string): Promise<string> {
  // Try org-level credentials first, fallback to env
  const creds = await getOrgCredential(client, orgId, 'stripe').catch(() => null) as { secret_key?: string } | null
  const key = creds?.secret_key ?? process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('No Stripe secret key configured')
  return key
}

async function stripeFetch<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Stripe ${res.status}: ${text}`)
  }
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Create checkout session
// ---------------------------------------------------------------------------

export async function createCheckoutSession(
  client: SupabaseClient,
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  const key = await getStripeKey(client, input.orgId)
  const tier = TIER_PRICES[input.tier]
  if (!tier) throw new Error(`Invalid tier: ${input.tier}`)

  // Create ad-hoc price for recurring subscription
  const priceParams = new URLSearchParams({
    unit_amount: String(tier.amount),
    currency: 'aud',
    'recurring[interval]': 'month',
    'product_data[name]': tier.name,
  })

  const price = await stripeFetch<{ id: string }>(key, '/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: priceParams.toString(),
  })

  // Create checkout session
  const sessionParams = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': price.id,
    'line_items[0][quantity]': '1',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    'subscription_data[metadata][org_id]': input.orgId,
    'subscription_data[metadata][tier]': input.tier,
  })

  if (input.customerEmail) {
    sessionParams.set('customer_email', input.customerEmail)
  }

  // 14-day free trial
  sessionParams.set('subscription_data[trial_period_days]', '14')

  const session = await stripeFetch<{ id: string; url: string }>(
    key,
    '/checkout/sessions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: sessionParams.toString(),
    },
  )

  return { sessionId: session.id, url: session.url }
}

// ---------------------------------------------------------------------------
// Process subscription webhook events
// ---------------------------------------------------------------------------

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
  const items = data.items as { data?: Array<{ price?: { id?: string } }> } | undefined

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

export async function handleSubscriptionEvent(
  client: SupabaseClient,
  event: SubscriptionEvent,
): Promise<void> {
  const orgId = event.tier !== 'unknown' ? undefined : undefined // resolved from metadata

  // Look up org by subscription metadata
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
      tier: event.tier,
      status: event.status,
      current_period_end: new Date(event.currentPeriodEnd * 1000).toISOString(),
    })

    // Update org plan
    if (targetOrgId) {
      await client
        .from('organisations')
        .update({ plan: event.tier })
        .eq('id', targetOrgId)
    }
  } else if (event.type === 'updated') {
    await client
      .from('subscriptions')
      .update({
        status: event.status,
        tier: event.tier,
        current_period_end: new Date(event.currentPeriodEnd * 1000).toISOString(),
      })
      .eq('stripe_subscription_id', event.subscriptionId)
  } else if (event.type === 'cancelled') {
    await client
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('stripe_subscription_id', event.subscriptionId)

    if (targetOrgId) {
      await client
        .from('organisations')
        .update({ plan: 'free', status: 'cancelled' })
        .eq('id', targetOrgId)
    }
  }
}
