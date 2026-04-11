import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock env vars
const MOCK_PRICES = {
  STRIPE_PRICE_STARTER: 'price_starter_123',
  STRIPE_PRICE_GROWTH: 'price_growth_456',
  STRIPE_PRICE_SCALE: 'price_scale_789',
  STRIPE_SECRET_KEY: 'sk_test_mock',
}

// Mock the stripe SDK before importing checkout
vi.mock('stripe', () => {
  const mockCheckoutCreate = vi.fn().mockResolvedValue({
    id: 'cs_test_session_123',
    url: 'https://checkout.stripe.com/pay/cs_test_session_123',
  })

  class MockStripe {
    checkout = {
      sessions: {
        create: mockCheckoutCreate,
      },
    }

    // expose mock for assertions
    static _mockCheckoutCreate = mockCheckoutCreate
  }

  return { default: MockStripe, __mockCheckoutCreate: mockCheckoutCreate }
})

beforeEach(async () => {
  for (const [key, value] of Object.entries(MOCK_PRICES)) {
    vi.stubEnv(key, value)
  }
  // Clear mock calls between tests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { __mockCheckoutCreate } = (await import('stripe')) as any
  ;(__mockCheckoutCreate as ReturnType<typeof vi.fn>).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

function createMockSupabase() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkout (rewritten)', () => {
  let createCheckoutSession: typeof import('./checkout').createCheckoutSession

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./checkout')
    createCheckoutSession = mod.createCheckoutSession
  })

  it('uses pre-created price ID from env var (not ad-hoc price creation)', async () => {
    const supabase = createMockSupabase()

    await createCheckoutSession(supabase, {
      orgId: 'org_123',
      tier: 'starter',
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
    })

    // Get the mock from the stripe module
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { __mockCheckoutCreate } = (await import('stripe')) as any
    const createCall = (__mockCheckoutCreate as ReturnType<typeof vi.fn>).mock.calls[0][0]

    // Should use price ID from env, not create ad-hoc price
    expect(createCall.line_items[0].price).toBe(MOCK_PRICES.STRIPE_PRICE_STARTER)
    expect(createCall.line_items[0].quantity).toBe(1)
  })

  it('sets trial_period_days to 30 (not 14)', async () => {
    const supabase = createMockSupabase()

    await createCheckoutSession(supabase, {
      orgId: 'org_123',
      tier: 'growth',
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { __mockCheckoutCreate } = (await import('stripe')) as any
    const createCall = (__mockCheckoutCreate as ReturnType<typeof vi.fn>).mock.calls[0][0]

    expect(createCall.subscription_data.trial_period_days).toBe(30)
  })

  it('sets payment_method_collection to always', async () => {
    const supabase = createMockSupabase()

    await createCheckoutSession(supabase, {
      orgId: 'org_123',
      tier: 'scale',
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { __mockCheckoutCreate } = (await import('stripe')) as any
    const createCall = (__mockCheckoutCreate as ReturnType<typeof vi.fn>).mock.calls[0][0]

    expect(createCall.payment_method_collection).toBe('always')
  })

  it('includes org_id and tier in subscription_data.metadata', async () => {
    const supabase = createMockSupabase()

    await createCheckoutSession(supabase, {
      orgId: 'org_456',
      tier: 'growth',
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { __mockCheckoutCreate } = (await import('stripe')) as any
    const createCall = (__mockCheckoutCreate as ReturnType<typeof vi.fn>).mock.calls[0][0]

    expect(createCall.subscription_data.metadata.org_id).toBe('org_456')
    expect(createCall.subscription_data.metadata.tier).toBe('growth')
  })

  it('throws on invalid tier', async () => {
    const supabase = createMockSupabase()

    await expect(
      createCheckoutSession(supabase, {
        orgId: 'org_123',
        tier: 'mega' as 'starter',
        successUrl: 'https://app.test/success',
        cancelUrl: 'https://app.test/cancel',
      }),
    ).rejects.toThrow()
  })
})
