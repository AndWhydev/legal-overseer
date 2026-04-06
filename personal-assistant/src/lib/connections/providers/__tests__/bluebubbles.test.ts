import { describe, it, expect, vi, beforeEach } from 'vitest'
import { blueBubblesProvider } from '../bluebubbles'
import type { OrgConnection } from '../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockConnection(overrides?: Partial<OrgConnection['config']>): OrgConnection {
  return {
    id: 'conn-123',
    org_id: 'org-456',
    provider: 'imessage',
    display_name: 'iMessage',
    transport: 'webhook',
    capabilities: ['pull', 'send', 'webhook'],
    status: 'connected',
    template: null,
    bridge_token: null,
    webhook_secret: null,
    poll_interval: null,
    poll_cursor: null,
    last_sync_at: null,
    last_error: null,
    message_count: 0,
    config: {
      bb_server_url: 'https://bb.example.com',
      bb_password: 'secret123',
      ...overrides,
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function makeWebhookRequest(payload: unknown): Request {
  return new Request('https://bitbit.app/api/connections/conn-123/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

const BASE_WEBHOOK_PAYLOAD = {
  type: 'new-message',
  data: {
    guid: 'msg-guid-001',
    text: 'Hey there!',
    isFromMe: false,
    dateCreated: 1700000000000,
    handle: { address: '+61412345678', service: 'iMessage' },
    chats: [{ guid: 'iMessage;+;+61499999999', displayName: 'Alice' }],
    attachments: [],
  },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('blueBubblesProvider.webhookParse', () => {
  it('parses a new-message webhook into an Envelope with correct fields', async () => {
    const connection = mockConnection()
    const req = makeWebhookRequest(BASE_WEBHOOK_PAYLOAD)

    const envelopes = await blueBubblesProvider.webhookParse!(req, connection)

    expect(envelopes).toHaveLength(1)
    const env = envelopes[0]

    expect(env.provider).toBe('imessage')
    expect(env.transport).toBe('webhook')
    expect(env.connection_id).toBe('conn-123')
    expect(env.org_id).toBe('org-456')
    expect(env.dedup_key).toBe('msg-guid-001')
    expect(env.payload.body).toBe('Hey there!')
    expect(env.payload.sender?.name).toBe('Alice')
    expect(env.payload.sender?.phone).toBe('+61412345678')
    expect(env.payload.metadata?.chat_guid).toBe('iMessage;+;+61499999999')
    expect(env.payload.metadata?.bb_message_guid).toBe('msg-guid-001')
    expect(new Date(env.timestamp).getTime()).toBe(1700000000000)
  })

  it('ignores messages from self (isFromMe: true)', async () => {
    const connection = mockConnection()
    const payload = {
      ...BASE_WEBHOOK_PAYLOAD,
      data: { ...BASE_WEBHOOK_PAYLOAD.data, isFromMe: true },
    }
    const req = makeWebhookRequest(payload)

    const envelopes = await blueBubblesProvider.webhookParse!(req, connection)
    expect(envelopes).toHaveLength(0)
  })

  it('ignores non-message events (typing-indicator)', async () => {
    const connection = mockConnection()
    const payload = {
      type: 'typing-indicator',
      data: { ...BASE_WEBHOOK_PAYLOAD.data },
    }
    const req = makeWebhookRequest(payload)

    const envelopes = await blueBubblesProvider.webhookParse!(req, connection)
    expect(envelopes).toHaveLength(0)
  })

  it('handles messages with attachments', async () => {
    const connection = mockConnection()
    const payload = {
      ...BASE_WEBHOOK_PAYLOAD,
      data: {
        ...BASE_WEBHOOK_PAYLOAD.data,
        text: null,
        attachments: [
          {
            guid: 'att-guid-001',
            mimeType: 'image/jpeg',
            filePath: '/tmp/photo.jpg',
            transferName: 'photo.jpg',
          },
        ],
      },
    }
    const req = makeWebhookRequest(payload)

    const envelopes = await blueBubblesProvider.webhookParse!(req, connection)
    expect(envelopes).toHaveLength(1)

    const env = envelopes[0]
    expect(env.payload.attachments).toHaveLength(1)
    expect(env.payload.attachments![0].name).toBe('photo.jpg')
    expect(env.payload.attachments![0].mime).toBe('image/jpeg')
    expect(env.payload.attachments![0].url).toContain('/api/v1/attachment/att-guid-001')
    expect(env.payload.attachments![0].url).toContain('password=secret123')
    expect(env.payload.body).toBe('')
  })
})

describe('blueBubblesProvider.send', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls BlueBubbles REST API with correct endpoint and body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 200 }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    const connection = mockConnection()
    const envelope = {
      connection_id: 'conn-123',
      org_id: 'org-456',
      provider: 'imessage',
      transport: 'webhook' as const,
      dedup_key: 'msg-guid-001',
      timestamp: new Date().toISOString(),
      payload: {
        type: 'message' as const,
        body: 'Hello back!',
        metadata: {
          chat_guid: 'iMessage;+;+61499999999',
        },
      },
    }

    await blueBubblesProvider.send!(connection, envelope)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0]

    expect(url).toBe('https://bb.example.com/api/v1/message/text?password=secret123')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body)
    expect(body.chatGuid).toBe('iMessage;+;+61499999999')
    expect(body.message).toBe('Hello back!')
    expect(body.tempGuid).toMatch(/^bitbit-/)
  })
})

describe('blueBubblesProvider.healthCheck', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true when BlueBubbles responds with pong', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: 'pong' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    const connection = mockConnection()
    const result = await blueBubblesProvider.healthCheck!(connection)

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://bb.example.com/api/v1/ping?password=secret123',
    )
  })

  it('returns false on error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const connection = mockConnection()
    const result = await blueBubblesProvider.healthCheck!(connection)

    expect(result).toBe(false)
  })
})
