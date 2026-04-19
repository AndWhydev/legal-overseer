// `auth` is the legacy catch-all code produced by pre-2026-04-19 callers; keep
// it in the map so stale /login?error=auth links still render a sensible
// message.
export type LoginErrorCode =
  | 'auth'
  | 'callback_missing'
  | 'set_session'
  | 'exchange_code'
  | 'otp_verify'
  | 'no_user'
  | 'not_authenticated'
  | 'not_configured'
  | 'auth_failed'

export function buildLoginErrorRedirect(
  code: LoginErrorCode,
  reason?: string | null,
): string {
  const params = new URLSearchParams({ error: code })
  if (reason && reason.trim().length > 0) {
    params.set('reason', reason.slice(0, 240))
  }
  return `/login?${params.toString()}`
}

export const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  auth: "We couldn't finish signing you in. Try again.",
  callback_missing:
    "Your sign-in link didn't carry the expected tokens. Start again from the login screen.",
  set_session: "We couldn't start your session. Try signing in again.",
  exchange_code:
    "We couldn't verify your sign-in with the provider. Try again — if it keeps failing, clear cookies for this site.",
  otp_verify: 'That magic link has expired or was already used. Request a fresh one.',
  no_user: "We signed you in but couldn't load your account. Try again.",
  not_authenticated: 'You need to sign in to continue.',
  not_configured: 'Sign-in is temporarily unavailable. Please try again shortly.',
  auth_failed: "We couldn't finish signing you in. Try again.",
}

export function resolveLoginErrorMessage(code: string | null): string | null {
  if (!code) return null
  if (code in LOGIN_ERROR_MESSAGES) {
    return LOGIN_ERROR_MESSAGES[code as LoginErrorCode]
  }
  return LOGIN_ERROR_MESSAGES.auth
}

/**
 * Clamp the `reason` query param before rendering it. Writers cap at 240
 * chars, but the page must not trust the URL — an attacker-crafted link
 * could otherwise push arbitrary text into the login error box.
 */
export function sanitizeLoginErrorReason(reason: string | null): string {
  if (!reason) return ''
  const trimmed = reason.trim()
  if (!trimmed) return ''
  return trimmed.slice(0, 240)
}
