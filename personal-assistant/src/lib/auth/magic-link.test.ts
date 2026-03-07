import { describe, expect, it } from 'vitest'

import { buildMagicLinkOtpRequest } from './magic-link'

describe('buildMagicLinkOtpRequest', () => {
  it('adds redirect_to as a query parameter', () => {
    const request = buildMagicLinkOtpRequest(
      'https://example.supabase.co',
      'person@example.com',
      'https://app.bitbit.chat/callback',
    )

    expect(request.url).toBe(
      'https://example.supabase.co/auth/v1/otp?redirect_to=https%3A%2F%2Fapp.bitbit.chat%2Fcallback',
    )
    expect(request.body).toEqual({
      email: 'person@example.com',
      create_user: false,
      data: {},
      gotrue_meta_security: {},
    })
  })

  it('omits redirect_to when no redirect is provided', () => {
    const request = buildMagicLinkOtpRequest(
      'https://example.supabase.co',
      'person@example.com',
    )

    expect(request.url).toBe('https://example.supabase.co/auth/v1/otp')
  })
})
