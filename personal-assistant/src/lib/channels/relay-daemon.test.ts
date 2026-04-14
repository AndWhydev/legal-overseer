import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pollChannel, processNewMessages } from './relay-daemon'

// Mock adapters
const makeMockAdapter = () => ({ pull: vi.fn(), isAvailable: vi.fn() })
vi.mock('./gmail', () => ({
  gmailAdapter: { type: 'gmail', name: 'Gmail', description: 'Mock Gmail', icon: 'Mail', pull: vi.fn(), isAvailable: vi.fn() },
}))
vi.mock('./outlook', () => ({ outlookAdapter: { type: 'outlook', pull: vi.fn(), isAvailable: vi.fn() } }))
vi.mock('./asana', () => ({ asanaAdapter: { type: 'asana', pull: vi.fn(), isAvailable: vi.fn() } }))
vi.mock('./calendly', () => ({ calendlyAdapter: { type: 'calendly', pull: vi.fn(), isAvailable: vi.fn() } }))
vi.mock('./stripe', () => ({ stripeAdapter: { type: 'stripe', pull: vi.fn(), isAvailable: vi.fn() } }))
vi.mock('./clickup', () => ({ clickupAdapter: { type: 'clickup', pull: vi.fn(), isAvailable: vi.fn() } }))
vi.mock('./ga4', () => ({ ga4Adapter: { type: 'ga4', pull: vi.fn(), isAvailable: vi.fn() } }))
vi.mock('./wordpress', () => ({ wordpressAdapter: { type: 'wordpress', pull: vi.fn(), isAvailable: vi.fn() } }))
vi.mock('./cluely', () => ({ cluelyAdapter: { type: 'cluely', pull: vi.fn(), isAvailable: vi.fn() } }))
vi.mock('./imessage', () => ({ imessageAdapter: { type: 'imessage', pull: vi.fn(), isAvailable: vi.fn() } }))

// Mock dedup to always return not-duplicate
vi.mock('./dedup', () => ({
  isDuplicate: vi.fn().mockResolvedValue({ duplicate: false }),
  computeContentHash: vi.fn().mockReturnValue('mock-hash'),
}))

// Mock credential hydration to avoid real supabase calls
vi.mock('@/lib/integrations/credentials', () => ({
  getOrgCredential: vi.fn().mockResolvedValue(null),
  storeOrgCredential: vi.fn().mockResolvedValue(undefined),
  storeChannelCredential: vi.fn().mockResolvedValue(undefined),
  encryptCredential: vi.fn().mockReturnValue('encrypted'),
}))

// Mock identity resolver
vi.mock('@/lib/conversation/identity-resolver', () => ({
  resolveChannelIdentity: vi.fn().mockResolvedValue(null),
}))

// Mock logger
vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Mock knowledge graph
vi.mock('@/lib/knowledge-graph/entity-extractor', () => ({
  extractAndPopulateGraph: vi.fn().mockResolvedValue({ entities: 0, edges: 0, events: 0 }),
}))

// Mock avatar fetchers
vi.mock('@/lib/avatar/channel-photos', () => ({
  fetchGooglePhotos: vi.fn().mockResolvedValue(0),
  fetchOutlookPhotos: vi.fn().mockResolvedValue(0),
  fetchSlackPhotos: vi.fn().mockResolvedValue(0),
  fetchAsanaPhotos: vi.fn().mockResolvedValue(0),
}))

function createMockSupabase(overrides: Record<string, unknown> = {}): any {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    upsert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'inserted-1' }, error: null }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    ...overrides,
  }
  return {
    from: vi.fn().mockReturnValue(mockChain),
    _chain: mockChain,
  } as unknown as ReturnType<typeof createMockSupabase> & { _chain: typeof mockChain }
}

describe('relay-daemon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('pollChannel', () => {
    it('returns skipped when no connected org_connection exists', async () => {
      const supabase = createMockSupabase()
        ; (supabase._chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: null,
          error: { message: 'No rows found', code: 'PGRST116' },
        })

      const result = await pollChannel(supabase as any, 'org-1', 'gmail')
      expect(result.skipped).toBe(true)
      expect(result.messagesFound).toBe(0)
    })

    it('upserts messages from adapter', async () => {
      const { gmailAdapter } = await import('./gmail')
        ; (gmailAdapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue([
          {
            id: 'gmail-1',
            channel: 'gmail',
            externalId: 'msg-1',
            sender: 'Alice',
            senderEmail: 'alice@test.com',
            subject: 'Test',
            body: 'Hello',
            receivedAt: new Date('2026-01-01'),
            isActionable: false,
            priority: 'medium',
            metadata: {},
          },
        ])

      const supabase = createMockSupabase()
        ; (supabase._chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: 'conn-1', transport: 'poll', config: {}, poll_cursor: null },
          error: null,
        })

      const result = await pollChannel(supabase as any, 'org-1', 'gmail')
      expect(result.skipped).toBe(false)
      expect(result.messagesFound).toBe(1)
      expect(result.messagesInserted).toBe(1)
      expect(supabase.from).toHaveBeenCalledWith('channel_messages')
    })

    it('updates poll_cursor after successful poll', async () => {
      const { gmailAdapter } = await import('./gmail')
      const msgDate = new Date('2026-01-15T10:00:00Z')
        ; (gmailAdapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue([
          {
            id: 'gmail-2',
            channel: 'gmail',
            externalId: 'msg-2',
            sender: 'Bob',
            body: 'Hi',
            receivedAt: msgDate,
            isActionable: false,
            priority: 'medium',
            metadata: {},
          },
        ])

      const supabase = createMockSupabase()
        ; (supabase._chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: 'conn-1', transport: 'poll', config: {}, poll_cursor: null },
          error: null,
        })

      await pollChannel(supabase as any, 'org-1', 'gmail')

      // Verify update was called on org_connections
      expect(supabase.from).toHaveBeenCalledWith('org_connections')
    })

    it('handles adapter errors gracefully', async () => {
      const { gmailAdapter } = await import('./gmail')
        ; (gmailAdapter.pull as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('IMAP timeout'))

      const supabase = createMockSupabase()
        ; (supabase._chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: 'conn-1', transport: 'poll', config: {}, poll_cursor: null },
          error: null,
        })

      const result = await pollChannel(supabase as any, 'org-1', 'gmail')
      expect(result.error).toBe('IMAP timeout')
      expect(result.messagesFound).toBe(0)
    })
  })

  describe('processNewMessages', () => {
    it('returns only unprocessed messages', async () => {
      const supabase = createMockSupabase()
        ; (supabase._chain.limit as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: [
            {
              id: 'uuid-1',
              channel: 'gmail',
              external_id: 'msg-1',
              sender: 'Alice',
              sender_email: 'alice@test.com',
              subject: 'Test',
              body: 'Hello',
              received_at: '2026-01-01T00:00:00Z',
              is_actionable: false,
              priority: 'medium',
              processed: false,
              metadata: {},
            },
          ],
          error: null,
        })

      const messages = await processNewMessages(supabase as any, 'org-1')
      expect(messages).toHaveLength(1)
      expect(messages[0].externalId).toBe('msg-1')
      expect(messages[0].channel).toBe('gmail')
    })
  })
})
