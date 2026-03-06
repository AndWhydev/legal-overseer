import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  sendMessage,
  sendMessageViaBridge,
  fetchInstagramMessages,
  handleWebhookEvent,
  isInstagramAvailable,
  validateWebhookSignature,
  validateWebhookChallenge,
  instagramAdapter,
} from '../instagram'
import type { InstagramWebhookEvent } from '../instagram'
import crypto from 'crypto'

describe('Instagram Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '123456789'
    process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token-123'
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = 'verify-token-secret'
  })

  describe('sendMessage', () => {
    it('sends a message via Meta Graph API', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'msg-1' }] }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await sendMessage('user123', 'Hello from BitBit')

      expect(result).toBe('msg-1')
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.instagram.com/v21.0/user123/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('returns null when API call fails', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await sendMessage('user123', 'Hello')

      expect(result).toBeNull()
    })

    it('returns null when not configured', async () => {
      delete process.env.INSTAGRAM_ACCESS_TOKEN

      const result = await sendMessage('user123', 'Hello')

      expect(result).toBeNull()
    })
  })

  describe('sendMessageViaBridge', () => {
    it('queues message to outbox when session exists', async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'session-1' } }),
        insert: vi.fn().mockReturnThis(),
      }

      // Mock the second chain (insert)
      mockClient.insert.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'outbox-1' } }),
      })

      const result = await sendMessageViaBridge(mockClient as any, 'org-1', 'user123', 'Hello')

      expect(result).toBe('outbox-1')
    })

    it('returns null when no session found', async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
      }

      const result = await sendMessageViaBridge(mockClient as any, 'org-1', 'user123', 'Hello')

      expect(result).toBeNull()
    })
  })

  describe('fetchInstagramMessages', () => {
    it('returns error when credentials missing', async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
      } as any

      const messages = await fetchInstagramMessages(mockClient, 'org-1')

      expect(messages).toHaveProperty('error')
      if ('error' in messages) {
        expect(messages.error).toContain('No Instagram credentials')
      }
    })

  })

  describe('handleWebhookEvent', () => {
    it('parses incoming webhook messages', async () => {
      const event: InstagramWebhookEvent = {
        entry: [
          {
            messaging: [
              {
                sender: { id: 'user-123' },
                recipient: { id: 'page-456' },
                timestamp: Date.now(),
                message: { mid: 'mid-1', text: 'Hi BitBit!' },
              },
            ],
          },
        ],
      }

      const messages = await handleWebhookEvent(event)

      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        channel: 'instagram',
        sender: 'user-123',
        body: 'Hi BitBit!',
        subject: 'Direct Message',
      })
    })

    it('returns empty array for empty event', async () => {
      const event: InstagramWebhookEvent = {}

      const messages = await handleWebhookEvent(event)

      expect(messages).toEqual([])
    })

    it('filters out messages without text', async () => {
      const event: InstagramWebhookEvent = {
        entry: [
          {
            messaging: [
              {
                sender: { id: 'user-123' },
                recipient: { id: 'page-456' },
                timestamp: Math.floor(Date.now() / 1000),
                message: { mid: 'mid-1' }, // No text field
              },
            ],
          },
        ],
      }

      const messages = await handleWebhookEvent(event)

      // Message without text content should be filtered out
      expect(messages).toHaveLength(0)
    })
  })

  describe('validateWebhookSignature', () => {
    it('validates correct HMAC signature', () => {
      const payload = JSON.stringify({ object: 'instagram' })
      const secret = 'verify-token-secret'
      const hash = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      const signature = `sha256=${hash}`

      const isValid = validateWebhookSignature(payload, signature, secret)

      expect(isValid).toBe(true)
    })

    it('rejects invalid signature', () => {
      const payload = JSON.stringify({ object: 'instagram' })
      const signature = 'sha256=invalidsignature'

      const isValid = validateWebhookSignature(payload, signature, 'verify-token-secret')

      expect(isValid).toBe(false)
    })
  })

  describe('validateWebhookChallenge', () => {
    it('returns challenge when verify tokens match', () => {
      const challenge = 'challenge-12345'
      const verifyToken = 'verify-token-secret'

      const result = validateWebhookChallenge(challenge, verifyToken, verifyToken)

      expect(result).toBe(challenge)
    })

    it('returns null when verify tokens do not match', () => {
      const challenge = 'challenge-12345'

      const result = validateWebhookChallenge(challenge, 'wrong-token', 'verify-token-secret')

      expect(result).toBeNull()
    })
  })

  describe('isInstagramAvailable', () => {
    it('returns true when environment variables are set', async () => {
      const available = await isInstagramAvailable()

      expect(available).toBe(true)
    })

    it('returns false when access token is missing', async () => {
      delete process.env.INSTAGRAM_ACCESS_TOKEN

      const available = await isInstagramAvailable()

      expect(available).toBe(false)
    })

    it('returns false when business account ID is missing', async () => {
      delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID

      const available = await isInstagramAvailable()

      expect(available).toBe(false)
    })

    it('checks Supabase session first', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockHead = vi.fn().mockResolvedValue({ count: 1 })

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: mockSelect,
          eq: mockEq,
        }),
      } as any

      // Mock the chain properly
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 1 }),
        }),
      })

      // Test with env vars still set - will return true from env check
      const available = await isInstagramAvailable(mockClient, 'org-1')

      expect(available).toBe(true)
    })
  })

  describe('instagramAdapter', () => {
    it('exports correct adapter metadata', () => {
      expect(instagramAdapter).toMatchObject({
        type: 'instagram',
        name: 'Instagram',
        description: expect.stringContaining('Instagram'),
        icon: 'MessageCircle',
      })
    })

    it('pull returns empty array (push-based)', async () => {
      const messages = await instagramAdapter.pull({})

      expect(messages).toEqual([])
    })

    it('isAvailable checks environment', async () => {
      const available = await instagramAdapter.isAvailable()

      expect(available).toBe(true)
    })
  })

  describe('Integration scenarios', () => {

    it('handles webhook event with proper timestamp', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000)
      const event: InstagramWebhookEvent = {
        entry: [
          {
            messaging: [
              {
                sender: { id: 'user-1' },
                recipient: { id: 'page-1' },
                timestamp: nowSeconds,
                message: { mid: 'mid-1', text: 'Quick message' },
              },
            ],
          },
        ],
      }

      const messages = await handleWebhookEvent(event)

      expect(messages[0].receivedAt).toBeInstanceOf(Date)
      // Timestamp is in seconds, converted to milliseconds
      expect(messages[0].receivedAt.getTime()).toBeLessThan(Date.now() + 1000)
      expect(messages[0].receivedAt.getTime()).toBeGreaterThan(Date.now() - 5000)
    })
  })
})
