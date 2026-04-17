import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { normalizePhone, sendTypingIndicator, sendSendblueMessage, isSendblueConfigured } from '../sendblue'

describe('sendblue', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SENDBLUE_API_KEY: 'test-key',
      SENDBLUE_API_SECRET: 'test-secret',
      SENDBLUE_FROM_NUMBER: '+15551234567',
      SENDBLUE_DEV_ALLOWLIST: '+1234,+14155551234,+61412345678',
    }
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => { process.env = originalEnv; vi.restoreAllMocks() })

  describe('normalizePhone', () => {
    it('passes through E.164', () => expect(normalizePhone('+14155551234')).toBe('+14155551234'))
    it('adds + prefix', () => expect(normalizePhone('14155551234')).toBe('+14155551234'))
    it('strips formatting', () => expect(normalizePhone('+1 (415) 555-1234')).toBe('+14155551234'))
    it('converts AU 04xx to +61', () => expect(normalizePhone('+0412345678')).toBe('+61412345678'))
  })

  describe('sendTypingIndicator', () => {
    it('calls typing endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', mockFetch)
      await sendTypingIndicator('+14155551234')
      expect(mockFetch).toHaveBeenCalledWith('https://api.sendblue.co/api/send-typing-indicator', expect.objectContaining({ method: 'POST' }))
    })

    it('does not throw on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')))
      await expect(sendTypingIndicator('+1234')).resolves.toBeUndefined()
    })

    it('no-op when not configured', async () => {
      delete process.env.SENDBLUE_API_KEY
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)
      await sendTypingIndicator('+1234')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('sendSendblueMessage', () => {
    it('sends and returns success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ message_handle: 'msg-123', status: 'QUEUED' }) }))
      const r = await sendSendblueMessage('+1234', 'hello')
      expect(r.success).toBe(true)
      expect(r.messageId).toBe('msg-123')
    })

    it('includes media_url', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ message_handle: 'msg-456' }) })
      vi.stubGlobal('fetch', mockFetch)
      await sendSendblueMessage('+1234', '', { mediaUrl: 'https://cdn.example.com/photo.jpg' })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.media_url).toBe('https://cdn.example.com/photo.jpg')
    })

    it('returns error on API error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ error_message: 'Invalid number' }) }))
      const r = await sendSendblueMessage('+1234', 'test')
      expect(r.success).toBe(false)
      expect(r.error).toBe('Invalid number')
    })

    it('returns error when not configured', async () => {
      delete process.env.SENDBLUE_API_KEY
      const r = await sendSendblueMessage('+1234', 'test')
      expect(r.success).toBe(false)
    })

    it('truncates to 18996 chars', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ message_handle: 'msg-789' }) })
      vi.stubGlobal('fetch', mockFetch)
      await sendSendblueMessage('+1234', 'a'.repeat(20000))
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.content.length).toBe(18996)
    })
  })

  describe('isSendblueConfigured', () => {
    it('returns true when configured', () => expect(isSendblueConfigured()).toBe(true))
    it('returns false when missing key', () => { delete process.env.SENDBLUE_API_KEY; expect(isSendblueConfigured()).toBe(false) })
  })
})
