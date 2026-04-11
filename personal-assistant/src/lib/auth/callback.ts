export type SupportedEmailOtpType =
  | 'email'
  | 'magiclink'
  | 'recovery'
  | 'invite'
  | 'email_change'
  | 'signup'

export type AuthCallbackPayload =
  | {
      kind: 'session_tokens'
      accessToken: string
      refreshToken: string
    }
  | {
      kind: 'exchange_code'
      code: string
    }
  | {
      kind: 'verify_token_hash'
      tokenHash: string
      type: SupportedEmailOtpType
      next: string
    }
  | {
      kind: 'none'
    }

const SUPPORTED_EMAIL_OTP_TYPES = new Set<SupportedEmailOtpType>([
  'email',
  'magiclink',
  'recovery',
  'invite',
  'email_change',
  'signup',
])

function toUrl(input: string | URL): URL {
  if (input instanceof URL) {
    return input
  }

  return new URL(input, 'https://app.bitbit.chat')
}

export function isSupportedEmailOtpType(value: string | null): value is SupportedEmailOtpType {
  if (!value) {
    return false
  }

  return SUPPORTED_EMAIL_OTP_TYPES.has(value as SupportedEmailOtpType)
}

export function resolveSafeAuthRedirect(next: string | null | undefined, origin: string): string {
  if (!next) {
    return '/dashboard'
  }

  if (next.startsWith('/')) {
    // Block path traversal via double-slash
    if (next.startsWith('//')) return '/dashboard'
    // Allow portal and dashboard paths
    return next
  }

  try {
    const parsedNext = new URL(next)
    if (parsedNext.origin === origin) {
      return `${parsedNext.pathname}${parsedNext.search}${parsedNext.hash}`
    }
  } catch {
    return '/dashboard'
  }

  return '/dashboard'
}

export function extractAuthCallbackPayload(input: string | URL): AuthCallbackPayload {
  const url = toUrl(input)
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)
  const searchParams = url.searchParams

  const accessToken = hashParams.get('access_token') ?? searchParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token') ?? searchParams.get('refresh_token')

  if (accessToken && refreshToken) {
    return {
      kind: 'session_tokens',
      accessToken,
      refreshToken,
    }
  }

  const code = searchParams.get('code')
  if (code) {
    return {
      kind: 'exchange_code',
      code,
    }
  }

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (tokenHash && isSupportedEmailOtpType(type)) {
    return {
      kind: 'verify_token_hash',
      tokenHash,
      type,
      next: resolveSafeAuthRedirect(searchParams.get('next'), url.origin),
    }
  }

  return { kind: 'none' }
}
