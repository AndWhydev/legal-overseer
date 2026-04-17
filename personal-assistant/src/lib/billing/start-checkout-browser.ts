import type { PaidTier } from './checkout'

export interface StartCheckoutResult {
  ok: boolean
  status: number
  /** Populated when `ok` is false and the caller wants to show it. */
  error?: string
}

/**
 * Kick off a Stripe checkout session from the browser and — on success —
 * navigate to the Stripe-hosted URL. The caller decides how to handle 401
 * (unauthenticated) and other failures via the result object.
 *
 * This is the single source of truth for client-side checkout initiation;
 * pricing, signup, and post-OAuth callback flows all go through here.
 */
export async function startCheckoutRedirect(tier: PaidTier): Promise<StartCheckoutResult> {
  let res: Response
  try {
    res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    })
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Network error' }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    return { ok: false, status: res.status, error: body.error }
  }

  const { url } = (await res.json()) as { url?: string }
  if (!url) return { ok: false, status: res.status, error: 'No checkout URL returned' }

  window.location.href = url
  return { ok: true, status: res.status }
}
