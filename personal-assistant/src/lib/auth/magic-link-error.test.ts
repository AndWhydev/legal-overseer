import { describe, expect, it } from 'vitest'

import { normalizeMagicLinkError } from './magic-link-error'

describe('normalizeMagicLinkError', () => {
  it('maps rate limit responses to a user-friendly cooldown message', () => {
    const result = normalizeMagicLinkError(
      429,
      '{"code":"over_email_send_rate_limit","msg":"rate limit exceeded"}',
      '3600',
    )

    expect(result).toEqual({
      status: 429,
      error: 'Too many sign-in emails have been requested. Please wait about 60 minutes and try again.',
      retryAfterSeconds: 3600,
    })
  })

  it('falls back to a generic send error for non-rate-limit failures', () => {
    const result = normalizeMagicLinkError(
      500,
      '{"message":"internal error"}',
      null,
    )

    expect(result).toEqual({
      status: 500,
      error: 'Failed to send sign-in email',
    })
  })
})
