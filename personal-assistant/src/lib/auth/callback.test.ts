import { describe, expect, it } from 'vitest'

import {
  extractAuthCallbackPayload,
  resolveSafeAuthRedirect,
} from './callback'

describe('extractAuthCallbackPayload', () => {
  it('reads session tokens from the URL hash', () => {
    const payload = extractAuthCallbackPayload(
      'https://app.bitbit.chat/callback#access_token=access-123&refresh_token=refresh-456',
    )

    expect(payload).toEqual({
      kind: 'session_tokens',
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
    })
  })

  it('reads an auth code from query params', () => {
    const payload = extractAuthCallbackPayload(
      'https://app.bitbit.chat/callback?code=pkce-code',
    )

    expect(payload).toEqual({
      kind: 'exchange_code',
      code: 'pkce-code',
    })
  })

  it('reads a token-hash verification callback and normalizes same-origin next URLs', () => {
    const payload = extractAuthCallbackPayload(
      'https://app.bitbit.chat/auth/confirm?token_hash=hash-123&type=email&next=https%3A%2F%2Fapp.bitbit.chat%2Fonboard',
    )

    expect(payload).toEqual({
      kind: 'verify_token_hash',
      tokenHash: 'hash-123',
      type: 'email',
      next: '/onboard',
    })
  })
})

describe('resolveSafeAuthRedirect', () => {
  it('allows relative paths', () => {
    expect(resolveSafeAuthRedirect('/dashboard', 'https://app.bitbit.chat')).toBe('/dashboard')
  })

  it('extracts a same-origin absolute path', () => {
    expect(
      resolveSafeAuthRedirect('https://app.bitbit.chat/onboard?step=workspace', 'https://app.bitbit.chat'),
    ).toBe('/onboard?step=workspace')
  })

  it('rejects external redirects', () => {
    expect(resolveSafeAuthRedirect('https://evil.example/phish', 'https://app.bitbit.chat')).toBe('/dashboard')
  })
})
