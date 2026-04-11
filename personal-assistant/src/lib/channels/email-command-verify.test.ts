import { describe, it, expect } from 'vitest'
import { verifyEmailWebhookSignature } from './email-command-verify'
import { createHmac } from 'crypto'

describe('verifyEmailWebhookSignature', () => {
  const secret = 'test-webhook-secret-123'

  it('returns true for valid HMAC signature', () => {
    const body = '{"sender":"test@example.com","subject":"[BitBit] test"}'
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyEmailWebhookSignature(body, `sha256=${signature}`, secret)).toBe(true)
  })

  it('returns true without sha256= prefix', () => {
    const body = 'test-body'
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyEmailWebhookSignature(body, signature, secret)).toBe(true)
  })

  it('returns false for invalid signature', () => {
    expect(verifyEmailWebhookSignature('body', 'sha256=0000000000000000000000000000000000000000000000000000000000000000', secret)).toBe(false)
  })

  it('returns false for missing signature', () => {
    expect(verifyEmailWebhookSignature('body', '', secret)).toBe(false)
  })

  it('returns false for missing secret', () => {
    expect(verifyEmailWebhookSignature('body', 'sha256=abc', '')).toBe(false)
  })
})
