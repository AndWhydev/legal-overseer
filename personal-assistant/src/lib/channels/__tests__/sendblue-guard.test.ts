import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { isRateLimited, isMediaUrlSafe, verifyWebhookKey } from '../sendblue-guard'

describe('sendblue-guard', () => {
  describe('isRateLimited', () => {
    it('allows first message', () => {
      expect(isRateLimited('+1unique1')).toBe(false)
    })

    it('allows burst of messages up to limit', () => {
      const phone = '+1burst' + Date.now()
      for (let i = 0; i < 9; i++) {
        expect(isRateLimited(phone)).toBe(false)
      }
    })

    it('blocks after exceeding burst limit', () => {
      const phone = '+1flood' + Date.now()
      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        isRateLimited(phone)
      }
      expect(isRateLimited(phone)).toBe(true)
    })
  })

  describe('isMediaUrlSafe', () => {
    it('allows HTTPS CDN URLs', () => {
      expect(isMediaUrlSafe('https://cdn.sendblue.co/media/voice.caf')).toBe(true)
    })

    it('allows HTTP URLs', () => {
      expect(isMediaUrlSafe('http://cdn.sendblue.co/media/photo.jpg')).toBe(true)
    })

    it('blocks localhost', () => {
      expect(isMediaUrlSafe('http://localhost:3000/secret')).toBe(false)
    })

    it('blocks private IPs', () => {
      expect(isMediaUrlSafe('http://10.0.0.1/internal')).toBe(false)
      expect(isMediaUrlSafe('http://192.168.1.1/admin')).toBe(false)
      expect(isMediaUrlSafe('http://172.16.0.1/api')).toBe(false)
      expect(isMediaUrlSafe('http://127.0.0.1/etc/passwd')).toBe(false)
    })

    it('blocks metadata endpoint', () => {
      expect(isMediaUrlSafe('http://169.254.169.254/latest/meta-data')).toBe(false)
    })

    it('blocks URLs with credentials', () => {
      expect(isMediaUrlSafe('https://user:pass@cdn.example.com/file')).toBe(false)
    })

    it('blocks non-HTTP protocols', () => {
      expect(isMediaUrlSafe('ftp://files.example.com/data')).toBe(false)
      expect(isMediaUrlSafe('file:///etc/passwd')).toBe(false)
    })

    it('returns false for invalid URLs', () => {
      expect(isMediaUrlSafe('not-a-url')).toBe(false)
    })
  })

  describe('verifyWebhookKey', () => {
    const originalEnv = process.env

    beforeEach(() => { process.env = { ...originalEnv } })
    afterEach(() => { process.env = originalEnv })

    it('allows when no key is configured', () => {
      delete process.env.SENDBLUE_WEBHOOK_SECRET
      expect(verifyWebhookKey(null)).toBe(true)
    })

    it('rejects when key is required but not provided', () => {
      process.env.SENDBLUE_WEBHOOK_SECRET = 'secret-key'
      expect(verifyWebhookKey(null)).toBe(false)
    })

    it('allows matching key', () => {
      process.env.SENDBLUE_WEBHOOK_SECRET = 'secret-key'
      expect(verifyWebhookKey('secret-key')).toBe(true)
    })

    it('rejects mismatched key', () => {
      process.env.SENDBLUE_WEBHOOK_SECRET = 'secret-key'
      expect(verifyWebhookKey('wrong-key')).toBe(false)
    })
  })
})
