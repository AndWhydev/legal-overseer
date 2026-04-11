import { describe, expect, it, vi, afterEach } from 'vitest'
import { fetchOutlookMessages, sendOutlookMessage, createOutlookWebhookSubscription } from '../outlook'

// Mock the credentials module
vi.mock('@/lib/integrations/credentials', () => ({
  getOrgCredential: vi.fn(),
}))

import { getOrgCredential } from '@/lib/integrations/credentials'

const mockGetCreds = vi.mocked(getOrgCredential)

const originalEnv = { ...process.env }

afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...originalEnv }
})

const MOCK_CREDS = {
  tenant_id: 'tenant-1',
  client_id: 'client-1',
  client_secret: 'secret-1',
  access_token: 'token-1',
}

describe('fetchOutlookMessages', () => {
  it('returns error when no credentials configured', async () => {
    mockGetCreds.mockResolvedValue(null)
    const supabase = {} as any

    const result = await fetchOutlookMessages(supabase, 'org-1')
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('No Outlook credentials')
  })

  it('fetches messages via Graph API and maps to ChannelMessage', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            id: 'msg-graph-1',
            conversationId: 'conv-1',
            sender: { emailAddress: { name: 'Alice', address: 'alice@example.com' } },
            subject: 'Project update',
            bodyPreview: 'Here is the latest...',
            body: { content: 'Here is the latest update on the project', contentType: 'Text' },
            receivedDateTime: '2026-02-25T10:00:00Z',
            isRead: false,
          },
        ],
      }),
    }))

    const supabase = {} as any
    const result = await fetchOutlookMessages(supabase, 'org-1')

    expect(Array.isArray(result)).toBe(true)
    const msgs = result as any[]
    expect(msgs).toHaveLength(1)
    expect(msgs[0].channel).toBe('outlook')
    expect(msgs[0].sender).toBe('Alice')
    expect(msgs[0].senderEmail).toBe('alice@example.com')
    expect(msgs[0].subject).toBe('Project update')
  })

  it('handles Graph API error gracefully', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const result = await fetchOutlookMessages({} as any, 'org-1')
    expect(result).toHaveProperty('error')
  })

  it('refreshes expired tokens using env-backed outlook oauth config', async () => {
    mockGetCreds.mockResolvedValue({
      access_token: 'expired-token',
      refresh_token: 'refresh-token',
      token_expires_at: '2025-01-01T00:00:00.000Z',
    })

    process.env.OUTLOOK_TENANT_ID = 'env-tenant'
    process.env.OUTLOOK_CLIENT_ID = 'env-client'
    process.env.OUTLOOK_CLIENT_SECRET = 'env-secret'

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'fresh-token',
          refresh_token: 'refresh-token-2',
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [],
        }),
      })

    vi.stubGlobal('fetch', fetchMock)

    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: eqMock,
      })),
    }))
    const supabase = {
      from: vi.fn(() => ({
        update: updateMock,
      })),
    } as any

    const result = await fetchOutlookMessages(supabase, 'org-1')

    expect(result).toEqual([])
    expect(fetchMock.mock.calls[0][0]).toContain('login.microsoftonline.com/env-tenant')
    expect(fetchMock.mock.calls[0][1].body.toString()).toContain('client_id=env-client')
    expect(updateMock).toHaveBeenCalled()
    expect(eqMock).toHaveBeenCalled()
  })
})

describe('sendOutlookMessage', () => {
  it('returns error when no credentials', async () => {
    mockGetCreds.mockResolvedValue(null)
    const result = await sendOutlookMessage({} as any, 'org-1', 'to@test.com', 'Subject', 'Body')
    expect(result).toHaveProperty('error')
  })

  it('sends message via Graph API', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    const result = await sendOutlookMessage({} as any, 'org-1', 'to@test.com', 'Hello', 'Body text')
    expect(result).toEqual({ success: true })
  })

  it('returns error on send failure', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' }))

    const result = await sendOutlookMessage({} as any, 'org-1', 'to@test.com', 'Hello', 'Body')
    expect(result).toHaveProperty('error')
  })
})

describe('createOutlookWebhookSubscription', () => {
  it('returns error when no credentials', async () => {
    mockGetCreds.mockResolvedValue(null)
    const result = await createOutlookWebhookSubscription({} as any, 'org-1', 'https://hook.example.com')
    expect(result).toHaveProperty('error')
  })

  it('creates subscription via Graph API', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'sub-1',
        resource: 'me/mailFolders/inbox/messages',
        expirationDateTime: '2026-02-28T10:00:00Z',
      }),
    }))

    const result = await createOutlookWebhookSubscription({} as any, 'org-1', 'https://hook.example.com')
    expect(result).toHaveProperty('id', 'sub-1')
  })
})
