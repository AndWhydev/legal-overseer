import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  normalizePhoneNumber,
  verifyWebhookSignature,
  receiveSMS,
  formatForSMS,
  sendSMS,
} from './sms'
import type { TelnyxWebhookPayload } from './sms'

// Mock fetch
global.fetch = vi.fn()

describe('SMS Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set environment variables
    process.env.TELNYX_API_KEY = 'test-api-key'
    process.env.TELNYX_MESSAGING_PROFILE_ID = 'test-profile-id'
    process.env.TELNYX_WEBHOOK_SECRET = 'test-webhook-secret'
    process.env.TELNYX_FROM_NUMBER = '+61412345678'
    // Phase 51 A2: outbound guard requires allowlisting in non-prod envs.
    process.env.SENDBLUE_DEV_ALLOWLIST = '+61412345678,+61498765432,+1234'
  })

  describe('normalizePhoneNumber', () => {
    it('should normalize Australian domestic format (0412345678)', () => {
      const result = normalizePhoneNumber('0412345678')
      expect(result).toBe('+61412345678')
    })

    it('should normalize international format with +61', () => {
      const result = normalizePhoneNumber('+61412345678')
      expect(result).toBe('+61412345678')
    })

    it('should normalize format with 61 prefix', () => {
      const result = normalizePhoneNumber('61412345678')
      expect(result).toBe('+61412345678')
    })

    it('should handle spaces and hyphens', () => {
      const result = normalizePhoneNumber('+61 412 345 678')
      expect(result).toBe('+61412345678')
    })

    it('should handle hyphens', () => {
      const result = normalizePhoneNumber('0412-345-678')
      expect(result).toBe('+61412345678')
    })

    it('should return null for invalid formats', () => {
      expect(normalizePhoneNumber('')).toBeNull()
      expect(normalizePhoneNumber('123')).toBeNull() // Too short
      expect(normalizePhoneNumber('abcdefghijklmnop')).toBeNull() // Too long
    })

    it('should use custom country code', () => {
      const result = normalizePhoneNumber('0123456789', '1')
      expect(result).toBe('+1123456789')
    })
  })

  describe('formatForSMS', () => {
    it('should remove markdown bold', () => {
      const result = formatForSMS('**bold text**')
      expect(result).toBe('bold text')
    })

    it('should remove markdown italic', () => {
      const result = formatForSMS('*italic text*')
      expect(result).toBe('italic text')
    })

    it('should remove markdown links', () => {
      const result = formatForSMS('[link text](https://example.com)')
      expect(result).toBe('link text')
    })

    it('should remove code blocks', () => {
      const result = formatForSMS('```\ncode block\n```')
      expect(result).toBe('')
    })

    it('should remove inline code', () => {
      const result = formatForSMS('Use `const x = 1` for variables')
      expect(result).toBe('Use const x = 1 for variables')
    })

    it('should remove headings', () => {
      const result = formatForSMS('# Heading 1\n## Heading 2\nContent')
      expect(result).toBe('Heading 1\nHeading 2\nContent')
    })

    it('should collapse multiple newlines', () => {
      const result = formatForSMS('Line 1\n\n\n\nLine 2')
      expect(result).toBe('Line 1\nLine 2')
    })

    it('should truncate long messages', () => {
      const longText = 'a'.repeat(500)
      const result = formatForSMS(longText, 3)
      expect(result.length).toBeLessThanOrEqual(480 + 3) // 3 segments * 160 + ellipsis
      expect(result).toContain('...')
    })

    it('should handle empty content', () => {
      expect(formatForSMS('')).toBe('')
    })

    it('should preserve plain text', () => {
      const text = 'This is plain text with no formatting.'
      const result = formatForSMS(text)
      expect(result).toBe(text)
    })
  })

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', async () => {
      const { generateKeyPairSync, sign } = await import('crypto')

      // Generate an Ed25519 key pair for testing
      const { publicKey, privateKey } = generateKeyPairSync('ed25519')

      // Export public key as base64 DER (SPKI) — this is what Telnyx provides
      const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' })
      const publicKeyBase64 = publicKeyDer.toString('base64')

      // Set the webhook secret to our test public key
      process.env.TELNYX_WEBHOOK_SECRET = publicKeyBase64

      const payload = 'test-payload'
      const timestamp = '1234567890'
      const signedPayload = `${timestamp}|${payload}`

      // Sign with the private key (Ed25519)
      const signature = sign(null, Buffer.from(signedPayload), privateKey)
      const signatureBase64 = signature.toString('base64')

      const result = await verifyWebhookSignature(payload, signatureBase64, timestamp)
      expect(result).toBe(true)
    })

    it('should reject invalid signature', async () => {
      // Set a valid-looking base64 public key so it doesn't bail on missing secret
      const { generateKeyPairSync } = await import('crypto')
      const { publicKey } = generateKeyPairSync('ed25519')
      const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' })
      process.env.TELNYX_WEBHOOK_SECRET = publicKeyDer.toString('base64')

      // Provide a random base64 string as signature — should fail verification
      const result = await verifyWebhookSignature('payload', Buffer.from('invalid').toString('base64'), '1234567890')
      expect(result).toBe(false)
    })

    it('should return false when webhook secret not configured', async () => {
      delete process.env.TELNYX_WEBHOOK_SECRET
      const result = await verifyWebhookSignature('payload', 'v1=hash', '1234567890')
      expect(result).toBe(false)
    })
  })

  describe('receiveSMS', () => {
    it('should parse valid inbound SMS', () => {
      const payload: TelnyxWebhookPayload = {
        data: {
          event_type: 'message.received',
          payload: {
            from: { phone_number: '+61412345678' },
            to: [{ phone_number: '+61487654321' }],
            text: 'Hello, World!',
          },
        },
      }

      const result = receiveSMS(payload)
      expect(result).not.toBeNull()
      expect(result?.from).toBe('+61412345678')
      expect(result?.to).toBe('+61487654321')
      expect(result?.text).toBe('Hello, World!')
      expect(result?.id).toBeDefined()
      expect(result?.timestamp).toBeInstanceOf(Date)
    })

    it('should return null for missing phone numbers', () => {
      const payload: TelnyxWebhookPayload = {
        data: {
          payload: {
            text: 'Hello',
          },
        },
      }

      const result = receiveSMS(payload)
      expect(result).toBeNull()
    })

    it('should return null for missing text', () => {
      const payload: TelnyxWebhookPayload = {
        data: {
          payload: {
            from: { phone_number: '+61412345678' },
            to: [{ phone_number: '+61487654321' }],
          },
        },
      }

      const result = receiveSMS(payload)
      expect(result).toBeNull()
    })

    it('should return null for empty payload', () => {
      const payload: TelnyxWebhookPayload = {}
      const result = receiveSMS(payload)
      expect(result).toBeNull()
    })
  })

  describe('sendSMS', () => {
    it('should send SMS successfully', async () => {
      const mockFetch = global.fetch as any
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 'msg-123',
          },
        }),
      })

      const result = await sendSMS('+61412345678', 'Test message')
      expect(result.success).toBe(true)
      expect(result.messageId).toBe('msg-123')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telnyx.com/v2/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        }),
      )
    })

    it('should fail when API key not configured', async () => {
      delete process.env.TELNYX_API_KEY
      const result = await sendSMS('+61412345678', 'Test message')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not configured')
    })

    it('should fail on invalid phone number', async () => {
      const result = await sendSMS('invalid-phone', 'Test message')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid phone number')
    })

    it('should fail on empty message', async () => {
      const result = await sendSMS('+61412345678', '')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Empty message')
    })

    it('should retry on 429 rate limit', async () => {
      const mockFetch = global.fetch as any
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Rate limited',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              id: 'msg-123',
            },
          }),
        })

      const result = await sendSMS('+61412345678', 'Test message', {
        maxRetries: 2,
        retryDelayMs: 10, // Short delay for testing
      })
      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should format message for SMS', async () => {
      const mockFetch = global.fetch as any
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 'msg-123',
          },
        }),
      })

      const markdownMsg = '**Bold** and *italic* [link](http://example.com)'
      await sendSMS('+61412345678', markdownMsg)

      const call = mockFetch.mock.calls[0]
      const body = JSON.parse(call[1].body)
      expect(body.text).not.toContain('**')
      expect(body.text).not.toContain('*')
      expect(body.text).not.toContain('[')
      expect(body.text).toContain('Bold')
    })

    it('should handle API errors', async () => {
      const mockFetch = global.fetch as any
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid parameters',
      })

      const result = await sendSMS('+61412345678', 'Test message', {
        maxRetries: 1,
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('400')
    })

    it('should normalize phone number', async () => {
      const mockFetch = global.fetch as any
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 'msg-123',
          },
        }),
      })

      // Test with Australian domestic format
      await sendSMS('0412345678', 'Test')

      const call = mockFetch.mock.calls[0]
      const body = JSON.parse(call[1].body)
      expect(body.to).toBe('+61412345678')
    })
  })
})
