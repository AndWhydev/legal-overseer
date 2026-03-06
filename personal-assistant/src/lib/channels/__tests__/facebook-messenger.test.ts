import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import {
  sendMessage,
  sendMessageWithQuickReplies,
  verifyWebhook,
  parseWebhookEvent,
  getConversations,
  getFacebookMessengerConfig,
  isAvailable,
  facebookMessengerAdapter,
  type FacebookWebhookPayload,
  type FacebookConversation,
} from '../facebook-messenger'

// Mock fetch globally
vi.stubGlobal('fetch', vi.fn())

afterEach(() => {
  vi.clearAllMocks()
  delete process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN
  delete process.env.FACEBOOK_MESSENGER_VERIFY_TOKEN
  delete process.env.FACEBOOK_MESSENGER_BUSINESS_ACCOUNT_ID
})

describe('sendMessage', () => {
  it('returns null when not configured', async () => {
    const result = await sendMessage('123456', 'Hello')
    expect(result).toBeNull()
  })

  it('sends message via Graph API and returns message ID', async () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'test-token'

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ message_id: 'msg-123' }),
    } as any)

    const result = await sendMessage('user-123', 'Hello world')

    expect(result).toBe('msg-123')
    expect(fetch).toHaveBeenCalledWith(
      'https://graph.instagram.com/v19.0/me/messages',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('handles API error gracefully', async () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'test-token'

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
    } as any)

    const result = await sendMessage('user-123', 'Hello')
    expect(result).toBeNull()
  })

  it('handles network error gracefully', async () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'test-token'

    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const result = await sendMessage('user-123', 'Hello')
    expect(result).toBeNull()
  })

  it('returns null on error response from API', async () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'test-token'

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        error: { message: 'Invalid recipient', code: 100 },
      }),
    } as any)

    const result = await sendMessage('invalid-user', 'Hello')
    expect(result).toBeNull()
  })
})

describe('sendMessageWithQuickReplies', () => {
  it('sends structured message with quick replies', async () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'test-token'

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ message_id: 'msg-456' }),
    } as any)

    const quickReplies = [
      { title: 'Yes', payload: 'yes' },
      { title: 'No', payload: 'no' },
    ]

    const result = await sendMessageWithQuickReplies('user-123', 'Do you agree?', quickReplies)

    expect(result).toBe('msg-456')
    expect(fetch).toHaveBeenCalled()
    const callArgs = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(callArgs[1]?.body as string)
    expect(body.message.quick_replies).toHaveLength(2)
    expect(body.message.quick_replies[0].title).toBe('Yes')
  })

  it('returns null when not configured', async () => {
    const result = await sendMessageWithQuickReplies(
      'user-123',
      'Do you agree?',
      [{ title: 'Yes', payload: 'yes' }],
    )
    expect(result).toBeNull()
  })
})

describe('verifyWebhook', () => {
  it('returns challenge on valid verification', () => {
    process.env.FACEBOOK_MESSENGER_VERIFY_TOKEN = 'secret-verify-token'

    const challenge = verifyWebhook('secret-verify-token', 'subscribe', 'challenge-123')
    expect(challenge).toBe('challenge-123')
  })

  it('returns null on invalid token', () => {
    process.env.FACEBOOK_MESSENGER_VERIFY_TOKEN = 'secret-verify-token'

    const challenge = verifyWebhook('wrong-token', 'subscribe', 'challenge-123')
    expect(challenge).toBeNull()
  })

  it('returns null on invalid mode', () => {
    process.env.FACEBOOK_MESSENGER_VERIFY_TOKEN = 'secret-verify-token'

    const challenge = verifyWebhook('secret-verify-token', 'unsubscribe', 'challenge-123')
    expect(challenge).toBeNull()
  })

  it('returns null when not configured', () => {
    const challenge = verifyWebhook('some-token', 'subscribe', 'challenge-123')
    expect(challenge).toBeNull()
  })
})

describe('parseWebhookEvent', () => {
  it('parses incoming text message', () => {
    const payload: FacebookWebhookPayload = {
      object: 'page',
      entry: [
        {
          id: 'page-123',
          time: 1645000000000,
          messaging: [
            {
              sender: { id: 'user-456' },
              recipient: { id: 'page-123' },
              timestamp: 1645000000000,
              message: {
                mid: 'msg-789',
                text: 'Hello there!',
              },
            },
          ],
        },
      ],
    }

    const messages = parseWebhookEvent(payload)

    expect(messages).toHaveLength(1)
    expect(messages[0].sender).toBe('user-456')
    expect(messages[0].body).toBe('Hello there!')
    expect(messages[0].channel).toBe('facebook')
    expect(messages[0].id).toBe('fb-msg-789')
  })

  it('parses message with attachments', () => {
    const payload: FacebookWebhookPayload = {
      object: 'page',
      entry: [
        {
          id: 'page-123',
          time: 1645000000000,
          messaging: [
            {
              sender: { id: 'user-456' },
              recipient: { id: 'page-123' },
              timestamp: 1645000000000,
              message: {
                mid: 'msg-789',
                text: 'Check this out!',
                attachments: [
                  {
                    type: 'image',
                    payload: { url: 'https://example.com/image.jpg', title: 'My Photo' },
                  },
                ],
              },
            },
          ],
        },
      ],
    }

    const messages = parseWebhookEvent(payload)

    expect(messages).toHaveLength(1)
    expect(messages[0].body).toContain('Check this out!')
    expect(messages[0].body).toContain('[IMAGE]')
    expect(messages[0].metadata.attachmentCount).toBe(1)
  })

  it('skips messages without text or attachments', () => {
    const payload: FacebookWebhookPayload = {
      object: 'page',
      entry: [
        {
          id: 'page-123',
          time: 1645000000000,
          messaging: [
            {
              sender: { id: 'user-456' },
              recipient: { id: 'page-123' },
              timestamp: 1645000000000,
              message: {
                mid: 'msg-789',
              },
            },
          ],
        },
      ],
    }

    const messages = parseWebhookEvent(payload)
    expect(messages).toHaveLength(0)
  })

  it('ignores non-page objects', () => {
    const payload: FacebookWebhookPayload = {
      object: 'instagram',
      entry: [],
    }

    const messages = parseWebhookEvent(payload)
    expect(messages).toHaveLength(0)
  })

  it('handles multiple messages in one entry', () => {
    const payload: FacebookWebhookPayload = {
      object: 'page',
      entry: [
        {
          id: 'page-123',
          time: 1645000000000,
          messaging: [
            {
              sender: { id: 'user-456' },
              recipient: { id: 'page-123' },
              timestamp: 1645000000000,
              message: { mid: 'msg-1', text: 'First' },
            },
            {
              sender: { id: 'user-456' },
              recipient: { id: 'page-123' },
              timestamp: 1645000000001,
              message: { mid: 'msg-2', text: 'Second' },
            },
          ],
        },
      ],
    }

    const messages = parseWebhookEvent(payload)
    expect(messages).toHaveLength(2)
    expect(messages[0].body).toBe('First')
    expect(messages[1].body).toBe('Second')
  })
})

describe('getConversations', () => {
  it('returns empty array when not configured', async () => {
    const result = await getConversations()
    expect(result).toEqual([])
  })

  it('fetches conversations from Graph API', async () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'test-token'
    process.env.FACEBOOK_MESSENGER_BUSINESS_ACCOUNT_ID = 'biz-123'

    const mockConversations: FacebookConversation[] = [
      {
        id: 'conv-1',
        name: 'Chat with Alice',
        updated_time: '2026-02-25T10:00:00Z',
      },
    ]

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockConversations }),
    } as any)

    const result = await getConversations()

    expect(result).toEqual(mockConversations)
    expect(fetch).toHaveBeenCalledWith(
      'https://graph.instagram.com/v19.0/biz-123/conversations',
      expect.any(Object),
    )
  })

  it('returns empty array on API error', async () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'test-token'
    process.env.FACEBOOK_MESSENGER_BUSINESS_ACCOUNT_ID = 'biz-123'

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
    } as any)

    const result = await getConversations()
    expect(result).toEqual([])
  })

  it('returns empty array on network error', async () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'test-token'
    process.env.FACEBOOK_MESSENGER_BUSINESS_ACCOUNT_ID = 'biz-123'

    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const result = await getConversations()
    expect(result).toEqual([])
  })
})

describe('getFacebookMessengerConfig', () => {
  it('returns configured environment variables', () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'token-123'
    process.env.FACEBOOK_MESSENGER_VERIFY_TOKEN = 'verify-456'
    process.env.FACEBOOK_MESSENGER_BUSINESS_ACCOUNT_ID = 'biz-789'

    const config = getFacebookMessengerConfig()

    expect(config.pageAccessToken).toBe('token-123')
    expect(config.verifyToken).toBe('verify-456')
    expect(config.businessAccountId).toBe('biz-789')
  })

  it('returns undefined values when not configured', () => {
    const config = getFacebookMessengerConfig()

    expect(config.pageAccessToken).toBeUndefined()
    expect(config.verifyToken).toBeUndefined()
    expect(config.businessAccountId).toBeUndefined()
  })
})

describe('isAvailable', () => {
  it('returns true when both tokens are configured', async () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'token-123'
    process.env.FACEBOOK_MESSENGER_VERIFY_TOKEN = 'verify-456'

    const result = await isAvailable()
    expect(result).toBe(true)
  })

  it('returns false when page access token is missing', async () => {
    process.env.FACEBOOK_MESSENGER_VERIFY_TOKEN = 'verify-456'

    const result = await isAvailable()
    expect(result).toBe(false)
  })

  it('returns false when verify token is missing', async () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'token-123'

    const result = await isAvailable()
    expect(result).toBe(false)
  })

  it('returns false when neither token is configured', async () => {
    const result = await isAvailable()
    expect(result).toBe(false)
  })
})

describe('facebookMessengerAdapter', () => {
  it('has correct metadata', () => {
    expect(facebookMessengerAdapter.type).toBe('facebook')
    expect(facebookMessengerAdapter.name).toBe('Facebook Messenger')
    expect(facebookMessengerAdapter.description).toContain('Meta Graph API')
    expect(facebookMessengerAdapter.icon).toBe('MessageCircle')
  })

  it('pull method returns empty array', async () => {
    const result = await facebookMessengerAdapter.pull({})
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('isAvailable delegates to isAvailable function', async () => {
    process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN = 'token-123'
    process.env.FACEBOOK_MESSENGER_VERIFY_TOKEN = 'verify-456'

    const result = await facebookMessengerAdapter.isAvailable()
    expect(result).toBe(true)
  })
})
