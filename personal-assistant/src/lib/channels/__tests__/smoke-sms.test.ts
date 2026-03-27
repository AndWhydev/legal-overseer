/**
 * SMS (Telnyx) Channel Smoke Test
 *
 * Production verification test -- validates Telnyx API key, sends a test
 * SMS (if SMOKE_TEST_PHONE is set), and checks phone number normalization.
 * Gated behind SMOKE_TEST=1 env var so it never runs in CI without credentials.
 *
 * Required env vars:
 *   SMOKE_TEST=1
 *   TELNYX_API_KEY
 *   TELNYX_MESSAGING_PROFILE_ID (for send test)
 *   SMOKE_TEST_PHONE (optional -- phone number to receive test SMS)
 */
import { describe, it, expect } from 'vitest'
import { normalizePhoneNumber, sendSMS } from '../sms'

const SMOKE = Boolean(process.env.SMOKE_TEST)
const HAS_API_KEY = Boolean(process.env.TELNYX_API_KEY)
const HAS_SEND_TARGET = Boolean(process.env.SMOKE_TEST_PHONE)

describe.skipIf(!SMOKE)('SMS (Telnyx) Smoke Tests', () => {
  describe.skipIf(!HAS_API_KEY)('with live credentials', () => {
    it('Telnyx API key is valid', { timeout: 30_000 }, async () => {
      const start = Date.now()
      const res = await fetch(
        'https://api.telnyx.com/v2/messaging_profiles',
        {
          headers: {
            Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
            Accept: 'application/json',
          },
        },
      )
      const elapsed = Date.now() - start

      console.log(`[sms] API key validation: ${res.status} (${elapsed}ms)`)

      expect(res.status).toBe(200)

      const body = (await res.json()) as { data?: unknown[] }
      expect(body.data).toBeDefined()
      expect(Array.isArray(body.data)).toBe(true)
    })

    it.skipIf(!HAS_SEND_TARGET)('can send test SMS', { timeout: 30_000 }, async () => {
      const phone = process.env.SMOKE_TEST_PHONE!
      const start = Date.now()

      const result = await sendSMS(
        phone,
        `BitBit smoke test at ${new Date().toISOString()}`,
      )
      const elapsed = Date.now() - start

      console.log(
        `[sms] send test: success=${result.success}, messageId=${result.messageId || 'none'} (${elapsed}ms)`,
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.messageId).toBeDefined()
      }
    })
  })

  // Non-network baseline test -- always runs when SMOKE_TEST=1
  it('phone number normalization works', () => {
    // Australian domestic -> E.164
    expect(normalizePhoneNumber('0412345678')).toBe('+61412345678')

    // Already E.164
    expect(normalizePhoneNumber('+61412345678')).toBe('+61412345678')

    // With country code, no +
    expect(normalizePhoneNumber('61412345678')).toBe('+61412345678')

    // With spaces
    expect(normalizePhoneNumber('+61 412 345 678')).toBe('+61412345678')

    // Too short
    expect(normalizePhoneNumber('123')).toBeNull()

    // Empty
    expect(normalizePhoneNumber('')).toBeNull()
  })
})
