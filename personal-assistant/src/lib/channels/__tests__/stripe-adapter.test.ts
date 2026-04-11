import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  createStripePaymentLink,
  getStripePaymentStatus,
  listStripeInvoices,
  verifyStripeWebhook,
} from '../stripe'

vi.mock('@/lib/integrations/credentials', () => ({
  getOrgCredential: vi.fn(),
}))

import { getOrgCredential } from '@/lib/integrations/credentials'
const mockGetCreds = vi.mocked(getOrgCredential)

afterEach(() => vi.restoreAllMocks())

const MOCK_CREDS = { secret_key: 'sk_test_123', webhook_secret: 'whsec_test' }

describe('createStripePaymentLink', () => {
  it('returns error when no credentials', async () => {
    mockGetCreds.mockResolvedValue(null)
    const result = await createStripePaymentLink({} as any, 'org-1', 5000, 'Web dev', 'aud')
    expect(result).toHaveProperty('error')
  })

  it('creates price then payment link', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        // Create price
        return { ok: true, json: async () => ({ id: 'price_1' }) }
      }
      // Create payment link
      return { ok: true, json: async () => ({ id: 'plink_1', url: 'https://pay.stripe.com/c/pay_1', active: true }) }
    }))

    const result = await createStripePaymentLink({} as any, 'org-1', 5000, 'Web dev', 'aud')
    expect(result).toHaveProperty('url')
    expect((result as any).id).toBe('plink_1')
  })
})

describe('getStripePaymentStatus', () => {
  it('returns error when no credentials', async () => {
    mockGetCreds.mockResolvedValue(null)
    const result = await getStripePaymentStatus({} as any, 'org-1', 'pi_1')
    expect(result).toHaveProperty('error')
  })

  it('fetches payment intent status', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'pi_1',
        amount: 5000,
        currency: 'aud',
        status: 'succeeded',
        description: 'Web dev',
        created: 1709000000,
        receipt_email: 'client@test.com',
      }),
    }))

    const result = await getStripePaymentStatus({} as any, 'org-1', 'pi_1')
    expect(result).toHaveProperty('status', 'succeeded')
  })
})

describe('listStripeInvoices', () => {
  it('lists invoices from Stripe', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'in_1', number: 'INV-001', amount_due: 5000, amount_paid: 0, currency: 'aud', status: 'open' },
        ],
      }),
    }))

    const result = await listStripeInvoices({} as any, 'org-1')
    expect(Array.isArray(result)).toBe(true)
    expect((result as any[])[0].number).toBe('INV-001')
  })
})

describe('verifyStripeWebhook', () => {
  it('rejects invalid signature format', async () => {
    const result = await verifyStripeWebhook('{}', 'invalid-sig', 'whsec_test')
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('Invalid signature')
  })

  it('rejects mismatched signature', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const result = await verifyStripeWebhook('{}', `t=${timestamp},v1=badsig`, 'whsec_test')
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('Signature verification failed')
  })

  it('rejects expired timestamp', async () => {
    const crypto = await import('crypto')
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600) // 10 minutes ago
    const body = '{"id":"evt_1","type":"test"}'
    const payload = `${oldTimestamp}.${body}`
    const sig = crypto.createHmac('sha256', 'whsec_test').update(payload).digest('hex')

    const result = await verifyStripeWebhook(body, `t=${oldTimestamp},v1=${sig}`, 'whsec_test')
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('timestamp too old')
  })

  it('verifies valid webhook signature', async () => {
    const crypto = await import('crypto')
    const timestamp = String(Math.floor(Date.now() / 1000))
    const body = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} }, created: 1709000000, livemode: false })
    const payload = `${timestamp}.${body}`
    const sig = crypto.createHmac('sha256', 'whsec_test').update(payload).digest('hex')

    const result = await verifyStripeWebhook(body, `t=${timestamp},v1=${sig}`, 'whsec_test')
    expect(result).toHaveProperty('id', 'evt_1')
    expect(result).toHaveProperty('type', 'payment_intent.succeeded')
  })
})
