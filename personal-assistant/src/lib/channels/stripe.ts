import type { ChannelAdapter, ChannelMessage } from './types'

const STRIPE_API_BASE = 'https://api.stripe.com'

interface StripeEvent {
  id: string
  type: string
  created: number
  livemode: boolean
  data: {
    object: Record<string, unknown>
  }
  request?: {
    id: string | null
    idempotency_key: string | null
  }
}

interface StripeListResponse<T> {
  object: 'list'
  data: T[]
  has_more: boolean
  url: string
}

function getHeaders(): HeadersInit {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY env var not set')
  // Stripe uses HTTP Basic Auth with the secret key as the username
  const encoded = Buffer.from(`${key}:`).toString('base64')
  return {
    Authorization: `Basic ${encoded}`,
    Accept: 'application/json',
  }
}

function formatAmount(amount: number | undefined, currency: string | undefined): string {
  if (amount === undefined || !currency) return 'unknown amount'
  // Stripe amounts are in smallest currency unit (e.g. cents)
  const divisor = ['jpy', 'krw', 'vnd'].includes(currency.toLowerCase()) ? 1 : 100
  const formatted = (amount / divisor).toFixed(divisor === 1 ? 0 : 2)
  return `${currency.toUpperCase()} ${formatted}`
}

function describePiEvent(event: StripeEvent): { subject: string; body: string; priority: ChannelMessage['priority'] } {
  const obj = event.data.object as Record<string, unknown>
  const amount = formatAmount(obj.amount as number | undefined, obj.currency as string | undefined)
  const status = (obj.status as string | undefined) || 'unknown'
  const customerId = (obj.customer as string | undefined) || 'anonymous'
  const description = (obj.description as string | undefined) || ''

  const subject = `[Stripe] ${event.type} — ${amount}`
  const body = [
    `Event Type: ${event.type}`,
    `Amount: ${amount}`,
    `Status: ${status}`,
    `Customer: ${customerId}`,
    description ? `Description: ${description}` : null,
    `Event ID: ${event.id}`,
    `Created: ${new Date(event.created * 1000).toLocaleString()}`,
  ]
    .filter(Boolean)
    .join('\n')

  let priority: ChannelMessage['priority'] = 'medium'
  if (event.type === 'payment_intent.payment_failed') priority = 'high'
  if (event.type === 'payment_intent.succeeded') priority = 'low'

  return { subject, body, priority }
}

export const stripeAdapter: ChannelAdapter = {
  type: 'stripe',
  name: 'Stripe',
  description: 'Pull payment events from Stripe',
  icon: 'CreditCard',

  async pull(config, since) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) return []

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000)

    // Allow caller to override event types via config
    const eventTypes = (config.eventTypes as string[] | undefined) || [
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'payment_intent.created',
      'payment_intent.requires_action',
    ]

    try {
      const allEvents: StripeEvent[] = []

      for (const eventType of eventTypes) {
        const params = new URLSearchParams({
          type: eventType,
          'created[gte]': String(sinceTimestamp),
          limit: '100',
        })

        let url: string | null = `${STRIPE_API_BASE}/v1/events?${params.toString()}`

        while (url) {
          const res = await fetch(url, { headers: getHeaders() })
          if (!res.ok) {
            const text = await res.text()
            throw new Error(`Stripe GET /v1/events failed: ${res.status} ${text}`)
          }
          const json: StripeListResponse<StripeEvent> = await res.json()
          allEvents.push(...json.data)

          if (json.has_more && json.data.length > 0) {
            const lastId = json.data[json.data.length - 1].id
            const nextParams = new URLSearchParams(params)
            nextParams.set('starting_after', lastId)
            url = `${STRIPE_API_BASE}/v1/events?${nextParams.toString()}`
          } else {
            url = null
          }
        }
      }

      // Sort by created desc
      allEvents.sort((a, b) => b.created - a.created)

      return allEvents.map((event): ChannelMessage => {
        const { subject, body, priority } = describePiEvent(event)
        const obj = event.data.object as Record<string, unknown>

        return {
          id: `stripe-${event.id}`,
          channel: 'stripe',
          externalId: event.id,
          sender: 'Stripe',
          subject,
          body,
          receivedAt: new Date(event.created * 1000),
          isActionable: event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.requires_action',
          priority,
          metadata: {
            eventType: event.type,
            livemode: event.livemode,
            paymentIntentId: obj.id,
            amount: obj.amount,
            currency: obj.currency,
            status: obj.status,
            customerId: obj.customer,
          },
        }
      })
    } catch (err) {
      console.error('[stripe] pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(process.env.STRIPE_SECRET_KEY)
  },
}
