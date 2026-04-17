import { isPaidTier, type PaidTier } from './checkout'

const PENDING_TIER_KEY = 'bitbit.signup.tier'

/**
 * Signup flows that hand off to Supabase OAuth need to remember the selected
 * tier across the round-trip. We stash it in sessionStorage so the callback
 * page can resume checkout once the session is established.
 */
export function stashPendingTier(tier: PaidTier) {
  try {
    sessionStorage.setItem(PENDING_TIER_KEY, tier)
  } catch {
    // Storage failures are non-fatal — user can re-select on return.
  }
}

/** Read and clear the stashed tier. Returns null if absent or invalid. */
export function consumePendingTier(): PaidTier | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TIER_KEY)
    if (raw) sessionStorage.removeItem(PENDING_TIER_KEY)
    return isPaidTier(raw) ? raw : null
  } catch {
    return null
  }
}
