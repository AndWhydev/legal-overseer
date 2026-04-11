import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gmailAdapter } from './gmail'

type ImapMessage = {
  uid: number
  envelope?: {
    messageId?: string
    from?: Array<{ name?: string; address?: string }>
    subject?: string
    date?: Date
  }
  source?: Buffer
}

const imapState: { messages: ImapMessage[] } = { messages: [] }

const mockImapClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
  fetch: vi.fn().mockImplementation(() => {
    const messages = [...imapState.messages]
    return (async function* () {
      for (const message of messages) {
        yield message
      }
    })()
  }),
  logout: vi.fn().mockResolvedValue(undefined),
}

const ImapFlowMock = vi.fn(function MockImapFlow(this: unknown) {
  return mockImapClient
})

vi.mock('imapflow', () => ({
  ImapFlow: ImapFlowMock,
}))

describe('gmailAdapter', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    imapState.messages = []
    process.env = { ...originalEnv }
    delete process.env.GMAIL_ACCESS_TOKEN
    delete process.env.GMAIL_USER
    delete process.env.GMAIL_APP_PASSWORD
    delete process.env.GMAIL_MODE
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('prefers API path for oauth credential config and maps Gmail API message fields', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: 'm-1', threadId: 't-1' }] }),
    } as Response)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'm-1',
          threadId: 't-1',
          snippet: 'Hello from Gmail API',
          internalDate: String(new Date('2026-02-12T11:22:33.000Z').getTime()),
          payload: {
            headers: [
              { name: 'From', value: '"Alice Example" <alice@example.com>' },
              { name: 'Subject', value: 'API Subject' },
              { name: 'Date', value: 'Thu, 12 Feb 2026 11:22:33 +0000' },
              { name: 'Message-ID', value: '<api-1@example.com>' },
            ],
          },
        }),
    } as Response)

    const messages = await gmailAdapter.pull({
      oauth: { access_token: 'oauth-token-1' },
    })

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'gmail-api-m-1',
      channel: 'gmail',
      externalId: '<api-1@example.com>',
      sender: 'Alice Example',
      senderEmail: 'alice@example.com',
      subject: 'API Subject',
      body: 'Hello from Gmail API',
      priority: 'medium',
      isActionable: false,
      metadata: {
        gmailId: 'm-1',
        threadId: 't-1',
        messageId: '<api-1@example.com>',
        source: 'gmail-api',
      },
    })

    const { ImapFlow } = await import('imapflow')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: 'Bearer oauth-token-1',
      }),
    })
    expect(ImapFlow).not.toHaveBeenCalled()
  })

  it('does not fall back to IMAP when mode is api and token is missing', async () => {
    imapState.messages = [
      {
        uid: 1,
        envelope: {
          messageId: 'imap-msg-1',
          from: [{ name: 'IMAP User', address: 'imap@example.com' }],
          subject: 'IMAP Subject',
          date: new Date('2026-02-15T08:00:00.000Z'),
        },
        source: Buffer.from('Header: value\r\n\r\nIMAP body'),
      },
    ]

    const messages = await gmailAdapter.pull({
      mode: 'api',
      user: 'local@example.com',
      appPassword: 'app-pass',
    })

    const { ImapFlow } = await import('imapflow')
    expect(messages).toEqual([])
    expect(ImapFlow).not.toHaveBeenCalled()
  })

  it('falls back to IMAP in auto mode when API token is not configured', async () => {
    imapState.messages = [
      {
        uid: 22,
        envelope: {
          messageId: 'imap-msg-22',
          from: [{ name: 'Fallback User', address: 'fallback@example.com' }],
          subject: 'Fallback Subject',
          date: new Date('2026-02-16T01:02:03.000Z'),
        },
        source: Buffer.from('Header: value\r\n\r\nFallback body content'),
      },
    ]

    const messages = await gmailAdapter.pull(
      {
        mode: 'auto',
        user: 'local@example.com',
        appPassword: 'app-pass',
      },
      undefined,
      { maxMessages: 1 },
    )

    const { ImapFlow } = await import('imapflow')
    expect(ImapFlow).toHaveBeenCalledTimes(1)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'gmail-22',
      channel: 'gmail',
      externalId: 'imap-msg-22',
      sender: 'Fallback User',
      senderEmail: 'fallback@example.com',
      subject: 'Fallback Subject',
      body: 'Fallback body content',
      metadata: expect.objectContaining({
        source: 'gmail-imap',
      }),
    })
  })
})
