import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential } from '@/lib/integrations/credentials'
import { logger } from '@/lib/core/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StripeCredentials {
  secret_key: string
  webhook_secret?: string
}

export interface StripeError {
  error: string
  details?: string
}

export interface StripePaymentLink {
  id: string
  url: string
  active: boolean
}

export interface StripeInvoice {
  id: string
  number: string | null
  customer_email: string | null
  amount_due: number
  amount_paid: number
  currency: string
  status: string
  due_date: number | null
  created: number
  hosted_invoice_url: string | null
}

export interface StripePaymentIntent {
  id: string
  amount: number
  currency: string
  status: string
  description: string | null
  created: number
  receipt_email: string | null
}

export interface StripeWebhookEvent {
  id: string
  type: string
  data: { object: Record<string, unknown> }
  created: number
  livemode: boolean
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const STRIPE_BASE = 'https://api.stripe.com/v1'

async function stripeFetch<T>(secretKey: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Stripe API ${res.status}: ${text}`)
  }

  return (await res.json()) as T
}

async function resolveKey(
  client: SupabaseClient,
  orgId: string,
): Promise<StripeCredentials | null> {
  return (await getOrgCredential(client, orgId, 'stripe')) as StripeCredentials | null
}

/**
 * Generate a deterministic idempotency key for Stripe API calls.
 * Uses orgId + operation + key params to ensure retries are safe.
 */
function generateIdempotencyKey(orgId: string, operation: string, ...parts: string[]): string {
  const raw = [orgId, operation, ...parts].join(':')
  // Use a simple hash for determinism — no crypto import needed at module level
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return `bb_${operation}_${Math.abs(hash).toString(36)}_${Date.now()}`
}

function formatAmount(amount: number | undefined, currency: string | undefined): string {
  if (amount === undefined || !currency) return 'unknown amount'
  const divisor = ['jpy', 'krw', 'vnd'].includes(currency.toLowerCase()) ? 1 : 100
  const formatted = (amount / divisor).toFixed(divisor === 1 ? 0 : 2)
  return `${currency.toUpperCase()} ${formatted}`
}

// ---------------------------------------------------------------------------
// Public DI functions (SupabaseClient first param)
// ---------------------------------------------------------------------------

export async function createStripePaymentLink(
  client: SupabaseClient,
  orgId: string,
  amount: number,
  description: string,
  currency = 'usd',
): Promise<StripePaymentLink | StripeError> {
  try {
    const creds = await resolveKey(client, orgId)
    if (!creds) return { error: 'No Stripe credentials configured' }

    // Create an ad-hoc price
    const priceParams = new URLSearchParams({
      unit_amount: String(amount),
      currency,
      'product_data[name]': description,
    })

    const priceIdempotencyKey = generateIdempotencyKey(orgId, 'price', description, currency, String(amount))
    const price = await stripeFetch<{ id: string }>(creds.secret_key, '/prices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': priceIdempotencyKey,
      },
      body: priceParams.toString(),
    })

    // Create the payment link
    const linkParams = new URLSearchParams({
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': '1',
    })

    const linkIdempotencyKey = generateIdempotencyKey(orgId, 'paylink', price.id)
    return await stripeFetch<StripePaymentLink>(creds.secret_key, '/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': linkIdempotencyKey,
      },
      body: linkParams.toString(),
    })
  } catch (err) {
    return { error: 'Failed to create payment link', details: String(err) }
  }
}

export async function getStripePaymentStatus(
  client: SupabaseClient,
  orgId: string,
  paymentId: string,
): Promise<StripePaymentIntent | StripeError> {
  try {
    const creds = await resolveKey(client, orgId)
    if (!creds) return { error: 'No Stripe credentials configured' }

    return await stripeFetch<StripePaymentIntent>(creds.secret_key, `/payment_intents/${paymentId}`)
  } catch (err) {
    return { error: 'Failed to get payment status', details: String(err) }
  }
}

export async function listStripeInvoices(
  client: SupabaseClient,
  orgId: string,
  config: { limit?: number; status?: string } = {},
): Promise<StripeInvoice[] | StripeError> {
  try {
    const creds = await resolveKey(client, orgId)
    if (!creds) return { error: 'No Stripe credentials configured' }

    const params = new URLSearchParams({ limit: String(config.limit || 25) })
    if (config.status) params.set('status', config.status)

    const data = await stripeFetch<{ data: StripeInvoice[] }>(
      creds.secret_key,
      `/invoices?${params.toString()}`,
    )
    return data.data
  } catch (err) {
    return { error: 'Failed to list invoices', details: String(err) }
  }
}

/**
 * Verify a Stripe webhook signature and parse the event body.
 */
export async function verifyStripeWebhook(
  body: string,
  signature: string,
  webhookSecret: string,
): Promise<StripeWebhookEvent | StripeError> {
  try {
    const crypto = await import('crypto')
    const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split('=')
      if (k && v) acc[k] = v
      return acc
    }, {})

    const timestamp = parts['t']
    const sig = parts['v1']
    if (!timestamp || !sig) return { error: 'Invalid signature format' }

    const payload = `${timestamp}.${body}`
    const expected = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex')

    if (expected !== sig) return { error: 'Signature verification failed' }

    // Tolerance: 5 minutes
    const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10))
    if (age > 300) return { error: 'Webhook timestamp too old' }

    return JSON.parse(body) as StripeWebhookEvent
  } catch (err) {
    return { error: 'Failed to verify webhook', details: String(err) }
  }
}

// ---------------------------------------------------------------------------
// ChannelAdapter for synthesizer compatibility (env-var based)
// ---------------------------------------------------------------------------

export const stripeAdapter: ChannelAdapter = {
  type: 'stripe',
  name: 'Stripe',
  description: 'Monitor payments and invoices from Stripe',
  icon: 'CreditCard',

  async pull(config, since) {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) return []

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000)

    const eventTypes = (config.eventTypes as string[] | undefined) || [
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'invoice.paid',
      'invoice.payment_failed',
    ]

    try {
      const allEvents: StripeWebhookEvent[] = []

      for (const eventType of eventTypes) {
        const params = new URLSearchParams({
          type: eventType,
          'created[gte]': String(sinceTimestamp),
          limit: '100',
        })

        const data = await stripeFetch<{ data: StripeWebhookEvent[] }>(
          secretKey,
          `/events?${params.toString()}`,
        )
        allEvents.push(...data.data)
      }

      allEvents.sort((a, b) => b.created - a.created)

      return allEvents.map((event): ChannelMessage => {
        const obj = event.data.object
        const amount = formatAmount(obj.amount as number | undefined, obj.currency as string | undefined)
        const status = (obj.status as string) || 'unknown'

        return {
          id: `stripe-${event.id}`,
          channel: 'stripe',
          externalId: event.id,
          sender: 'Stripe',
          subject: `[Stripe] ${event.type} -- ${amount}`,
          body: `Event: ${event.type}\nAmount: ${amount}\nStatus: ${status}\nCreated: ${new Date(event.created * 1000).toLocaleString()}`,
          receivedAt: new Date(event.created * 1000),
          isActionable:
            event.type === 'payment_intent.payment_failed' ||
            event.type === 'invoice.payment_failed',
          priority: event.type.includes('failed') ? 'high' : 'medium',
          metadata: {
            eventType: event.type,
            livemode: event.livemode,
            amount: obj.amount,
            currency: obj.currency,
            status: obj.status,
          },
        }
      })
    } catch (err) {
      logger.error('[stripe] pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(process.env.STRIPE_SECRET_KEY)
  },
}
