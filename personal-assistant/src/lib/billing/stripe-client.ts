import Stripe from 'stripe'
import type { PlanName } from './plan-gates'

// ---------------------------------------------------------------------------
// Singleton Stripe SDK instance (lazy initialization)
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null

/**
 * Get the Stripe SDK singleton. Lazily initialized so tests and builds
 * don't fail when STRIPE_SECRET_KEY is absent.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(key, {
      apiVersion: '2025-03-31.basil' as Stripe.LatestApiVersion,
    })
  }
  return _stripe
}

/** Convenience export -- delegates to getStripe() */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// ---------------------------------------------------------------------------
// Trial configuration (single source of truth)
// ---------------------------------------------------------------------------

export const TRIAL_PERIOD_DAYS = 30

// ---------------------------------------------------------------------------
// Price <-> Tier mapping (env var based)
// ---------------------------------------------------------------------------

/**
 * Maps Stripe Price IDs (from env vars) to plan tier names.
 * Populated lazily from STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_SCALE.
 */
export function getPriceToTier(): Record<string, PlanName> {
  const map: Record<string, PlanName> = {}
  const starter = process.env.STRIPE_PRICE_STARTER
  const growth = process.env.STRIPE_PRICE_GROWTH
  const scale = process.env.STRIPE_PRICE_SCALE
  if (starter) map[starter] = 'starter'
  if (growth) map[growth] = 'growth'
  if (scale) map[scale] = 'scale'
  return map
}

/**
 * Maps tier names to Stripe Price IDs (from env vars).
 */
export function getTierToPrice(): Record<string, string> {
  const map: Record<string, string> = {}
  const starter = process.env.STRIPE_PRICE_STARTER
  const growth = process.env.STRIPE_PRICE_GROWTH
  const scale = process.env.STRIPE_PRICE_SCALE
  if (starter) map['starter'] = starter
  if (growth) map['growth'] = growth
  if (scale) map['scale'] = scale
  return map
}

/**
 * Resolve a price ID to a plan tier name.
 * Falls back to metadata tier if price not found in mapping.
 */
export function resolveTierFromPrice(priceId: string, fallback?: string): PlanName {
  const map = getPriceToTier()
  const tier = map[priceId]
  if (tier) return tier
  if (fallback && ['starter', 'growth', 'scale', 'free'].includes(fallback)) {
    return fallback as PlanName
  }
  return 'free'
}
