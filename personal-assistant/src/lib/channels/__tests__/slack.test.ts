import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import {
  sendSlackMessage,
  fetchSlackMessages,
  fetchSlackChannels,
  verifySlackSignature,
  handleSlackUrlChallenge,
  parseSlackWebhookEvent,
  slackAdapter,
} from '../slack'
import { createHmac } from 'crypto'

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const MOCK_BOT_TOKEN = 'xoxb-test-token-123'
const MOCK_SIGNING_SECRET = 'test-signing-secret'

function createMockSignature(body: string, timestamp: string, secret: string): string {
  const baseString = `v0:${timestamp}:${body}`
  const hmac = createHmac('sha256', secret)
  hmac.update(baseString)
  return `v0=${hmac.digest('hex')}`
}

// ---------------------------------------------------------------------------
// sendSlackMessage tests
// ---------------------------------------------------------------------------

describe('sendSlackMessage', () => {
  it('sends a message via Slack API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        ts: '1609459200.000100',
      }),
    }))

    process.env.SLACK_BOT_TOKEN = MOCK_BOT_TOKEN

    const result = await sendSlackMessage('C12345', 'Hello, Slack!')
    expect(result).toBe('1609459200.000100')

    const calls = (global.fetch as any).mock.calls
    expect(calls[0][0]).toContain('chat.postMessage')
    expect(calls[0][1].headers.Authorization).toBe(`Bearer ${MOCK_BOT_TOKEN}`)
  })

  it('returns null when API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: 'channel_not_found',
      }),
    }))

    process.env.SLACK_BOT_TOKEN = MOCK_BOT_TOKEN

    const result = await sendSlackMessage('invalid', 'Hello')
    expect(result).toBeNull()
  })

  it('returns null when token is missing', async () => {
    delete process.env.SLACK_BOT_TOKEN

    const result = await sendSlackMessage('C12345', 'Hello')
    expect(result).toBeNull()
  })

  it('handles network errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    process.env.SLACK_BOT_TOKEN = MOCK_BOT_TOKEN

    const result = await sendSlackMessage('C12345', 'Hello')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// fetchSlackMessages tests
// ---------------------------------------------------------------------------

describe('fetchSlackMessages', () => {
  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = MOCK_BOT_TOKEN
  })

  it('fetches messages from a channel', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          messages: [
            {
              type: 'message',
              user: 'U12345',
              text: 'Hello everyone!',
              ts: '1609459200.000100',
              channel: 'C12345',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          user: {
            id: 'U12345',
            name: 'alice',
            real_name: 'Alice Smith',
            profile: { email: 'alice@example.com' },
          },
        }),
      }))

    const result = await fetchSlackMessages(MOCK_BOT_TOKEN, 'C12345')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      channel: 'slack',
      sender: 'Alice Smith',
      senderEmail: 'alice@example.com',
      body: 'Hello everyone!',
      subject: '#C12345',
    })
  })

  it('returns empty array when no channel ID provided', async () => {
    const result = await fetchSlackMessages(MOCK_BOT_TOKEN)
    expect(result).toEqual([])
  })

  it('filters out bot messages without text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        messages: [
          {
            type: 'message',
            bot_id: 'B12345',
            subtype: 'bot_message',
            ts: '1609459200.000100',
            channel: 'C12345',
          },
        ],
      }),
    }))

    const result = await fetchSlackMessages(MOCK_BOT_TOKEN, 'C12345')
    expect(result).toHaveLength(0)
  })

  it('handles API errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: 'invalid_auth',
      }),
    }))

    const result = await fetchSlackMessages(MOCK_BOT_TOKEN, 'C12345')
    expect(result).toEqual([])
  })

  it('respects since parameter for pagination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        messages: [],
      }),
    }))

    const since = new Date('2021-01-01T00:00:00Z')
    await fetchSlackMessages(MOCK_BOT_TOKEN, 'C12345', since)

    const calls = (global.fetch as any).mock.calls
    const url = calls[0][0]
    expect(url).toContain('oldest=')
  })
})

// ---------------------------------------------------------------------------
// fetchSlackChannels tests
// ---------------------------------------------------------------------------

describe('fetchSlackChannels', () => {
  it('fetches list of channels', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        channels: [
          { id: 'C12345', name: 'general' },
          { id: 'C67890', name: 'random' },
        ],
      }),
    }))

    const result = await fetchSlackChannels(MOCK_BOT_TOKEN)

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 'C12345', name: 'general' })
  })

  it('returns empty array on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: 'invalid_auth',
      }),
    }))

    const result = await fetchSlackChannels(MOCK_BOT_TOKEN)
    expect(result).toEqual([])
  })

  it('handles network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failed')))

    const result = await fetchSlackChannels(MOCK_BOT_TOKEN)
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// verifySlackSignature tests
// ---------------------------------------------------------------------------

describe('verifySlackSignature', () => {
  it('verifies a valid signature with matching HMAC', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const body = '{"type":"event_callback"}'
    const baseString = `v0:${timestamp}:${body}`
    const hmac = createHmac('sha256', MOCK_SIGNING_SECRET)
    hmac.update(baseString)
    const signature = `v0=${hmac.digest('hex')}`

    const result = await verifySlackSignature(body, signature, MOCK_SIGNING_SECRET)
    expect(result).toBe(true)
  })

  it('rejects invalid signature', async () => {
    const body = '{"type":"event_callback"}'
    const invalidSignature = 'v0=invalid_hash'

    const result = await verifySlackSignature(body, invalidSignature, MOCK_SIGNING_SECRET)
    expect(result).toBe(false)
  })

  it('rejects invalid signature version', async () => {
    const body = '{"type":"event_callback"}'
    const signature = 'v1=somehash'

    const result = await verifySlackSignature(body, signature, MOCK_SIGNING_SECRET)
    expect(result).toBe(false)
  })

  it('handles errors gracefully', async () => {
    const result = await verifySlackSignature('', 'invalid', '')
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// handleSlackUrlChallenge tests
// ---------------------------------------------------------------------------

describe('handleSlackUrlChallenge', () => {
  it('returns challenge for url_verification event', () => {
    const payload = {
      type: 'url_verification',
      challenge: 'abc123xyz',
    }

    const result = handleSlackUrlChallenge(payload as any)
    expect(result).toEqual({ challenge: 'abc123xyz' })
  })

  it('returns null for non-verification events', () => {
    const payload = {
      type: 'event_callback',
      event: { type: 'message' },
    }

    const result = handleSlackUrlChallenge(payload as any)
    expect(result).toBeNull()
  })

  it('returns null when challenge is missing', () => {
    const payload = {
      type: 'url_verification',
    }

    const result = handleSlackUrlChallenge(payload as any)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseSlackWebhookEvent tests
// ---------------------------------------------------------------------------

describe('parseSlackWebhookEvent', () => {
  it('parses valid webhook payload', () => {
    const payload = {
      type: 'event_callback',
      event: {
        type: 'message',
        text: 'Hello',
        user: 'U12345',
        ts: '1609459200.000100',
      },
    }

    const result = parseSlackWebhookEvent(payload)
    expect(result).toEqual(payload)
  })

  it('returns null for invalid payload', () => {
    const result = parseSlackWebhookEvent(null)
    expect(result).toBeNull()

    const result2 = parseSlackWebhookEvent('not an object')
    expect(result2).toBeNull()
  })

  it('returns null for non-object payload', () => {
    const result = parseSlackWebhookEvent(123)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// slackAdapter tests
// ---------------------------------------------------------------------------

describe('slackAdapter', () => {
  beforeEach(() => {
    delete process.env.SLACK_BOT_TOKEN
    delete process.env.SLACK_SIGNING_SECRET
  })

  it('has correct metadata', () => {
    expect(slackAdapter.type).toBe('slack')
    expect(slackAdapter.name).toBe('Slack')
    expect(slackAdapter.icon).toBe('MessageSquare')
  })

  it('pull returns empty array (push-based)', async () => {
    const result = await slackAdapter.pull({})
    expect(result).toEqual([])
  })

  it('isAvailable returns false when not configured', async () => {
    const result = await slackAdapter.isAvailable()
    expect(result).toBe(false)
  })

  it('isAvailable returns true when configured', async () => {
    process.env.SLACK_BOT_TOKEN = MOCK_BOT_TOKEN
    process.env.SLACK_SIGNING_SECRET = MOCK_SIGNING_SECRET

    const result = await slackAdapter.isAvailable()
    expect(result).toBe(true)
  })

  it('isAvailable returns false when only bot token configured', async () => {
    process.env.SLACK_BOT_TOKEN = MOCK_BOT_TOKEN
    delete process.env.SLACK_SIGNING_SECRET

    const result = await slackAdapter.isAvailable()
    expect(result).toBe(false)
  })
})
