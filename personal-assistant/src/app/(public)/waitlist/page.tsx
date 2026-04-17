import { redirect } from 'next/navigation'

/**
 * Waitlist retired 2026-04-16.
 *
 * BitBit is now open-signup. Legacy waitlist URLs (including those carrying
 * ?invite=XXXX) redirect to /signup where the invite code — if any — is
 * applied at Stripe checkout as a promotion code.
 */
export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; code?: string; ref?: string; email?: string }>
}) {
  const params = await searchParams
  const code = params.invite ?? params.code
  const qs = new URLSearchParams()
  if (code) qs.set('code', code)
  // Beta invite emails include ?email= for prefill; preserve it across the
  // redirect so returning visitors don't retype their address.
  if (params.email) qs.set('email', params.email)
  if (params.ref) qs.set('ref', params.ref)
  redirect(`/signup${qs.toString() ? `?${qs.toString()}` : ''}`)
}
