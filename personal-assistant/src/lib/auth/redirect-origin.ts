/**
 * Resolve the canonical origin to use for Supabase OAuth and email-confirmation
 * redirect targets. Collapses dev, preview, and production hostnames to a
 * single known-good app origin so the callback page always runs under a host
 * that Supabase's allowlist trusts.
 */
export function resolveAuthRedirectOrigin(): string {
  if (typeof window === 'undefined') return 'https://app.bitbit.chat'
  const { hostname, origin } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) return origin
  if (hostname === 'app.bitbit.chat') return 'https://app.bitbit.chat'
  if (hostname === 'bitbit.chat' || hostname.endsWith('.bitbit.chat')) return 'https://app.bitbit.chat'
  return origin
}
