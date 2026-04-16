/**
 * Sendblue SMS onboarding — stub.
 *
 * The sendblue webhook (`src/app/api/webhooks/sendblue/route.ts`) calls
 * `handleUnknownSender` when a message arrives from a number that does not
 * resolve to a known identity. The intended flow is email → OTP → link so
 * an unrecognised sender can self-onboard, but that flow has not been
 * implemented yet.
 *
 * This stub keeps the type-checker happy and preserves the webhook's
 * current fallback behaviour: returning `false` causes the caller to send
 * the "not set up for new numbers yet" reply rather than silently dropping
 * the message.
 *
 * When the onboarding flow is built, replace this with the real
 * implementation and remove the stub guard at the call site if needed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function handleUnknownSender(
  _supabase: SupabaseClient,
  _fromNumber: string,
  _content: string,
): Promise<boolean> {
  return false
}
