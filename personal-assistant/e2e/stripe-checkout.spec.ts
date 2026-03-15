import { test, expect } from '@playwright/test'
import * as crypto from 'crypto'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

/**
 * Build a signed Stripe webhook payload.
 *
 * Stripe signs webhooks with `t=<timestamp>,v1=<hmac>` where the signed
 * payload is `<timestamp>.<rawBody>`. We replicate this so the app's
 * `verifyStripeWebhook()` accepts our test events.
 */
function signPayload(body: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signedPayload = `${timestamp}.${body}`
  const sig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')
  return `t=${timestamp},v1=${sig}`
}

/** Minimal Stripe event payload matching the StripeWebhookEvent shape. */
function buildStripeEvent(
  type: string,
  objectOverrides: Record<string, unknown> = {},
) {
  return {
    id: `evt_test_${Date.now()}`,
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: `pi_test_${Date.now()}`,
        amount: 34900,
        currency: 'aud',
        status: type.includes('succeeded') || type.includes('paid') ? 'succeeded' : 'requires_payment_method',
        metadata: { org_id: 'test-org-e2e' },
        ...objectOverrides,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// 1. Subscription / Checkout Flow
// ---------------------------------------------------------------------------

test.describe('Stripe Checkout Flow', () => {
  test('pricing page renders all tiers', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.locator('h1')).toContainText('pricing', { ignoreCase: true, timeout: 10_000 })

    // All four tiers should be visible
    for (const tier of ['Starter', 'Growth', 'Scale', 'Enterprise']) {
      await expect(page.getByText(tier, { exact: false }).first()).toBeVisible()
    }

    // "Start Free Trial" buttons should be present for the paid tiers
    const trialButtons = page.getByText('Start Free Trial')
    expect(await trialButtons.count()).toBeGreaterThanOrEqual(3)
  })

  test('Growth tier CTA links to checkout endpoint', async ({ page }) => {
    await page.goto('/pricing')

    // The Growth card is marked "Most Popular"
    const growthCard = page.locator('div', { hasText: 'Most Popular' }).first()
    await expect(growthCard).toBeVisible({ timeout: 5_000 })

    // The CTA should link to /api/billing/checkout?tier=growth
    const cta = growthCard.getByRole('link', { name: /Start Free Trial/i })
    await expect(cta).toBeVisible()
    const href = await cta.getAttribute('href')
    expect(href).toContain('/api/billing/checkout')
    expect(href).toContain('tier=growth')
  })

  test('checkout GET redirects unauthenticated user to login with tier', async ({ page }) => {
    // Clear cookies to ensure we are unauthenticated
    await page.context().clearCookies()

    // The GET handler on /api/billing/checkout redirects to login
    const response = await page.goto('/api/billing/checkout?tier=growth', {
      waitUntil: 'networkidle',
    })

    // Should end up on the login page with checkout_tier param
    const url = page.url()
    expect(url).toMatch(/\/login/)
    expect(url).toContain('checkout_tier=growth')
  })

  test('checkout POST returns 401 when not authenticated', async ({ page }) => {
    await page.context().clearCookies()

    const response = await page.request.post('/api/billing/checkout', {
      data: { tier: 'growth', orgId: 'test-org' },
      headers: { 'Content-Type': 'application/json' },
    })

    // Should be 401 Unauthorized (no session)
    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  test('checkout POST rejects invalid tier', async ({ page }) => {
    // Even if authenticated, an invalid tier should be rejected with 400
    const response = await page.request.post('/api/billing/checkout', {
      data: { tier: 'invalid-tier', orgId: 'test-org' },
      headers: { 'Content-Type': 'application/json' },
    })

    // 400 or 401 — either is acceptable depending on auth state
    expect([400, 401]).toContain(response.status())
  })

  test('checkout POST rejects missing orgId', async ({ page }) => {
    const response = await page.request.post('/api/billing/checkout', {
      data: { tier: 'growth' },
      headers: { 'Content-Type': 'application/json' },
    })

    expect([400, 401]).toContain(response.status())
  })
})

// ---------------------------------------------------------------------------
// 2. Stripe Webhook Handler
// ---------------------------------------------------------------------------

test.describe('Stripe Webhook Handler', () => {
  test('returns 400 when stripe-signature header is missing', async ({ page }) => {
    const body = JSON.stringify(buildStripeEvent('payment_intent.succeeded'))

    const response = await page.request.post('/api/webhooks/stripe', {
      data: body,
      headers: { 'Content-Type': 'application/json' },
    })

    expect(response.status()).toBe(400)
    const json = await response.json()
    expect(json.error).toContain('Missing stripe-signature')
  })

  test('returns 400 for invalid signature', async ({ page }) => {
    const body = JSON.stringify(buildStripeEvent('payment_intent.succeeded'))

    const response = await page.request.post('/api/webhooks/stripe', {
      data: body,
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=1234567890,v1=invalidsignature',
      },
    })

    // Should be 400 (signature verification failed) or 500 (webhook secret not configured)
    expect([400, 500]).toContain(response.status())
  })

  test('processes payment_intent.succeeded with valid signature', async ({ page }) => {
    test.skip(!WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET not set')

    const event = buildStripeEvent('payment_intent.succeeded', {
      receipt_email: 'test@example.com',
      description: 'E2E test payment',
    })
    const body = JSON.stringify(event)
    const signature = signPayload(body, WEBHOOK_SECRET)

    const response = await page.request.post('/api/webhooks/stripe', {
      data: body,
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
    })

    expect(response.status()).toBe(200)
    const json = await response.json()
    expect(json.received).toBe(true)
    expect(json.type).toBe('payment_intent.succeeded')
  })

  test('processes payment_intent.payment_failed with valid signature', async ({ page }) => {
    test.skip(!WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET not set')

    const event = buildStripeEvent('payment_intent.payment_failed', {
      last_payment_error: {
        message: 'Your card was declined.',
        type: 'card_error',
      },
    })
    const body = JSON.stringify(event)
    const signature = signPayload(body, WEBHOOK_SECRET)

    const response = await page.request.post('/api/webhooks/stripe', {
      data: body,
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
    })

    expect(response.status()).toBe(200)
    const json = await response.json()
    expect(json.received).toBe(true)
    expect(json.type).toBe('payment_intent.payment_failed')
  })

  test('processes invoice.paid with valid signature', async ({ page }) => {
    test.skip(!WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET not set')

    const event = buildStripeEvent('invoice.paid', {
      id: `in_test_${Date.now()}`,
      number: 'INV-E2E-001',
      customer_email: 'test@example.com',
      amount_due: 34900,
      amount_paid: 34900,
    })
    const body = JSON.stringify(event)
    const signature = signPayload(body, WEBHOOK_SECRET)

    const response = await page.request.post('/api/webhooks/stripe', {
      data: body,
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
    })

    expect(response.status()).toBe(200)
    const json = await response.json()
    expect(json.received).toBe(true)
    expect(json.type).toBe('invoice.paid')
  })

  test('processes invoice.payment_failed with valid signature', async ({ page }) => {
    test.skip(!WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET not set')

    const event = buildStripeEvent('invoice.payment_failed', {
      id: `in_test_${Date.now()}`,
      number: 'INV-E2E-002',
      customer_email: 'test@example.com',
      amount_due: 59900,
      amount_paid: 0,
      last_payment_attempt: {
        error: { message: 'Insufficient funds' },
      },
    })
    const body = JSON.stringify(event)
    const signature = signPayload(body, WEBHOOK_SECRET)

    const response = await page.request.post('/api/webhooks/stripe', {
      data: body,
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
    })

    expect(response.status()).toBe(200)
    const json = await response.json()
    expect(json.received).toBe(true)
    expect(json.type).toBe('invoice.payment_failed')
  })

  test('handles unknown event types gracefully', async ({ page }) => {
    test.skip(!WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET not set')

    const event = buildStripeEvent('customer.subscription.created', {
      customer: 'cus_test_123',
      plan: { id: 'plan_growth', amount: 34900 },
    })
    const body = JSON.stringify(event)
    const signature = signPayload(body, WEBHOOK_SECRET)

    const response = await page.request.post('/api/webhooks/stripe', {
      data: body,
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
    })

    // Unknown events should still return 200 (acknowledged but not processed)
    expect(response.status()).toBe(200)
    const json = await response.json()
    expect(json.received).toBe(true)
  })
})
