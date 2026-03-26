import { createHmac, timingSafeEqual } from 'crypto'
import { createRequire } from 'module'

interface StripeEvent {
  id: string
  type: string
  data: { object: unknown }
  [key: string]: unknown
}

declare namespace Stripe {
  type Event = StripeEvent
}

interface StripeWebhookClient {
  webhooks: {
    constructEvent(payload: string, signature: string, secret: string): Stripe.Event
  }
}

type StripeConstructor = new (
  apiKey: string,
  config?: { apiVersion?: string },
) => StripeWebhookClient

let stripeConstructor: StripeConstructor | null = null
const require = createRequire(import.meta.url)

export class WebhookVerificationError extends Error {
  statusCode: 401

  constructor(message = 'Webhook signature verification failed') {
    super(message)
    this.name = 'WebhookVerificationError'
    this.statusCode = 401
  }
}

function getStripeClient(): StripeWebhookClient {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!stripeKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required')
  }

  if (!stripeConstructor) {
    const stripeModule = require('stripe') as StripeConstructor | { default: StripeConstructor }
    stripeConstructor = typeof stripeModule === 'function' ? stripeModule : stripeModule.default
  }

  // constructEvent is local signature verification and does not require API calls.
  return new stripeConstructor(stripeKey)
}

function normalizeHexSignature(signature: string): string {
  return signature.trim().replace(/^sha256=/i, '').toLowerCase()
}

function isHex(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value)
}

function safeCompareHex(expectedHex: string, providedHex: string): boolean {
  if (!isHex(expectedHex) || !isHex(providedHex)) {
    return false
  }

  const expected = Buffer.from(expectedHex, 'hex')
  const provided = Buffer.from(providedHex, 'hex')

  if (expected.length !== provided.length) {
    return false
  }

  return timingSafeEqual(expected, provided)
}

function parseCalendlySignature(signatureHeader: string): {
  timestamp: string | null
  signature: string
} {
  const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=')
    if (key && value) {
      acc[key.trim()] = value.trim()
    }
    return acc
  }, {})

  if (parts.t && parts.v1) {
    return {
      timestamp: parts.t,
      signature: normalizeHexSignature(parts.v1),
    }
  }

  return {
    timestamp: null,
    signature: normalizeHexSignature(signatureHeader),
  }
}

export function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): Stripe.Event {
  try {
    return getStripeClient().webhooks.constructEvent(payload, signature, secret)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe signature verification failed'
    throw new WebhookVerificationError(message)
  }
}

export function verifyAsanaSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  const provided = normalizeHexSignature(signature)
  return safeCompareHex(expected, provided)
}

export function verifyCalendlySignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const parsed = parseCalendlySignature(signature)
  const signedPayload = parsed.timestamp ? `${parsed.timestamp}.${payload}` : payload
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex')
  return safeCompareHex(expected, parsed.signature)
}
